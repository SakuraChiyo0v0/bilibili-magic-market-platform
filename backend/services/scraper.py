import json
import time
import logging
import requests
import random
from sqlalchemy.orm import Session
from datetime import datetime
from models import Product, PriceHistory, SystemConfig, Listing
from database import SessionLocal
from state import ScraperState

from sqlalchemy.exc import IntegrityError

from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

class ScraperService:
    def __init__(self, db: Session):
        self.db = db
        self.headers = self._get_headers()
        self.payload_template = self._get_payload_template()
        self.current_category_id = None # Track current category for this run

    # ... (other methods) ...

    def check_listings_validity(self, goods_id):
        # Get all listings ordered by price
        listings = self.db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).all()

        # Only check top 5 cheapest listings to save resources
        listings_to_check = listings[:5]

        checked_count = 0
        removed_count = 0

        # Use product name for logging if available
        product = self.db.query(Product).filter(Product.goods_id == goods_id).first()
        name = product.name if product else str(goods_id)

        def check_single_listing(listing):
            is_valid = self.is_item_valid(listing.c2c_id, name)
            return listing, is_valid

        # Use ThreadPoolExecutor for concurrent checks
        # Limit max_workers to avoid overwhelming the server or getting banned
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_listing = {executor.submit(check_single_listing, listing): listing for listing in listings_to_check}

            for future in as_completed(future_to_listing):
                listing, is_valid = future.result()
                checked_count += 1
                if not is_valid:
                    # Need to merge back to session because objects from query might be detached or thread-local issues
                    # But here we are in the same thread context for db operations
                    self.db.delete(listing)
                    removed_count += 1

        if removed_count > 0:
            self.db.commit()
            # Update min_price
            min_listing = self.db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).first()
            product = self.db.query(Product).filter(Product.goods_id == goods_id).first()
            if product:
                if min_listing:
                    product.min_price = min_listing.price
                    product.link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={min_listing.c2c_id}&from=market_index"
                else:
                    # No listings left
                    pass
                self.db.commit()

        return {"checked": checked_count, "removed": removed_count}

    def process_item(self, item_data):
        # Check stop signal before processing each item
        if ScraperState.should_stop():
            return False # Return False if stopped

        try:
            c2c_id = str(item_data['c2cItemsId'])
            details = item_data.get('detailDtoList', [])

            if not details:
                return False

            first_detail = details[0]
            goods_id = first_detail['itemsId']
            name = first_detail['name']
            img = "https:" + first_detail['img']

            # Handle multi-item listings
            count = len(details)

            # Skip multi-item listings (bundles)
            if count > 1 or "等" in item_data.get('c2cItemsName', '') and "个商品" in item_data.get('c2cItemsName', ''):
                # logger.debug(f"Skipping bundle: {item_data.get('c2cItemsName', name)}")
                return False

            total_price = float(item_data['showPrice'])

            # Single item
            price = total_price
            market_price = float(item_data['showMarketPrice'])

            link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={c2c_id}&from=market_index"

            if goods_id == 0:
                return False # Skip blind box

            # 1. Upsert Product
            product = self.db.query(Product).filter(Product.goods_id == goods_id).first()

            # Get current category from payload template or random selection
            current_category = self.current_category_id or self.payload_template.get("categoryFilter", "2312")
            if not current_category or current_category == "ALL":
                 current_category = "2312"

            # Special handling for Fudai (Blind Box)
            # If the item type is 2 (Blind Box/Fudai), force category to fudai_cate_id
            if item_data.get('type') == 2:
                current_category = "fudai_cate_id"

            is_new = False
            is_price_changed = False

            if not product:
                try:
                    product = Product(
                        goods_id=goods_id,
                        name=name,
                        img=img,
                        market_price=market_price,
                        min_price=price, # Initial min price
                        category=current_category,
                        update_time=datetime.now()
                    )
                    self.db.add(product)
                    self.db.flush() # Try to flush to catch IntegrityError
                    is_new = True
                    logger.info(f"🆕 发现新商品: 『{name}』   ¥ {price:,.2f}")
                except IntegrityError:
                    self.db.rollback()
                    # Retry query, it should exist now
                    product = self.db.query(Product).filter(Product.goods_id == goods_id).first()
                    if not product:
                        # Should not happen
                        logger.error(f"Failed to recover from IntegrityError for goods_id {goods_id}")
                        return False
            else:
                # Update basic info
                product.update_time = datetime.now()
                # Update category if it was default or empty, OR if it's a Fudai (type 2)
                if not product.category or product.category == "2312" or item_data.get('type') == 2:
                     product.category = current_category
                # self.db.commit() # Defer commit

            # 2. Upsert Listing
            listing = self.db.query(Listing).filter(Listing.c2c_id == c2c_id).first()
            if not listing:
                listing = Listing(
                    c2c_id=c2c_id,
                    goods_id=goods_id,
                    price=price,
                    update_time=datetime.now()
                )
                self.db.add(listing)
                # self.db.commit() # Defer commit

                # Add History for new listing
                history = PriceHistory(goods_id=goods_id, price=price, c2c_id=c2c_id)
                self.db.add(history)
                # self.db.commit() # Defer commit
            else:
                if listing.price != price:
                    # Price changed for this specific listing (rare but possible)
                    listing.price = price
                    listing.update_time = datetime.now()
                    # self.db.commit() # Defer commit

                    # Add History
                    history = PriceHistory(goods_id=goods_id, price=price, c2c_id=c2c_id)
                    self.db.add(history)
                    # self.db.commit() # Defer commit
                else:
                    listing.update_time = datetime.now()
                    # self.db.commit() # Defer commit

            # 3. Update Product min_price and link
            # Find the true minimum price from all active listings
            self.db.flush() # Ensure previous adds are visible
            min_listing = self.db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).first()
            if min_listing:
                old_price = product.min_price
                new_price = min_listing.price

                # Always update link to the cheapest one
                new_link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={min_listing.c2c_id}&from=market_index"
                product.link = new_link

                if old_price != new_price:
                    product.min_price = new_price
                    is_price_changed = True
                    # self.db.commit() # Defer commit

                    # Log formatting
                    diff = new_price - old_price
                    percent = (diff / old_price * 100) if old_price > 0 else 0

                    if diff < 0:
                        logger.info(f"📉 降价提醒: 『{name}』   ¥ {old_price:,.2f} -> ¥ {new_price:,.2f} (降幅 {abs(percent):.1f}%)")
                    else:
                        logger.info(f"📈 涨价提醒: 『{name}』   ¥ {old_price:,.2f} -> ¥ {new_price:,.2f} (旧货已出)")

            # Final commit for the item
            self.db.commit()

            return {"is_new": is_new, "is_price_changed": is_price_changed}

        except Exception as e:
            logger.error(f"处理商品出错: {e}")
            self.db.rollback()
            return False

    def _get_request_interval(self):
        config = self.db.query(SystemConfig).filter(SystemConfig.key == "request_interval").first()
        if config:
            try:
                return float(config.value)
            except:
                return 3.0
        return 3.0

    def run_scrape(self, max_pages=100):
        ScraperState.set_running(True)
        # logger.info(f"Scraper started. Max pages: {max_pages}")
        try:
            # Refresh config
            self.headers = self._get_headers()
            self.payload_template = self._get_payload_template()
            request_interval = self._get_request_interval()

            # Validate Cookie
            if 'cookie' not in self.headers or not self.headers['cookie'] or len(self.headers['cookie']) < 10:
                logger.error("❌ 未检测到有效的 Cookie！请先在设置页面配置 Bilibili Cookie。")
                return

            url = "https://mall.bilibili.com/mall-magic-c/internet/c2c/v2/list"
            next_id = None

            # Handle "All" category (categoryFilter is 'ALL' or empty)
            target_category = self.payload_template.get("categoryFilter", "")

            category_map = {
                "2312": "手办",
                "2066": "模型",
                "2331": "周边",
                "2273": "3C",
                "fudai_cate_id": "福袋"
            }

            if not target_category or target_category == "ALL":
                # Weighted random selection
                weights = {}
                filter_config = self.db.query(SystemConfig).filter(SystemConfig.key == "filter_settings").first()
                if filter_config:
                    try:
                        settings = json.loads(filter_config.value)
                        weights = settings.get("category_weights", {})
                    except:
                        pass

                categories = list(category_map.keys())
                # Default weight 20 if not set
                category_weights = [weights.get(c, 20) for c in categories]

                target_category = random.choices(categories, weights=category_weights, k=1)[0]

                self.current_category_id = target_category
                category_name = category_map.get(target_category, target_category)
                logger.info(f"当前配置为全部分类，本次随机选中分类: {category_name} (权重: {weights.get(target_category, 20)})")
            else:
                self.current_category_id = target_category
                category_name = category_map.get(target_category, target_category)
                logger.info(f"当前爬取分类: {category_name}")

            page_count = 0
            while True:
                # Check max_pages limit (if not -1)
                if max_pages != -1 and page_count >= max_pages:
                    logger.info(f"已完成指定页数 ({max_pages}页) 的爬取任务，自动停止。")
                    break

                page_count += 1

                # Check stop signal
                if ScraperState.should_stop():
                    logger.warning("用户终止了爬虫任务。")
                    break

                try:
                    payload = self.payload_template.copy()
                    payload["nextId"] = next_id
                    # Override categoryFilter with our selected target
                    payload["categoryFilter"] = target_category if target_category != "ALL" else "2312" # Fallback just in case, but target_category should be resolved by now

                    logger.info(f"正在获取第 {page_count} 页...")
                    response = requests.post(url, headers=self.headers, data=json.dumps(payload), timeout=10)
                    response.raise_for_status()
                    data = response.json()

                    if "data" not in data:
                        logger.warning("响应数据为空。")
                        break

                    next_id = data["data"]["nextId"]
                    items = data["data"]["data"]

                    if not items:
                        logger.info("本页未发现商品。")
                        break

                    logger.info(f"获取到 {len(items)} 个商品，正在处理...")

                    new_count = 0
                    updated_count = 0

                    for item in items:
                        result = self.process_item(item)
                        if result:
                            if result.get("is_new"):
                                new_count += 1
                            if result.get("is_price_changed"):
                                updated_count += 1

                    logger.info(f"✅ 第 {page_count} 页处理完成。新增: {new_count}, 价格变动: {updated_count}")

                    if not next_id:
                        logger.info("已到达列表末尾。")
                        break

                    # Check if we reached max_pages BEFORE sleeping
                    if max_pages != -1 and page_count >= max_pages:
                        logger.info(f"已完成指定页数 ({max_pages}页) 的爬取任务，自动停止。")
                        break

                    # Interruptible sleep
                    # logger.info(f"Sleeping for {request_interval}s...")
                    for _ in range(int(request_interval * 10)):
                        if ScraperState.should_stop():
                            break
                        time.sleep(0.1)

                except requests.exceptions.HTTPError as e:
                    if e.response.status_code == 429:
                        logger.warning("请求过于频繁 (429)。临时增加 1秒 间隔并冷却 5秒。")
                        request_interval += 1.0
                        time.sleep(5) # Cool down for 5 seconds immediately
                        continue
                    else:
                        logger.error(f"爬取错误: {e}")
                        break

                except Exception as e:
                    logger.error(f"爬取错误: {e}")
                    break
        finally:
            ScraperState.set_running(False)
            logger.info("爬虫任务结束。")