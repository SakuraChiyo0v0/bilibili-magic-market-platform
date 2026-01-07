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

    def _get_headers(self):
        config = self.db.query(SystemConfig).filter(SystemConfig.key == "user_cookie").first()
        cookie = config.value if config else ""
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Referer": "https://mall.bilibili.com/neul-next/index.html?page=magic-market_index",
            "Origin": "https://mall.bilibili.com",
            "Cookie": cookie
        }

    def _get_payload_template(self):
        config = self.db.query(SystemConfig).filter(SystemConfig.key == "payload_template").first()
        if config:
            try:
                return json.loads(config.value)
            except:
                pass

        # Default template
        return {
            "categoryFilter": "2312",
            "priceFilters": [],
            "discountFilters": [],
            "sortType": "TIME_DESC",
            "nextId": None
        }

    def is_item_valid(self, c2c_id, item_name):
        url = "https://mall.bilibili.com/mall-magic-c/internet/c2c/items/queryC2cItemsDetail"
        try:
            payload = {"c2cItemsId": int(c2c_id)}

            # Construct specific headers for this GET request
            # Copy base headers but remove Origin (not needed for GET) and update Referer
            request_headers = self.headers.copy()
            if "Origin" in request_headers:
                del request_headers["Origin"]
            # Remove Content-Type for GET requests as it's not standard and might trigger WAF
            if "Content-Type" in request_headers:
                del request_headers["Content-Type"]

            request_headers["Referer"] = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={c2c_id}&from=market_index"
            request_headers["Accept"] = "application/json, text/plain, */*"
            request_headers["Sec-Fetch-Dest"] = "empty"
            request_headers["Sec-Fetch-Mode"] = "cors"
            request_headers["Sec-Fetch-Site"] = "same-origin"

            # Add a small random delay to avoid burst requests triggering WAF
            time.sleep(random.uniform(0.5, 1.5))

            # Use a shorter timeout for validity checks
            response = requests.get(url, headers=request_headers, params=payload, timeout=5)
            if response.status_code != 200:
                logger.warning(f"Item {c2c_id} check failed: HTTP {response.status_code}")
                if response.status_code == 412:
                    logger.warning(f"Headers sent: {request_headers}")
                    logger.warning(f"Response content: {response.text[:200]}")
                    # 412 Precondition Failed (Rate Limit/WAF) -> Assume valid to prevent deletion
                    return True
                if response.status_code == 429:
                    logger.warning("Rate limit exceeded (429) during validity check.")
                    # 429 Too Many Requests -> Assume valid
                    return True
                if response.status_code >= 500:
                    # Server error -> Assume valid
                    return True

                # For 404 or other 4xx errors, we assume invalid
                return False

            data = response.json()

            # If code is not 0, it's likely an error (e.g. item not found)
            if data.get("code") != 0:
                logger.info(f"Item {c2c_id} invalid: API code {data.get('code')} - {data.get('message')}")
                return False

            # If data is None, item is gone
            item_data = data.get("data")
            if not item_data:
                logger.info(f"Item {c2c_id} invalid: No data returned")
                return False

            # Check status
            # publishStatus: 1 (Published/Active)
            # saleStatus: 1 (On Sale/Available)
            publish_status = item_data.get("publishStatus")
            sale_status = item_data.get("saleStatus")

            if publish_status != 1 or sale_status != 1:
                logger.info(f"Item {c2c_id} invalid: publishStatus={publish_status}, saleStatus={sale_status}")
                return False

            return True

        except Exception as e:
            logger.warning(f"Check validity error for {c2c_id}: {e}")
            # If network error, assume valid to prevent deletion
            return True

    def check_listings_validity(self, goods_id):
        # Get all listings ordered by price
        listings = self.db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).all()

        logger.info(f"正在检查商品 ID {goods_id} 的有效性。数据库中找到 {len(listings)} 个挂单。")

        target_valid_count = 5
        valid_count = 0
        checked_count = 0
        removed_count = 0

        # Use product name for logging if available
        product = self.db.query(Product).filter(Product.goods_id == goods_id).first()
        name = product.name if product else str(goods_id)

        def check_single_listing(c2c_id, item_name):
            # This runs in a thread, do not access DB objects here
            is_valid = self.is_item_valid(c2c_id, item_name)
            return c2c_id, is_valid

        # Check in batches until we find enough valid listings
        batch_size = 5
        for i in range(0, len(listings), batch_size):
            if valid_count >= target_valid_count:
                break

            batch = listings[i : i + batch_size]

            # Map c2c_id back to listing object for deletion
            c2c_id_to_listing = {l.c2c_id: l for l in batch}

            # Use ThreadPoolExecutor for concurrent checks within the batch
            with ThreadPoolExecutor(max_workers=batch_size) as executor:
                # Pass primitive types (c2c_id, name) instead of SQLAlchemy objects
                future_to_c2c_id = {
                    executor.submit(check_single_listing, l.c2c_id, name): l.c2c_id
                    for l in batch
                }

                for future in as_completed(future_to_c2c_id):
                    try:
                        c2c_id, is_valid = future.result()
                        checked_count += 1
                        if is_valid:
                            valid_count += 1
                        else:
                            listing_to_delete = c2c_id_to_listing.get(c2c_id)
                            if listing_to_delete:
                                self.db.delete(listing_to_delete)
                                removed_count += 1
                    except Exception as e:
                        logger.error(f"Error checking listing validity: {e}")

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
                    # No listings left - Clear the link to indicate out of stock
                    product.link = None
                    # We keep min_price as a reference to the last known price
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

            # Skip Fudai (Blind Box) items
            if item_data.get('type') == 2:
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
                # Update category if it was default or empty
                if not product.category or product.category == "2312":
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

            # Simply get the minimum listing from DB
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
            else:
                # No listings left!
                # This means all listings (including the one we just scraped?) were invalid or deleted.
                # Wait, if we just scraped 'c2c_id', it should be in the DB unless it was deleted.
                # But 'c2c_id' is added at step 2.
                # If 'c2c_id' was added, min_listing should at least find that one.
                # Unless 'c2c_id' itself was found invalid in the loop?
                # But the loop only checks listings that are CHEAPER than 'c2c_id' (if we optimize)
                # OR the loop checks min_listing.

                # If we are here, it means min_listing is None.
                # That implies the DB has NO listings for this goods_id.
                # But we just added one in Step 2!
                # So this case is extremely rare (maybe transaction isolation issue or it was deleted immediately).

                # However, if we consider the case where we might delete the JUST added listing?
                # The loop condition `if min_listing.c2c_id == c2c_id: break` prevents deleting the current item
                # (assuming current item is valid because we just scraped it).
                # BUT, `process_item` doesn't check validity of the current item `c2c_id` explicitly via API,
                # it assumes it's valid because it appeared in the list.

                # So min_listing should at least be the current item.
                # If min_listing is None, it means something went wrong or the item was deleted concurrently.

                # Let's handle the case where there are truly no listings (e.g. if we change logic later).
                # If no listings, we should probably set min_price to None or 0?
                # But Product model defines min_price as Float.
                pass

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
            if 'Cookie' not in self.headers or not self.headers['Cookie'] or len(self.headers['Cookie']) < 10:
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
                "2273": "3C"
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
                # Default weight 25 if not set (for 4 categories)
                category_weights = [weights.get(c, 25) for c in categories]

                target_category = random.choices(categories, weights=category_weights, k=1)[0]

                self.current_category_id = target_category
                category_name = category_map.get(target_category, target_category)
                logger.info(f"当前配置为全部分类，本次随机选中分类: {category_name} (权重: {weights.get(target_category, 25)})")
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

                    logger.info(f"✅ 第 {page_count} 页处理完成。共 {len(items)} 个商品。新增: {new_count}, 价格变动: {updated_count}")

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