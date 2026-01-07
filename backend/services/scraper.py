import json
import time
import logging
import requests
from sqlalchemy.orm import Session
from datetime import datetime
from models import Product, PriceHistory, SystemConfig, Listing
from database import SessionLocal
from state import ScraperState

logger = logging.getLogger(__name__)

class ScraperService:
    def __init__(self, db: Session):
        self.db = db
        self.headers = self._get_headers()
        self.payload_template = self._get_payload_template()

    def _get_headers(self):
        # 1. Try to get specific user_cookie
        cookie_config = self.db.query(SystemConfig).filter(SystemConfig.key == "user_cookie").first()
        user_cookie = cookie_config.value if cookie_config else ""

        # 2. Try to get full headers config (legacy or base)
        headers_config = self.db.query(SystemConfig).filter(SystemConfig.key == "headers").first()

        default_headers = {
            'authority': 'mall.bilibili.com',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6,zh-TW;q=0.5,ja;q=0.4',
            'content-type': 'application/json',
            'referer': 'https://mall.bilibili.com/neul-next/index.html?page=magic-market_index',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
        }

        if headers_config:
            try:
                headers = json.loads(headers_config.value)
            except:
                headers = default_headers
        else:
            headers = default_headers
            # Save default to DB
            self.db.add(SystemConfig(key="headers", value=json.dumps(default_headers), description="Request Headers"))
            self.db.commit()

        # 3. Override cookie if user_cookie exists
        if user_cookie:
            headers['cookie'] = user_cookie

        return headers

    def _get_payload_template(self):
        # 1. Try to get specific filter settings
        filter_config = self.db.query(SystemConfig).filter(SystemConfig.key == "filter_settings").first()

        default_payload = {
            "categoryFilter": "2312",
            "priceFilters": ["0-2000", "3000-5000", "20000-0", "5000-10000", "2000-3000", "10000-20000", "20000-0"],
            "discountFilters": [],
            "nextId": None
        }

        if filter_config:
            try:
                settings = json.loads(filter_config.value)
                # Merge settings into payload
                payload = default_payload.copy()
                if "category" in settings:
                    payload["categoryFilter"] = settings["category"]
                if "priceFilters" in settings:
                    payload["priceFilters"] = settings["priceFilters"]
                return payload
            except:
                pass

        # Fallback to legacy payload config
        config = self.db.query(SystemConfig).filter(SystemConfig.key == "payload").first()
        if config:
            return json.loads(config.value)

        self.db.add(SystemConfig(key="payload", value=json.dumps(default_payload), description="Request Payload Template"))
        self.db.commit()
        return default_payload

    def is_item_valid(self, c2c_id, name):
        url = "https://mall.bilibili.com/mall-magic-c/internet/c2c/items/queryC2cItemsDetail?c2cItemsId=" + str(c2c_id)
        try:
            time.sleep(1) # Rate limit
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if "data" not in data or not data["data"]:
                return False

            dropReason = data["data"].get("dropReason")
            saleStatus = data["data"].get("saleStatus")
            
            if dropReason:
                logger.info(f"『{name}』已被下架 下架原因:{dropReason}")
                return False
            if saleStatus != 1:
                logger.info(f"『{name}』已被交易")
                return False
            return True
        except Exception as e:
            logger.error(f"Check item valid error: {e}")
            return False

    def process_item(self, item_data):
        # Check stop signal before processing each item
        if ScraperState.should_stop():
            return

        try:
            c2c_id = str(item_data['c2cItemsId'])
            details = item_data.get('detailDtoList', [])

            if not details:
                return

            first_detail = details[0]
            goods_id = first_detail['itemsId']
            name = first_detail['name']
            img = "https:" + first_detail['img']

            # Handle multi-item listings
            count = len(details)

            # Skip multi-item listings (bundles)
            if count > 1 or "等" in item_data.get('c2cItemsName', '') and "个商品" in item_data.get('c2cItemsName', ''):
                # logger.debug(f"Skipping bundle: {item_data.get('c2cItemsName', name)}")
                return

            total_price = float(item_data['showPrice'])

            # Single item
            price = total_price
            market_price = float(item_data['showMarketPrice'])

            link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={c2c_id}&from=market_index"

            if goods_id == 0:
                return # Skip blind box

            # 1. Upsert Product
            product = self.db.query(Product).filter(Product.goods_id == goods_id).first()
            if not product:
                product = Product(
                    goods_id=goods_id,
                    name=name,
                    img=img,
                    market_price=market_price,
                    min_price=price, # Initial min price
                    update_time=datetime.now()
                )
                self.db.add(product)
                # self.db.commit() # Defer commit
                # self.db.refresh(product)
                logger.info(f"🆕 发现新商品: 『{name}』 ¥{price}")
            else:
                # Update basic info
                product.update_time = datetime.now()
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
                    # self.db.commit() # Defer commit

                    # Log formatting
                    diff = new_price - old_price
                    percent = (diff / old_price * 100) if old_price > 0 else 0

                    if diff < 0:
                        logger.info(f"📉 降价提醒: 『{name}』 ¥{old_price} -> ¥{new_price} (降幅 {abs(percent):.1f}%)")
                    else:
                        logger.info(f"📈 涨价提醒: 『{name}』 ¥{old_price} -> ¥{new_price} (旧货已出)")

            # Final commit for the item
            self.db.commit()

        except Exception as e:
            logger.error(f"处理商品出错: {e}")
            self.db.rollback()

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
                    for item in items:
                        self.process_item(item)

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