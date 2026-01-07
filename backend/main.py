from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import case
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio
import logging
import json
from logging.handlers import QueueHandler

import queue
from database import get_db, engine, SessionLocal
from models import Base, Product, PriceHistory, SystemConfig, Listing
from schemas import ProductResponse, ConfigUpdate, StatsResponse, ProductCreate, ProductUpdate, ListingResponse, PriceHistoryResponse, ProductListResponse

from services.scraper import ScraperService
from state import ScraperState

log_queue = queue.Queue()
queue_handler = QueueHandler(log_queue)
root_logger = logging.getLogger()

# Avoid adding duplicate handlers
if not any(isinstance(h, QueueHandler) for h in root_logger.handlers):
    root_logger.addHandler(queue_handler)

root_logger.setLevel(logging.INFO)
logging.getLogger('apscheduler').setLevel(logging.WARNING)

# Init DB
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bilibili Magic Market Scraper")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Scheduler
scheduler = BackgroundScheduler()

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections[:]: # Iterate over copy
            try:
                await connection.send_json(message)
            except Exception as e:
                self.disconnect(connection)

manager = ConnectionManager()

log_task = None

async def process_log_queue():
    try:
        while True:
            while not log_queue.empty():
                try:
                    record = log_queue.get_nowait()
                    log_entry = {
                        "time": datetime.fromtimestamp(record.created).strftime('%H:%M:%S'),
                        "level": record.levelname,
                        "message": record.getMessage()
                    }
                    await manager.broadcast(log_entry)
                except queue.Empty:
                    break
                except Exception as e:
                    print(f"Error processing log: {e}")
            await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass

def scheduled_scrape():
    # Reset stop signal before starting
    ScraperState.set_stop(False)

    db = SessionLocal()
    try:
        # Get max_pages from config
        config_pages = db.query(SystemConfig).filter(SystemConfig.key == "auto_scrape_max_pages").first()
        max_pages = 50
        if config_pages:
            try:
                max_pages = int(config_pages.value)
            except:
                pass

        service = ScraperService(db)
        logging.info(f"开始定时爬取任务 (最大 {max_pages} 页)...")
        service.run_scrape(max_pages=max_pages)
        logging.info("定时爬取任务完成。")
    except Exception as e:
        logging.error(f"定时爬取任务失败: {e}")
    finally:
        db.close()

def manual_scrape_job():
    # Reset stop signal
    ScraperState.set_stop(False)

    db = SessionLocal()
    try:
        service = ScraperService(db)
        logging.info("开始手动爬取 (1页)...")
        service.run_scrape(max_pages=1)
        logging.info("手动爬取完成。")
    finally:
        db.close()

def continuous_scrape_job():
    # Reset stop signal
    ScraperState.set_stop(False)

    db = SessionLocal()
    try:
        service = ScraperService(db)
        logging.info("开始常驻爬取任务 (无限循环)...")
        service.run_scrape(max_pages=-1)
        logging.info("常驻爬取任务已停止。")
    finally:
        # Resume scheduler if enabled in config
        config_enabled = db.query(SystemConfig).filter(SystemConfig.key == "scheduler_enabled").first()
        if config_enabled and config_enabled.value.lower() == "true":
            job = scheduler.get_job('hourly_scrape')
            if job:
                job.resume()
                logging.info("常驻任务结束，已恢复定时调度任务。")
        db.close()

@app.on_event("startup")
async def startup_event():
    global log_task
    # Start log processor
    log_task = asyncio.create_task(process_log_queue())

    db = SessionLocal()

    # Get interval from DB or default to 60 minutes
    config_interval = db.query(SystemConfig).filter(SystemConfig.key == "scrape_interval_minutes").first()
    interval_minutes = 60
    if config_interval:
        try:
            interval_minutes = int(config_interval.value)
        except:
            pass

    # Get scheduler enabled state
    config_enabled = db.query(SystemConfig).filter(SystemConfig.key == "scheduler_enabled").first()
    scheduler_enabled = True # Default to True if not set
    if config_enabled:
        scheduler_enabled = config_enabled.value.lower() == "true"
    else:
        # Initialize default
        db.add(SystemConfig(key="scheduler_enabled", value="true", description="Scheduler Enabled Status"))
        db.commit()

    db.close()

    # Add job
    job = scheduler.add_job(scheduled_scrape, 'interval', minutes=interval_minutes, id='hourly_scrape')

    # Start scheduler but pause job if disabled
    scheduler.start()
    if not scheduler_enabled:
        job.pause()
        logging.info("调度器已启动，但根据配置任务已暂停。")
    else:
        logging.info("调度器已启动，任务激活。")

@app.on_event("shutdown")
def shutdown_event():
    global log_task
    ScraperState.set_stop(True)
    if log_task:
        log_task.cancel()
    scheduler.shutdown(wait=False)
    if log_task:
        log_task.cancel()

    ScraperState.set_stop(True)
    scheduler.shutdown(wait=False)

# WebSocket for Logs
@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep connection open
    except Exception:
        manager.disconnect(websocket)

# Endpoints

@app.get("/api/items", response_model=ProductListResponse)
def get_items(
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "update_time",
    order: str = "desc",
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Product)

    if search:
        query = query.filter(Product.name.contains(search))

    if category:
        # Support multiple categories separated by comma
        categories = [c for c in category.split(',') if c] # Filter out empty strings
        if len(categories) > 0:
            if len(categories) > 1:
                query = query.filter(Product.category.in_(categories))
            else:
                query = query.filter(Product.category == categories[0])

    # Get total count before pagination
    total = query.count()

    sort_attr = Product.update_time # Default

    if sort_by == "update_time":
        sort_attr = Product.update_time
    elif sort_by == "price":
        sort_attr = Product.min_price
    elif sort_by == "discount":
        # (market - min) / market
        sort_attr = case(
            (Product.market_price > 0, (Product.market_price - Product.min_price) / Product.market_price),
            else_=0
        )
    elif sort_by == "diff":
        # market - min
        sort_attr = Product.market_price - Product.min_price

    if order == "desc":
        query = query.order_by(sort_attr.desc())
    else:
        query = query.order_by(sort_attr.asc())

    items = query.offset(skip).limit(limit).all()
    return {"items": items, "total": total}

@app.get("/api/items/{goods_id}/listings", response_model=List[ListingResponse])
def get_item_listings(goods_id: int, db: Session = Depends(get_db)):
    listings = db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).all()
    return listings

@app.get("/api/items/{goods_id}/history", response_model=List[PriceHistoryResponse])
def get_item_history(goods_id: int, db: Session = Depends(get_db)):
    history = db.query(PriceHistory).filter(PriceHistory.goods_id == goods_id).order_by(PriceHistory.record_time.asc()).all()
    return history

@app.post("/api/items/{goods_id}/check_validity")
def check_item_validity(goods_id: int, db: Session = Depends(get_db)):
    service = ScraperService(db)
    result = service.check_listings_validity(goods_id)
    return result

@app.post("/api/items", response_model=ProductResponse)
def create_item(item: ProductCreate, db: Session = Depends(get_db)):
    db_item = db.query(Product).filter(Product.goods_id == item.goods_id).first()
    if db_item:
        raise HTTPException(status_code=400, detail="Item already exists")

    new_item = Product(
        goods_id=item.goods_id,
        name=item.name,
        img=item.img,
        market_price=item.market_price,
        min_price=item.min_price,
        update_time=datetime.now()
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item

@app.put("/api/items/{goods_id}", response_model=ProductResponse)
def update_item(goods_id: int, item: ProductUpdate, db: Session = Depends(get_db)):
    db_item = db.query(Product).filter(Product.goods_id == goods_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = item.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db_item.update_time = datetime.now()
    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/api/items/{goods_id}")
def delete_item(goods_id: int, db: Session = Depends(get_db)):
    db_item = db.query(Product).filter(Product.goods_id == goods_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Delete history first
    db.query(PriceHistory).filter(PriceHistory.goods_id == goods_id).delete()
    db.delete(db_item)
    db.commit()
    return {"message": "Item deleted"}

@app.post("/api/items/batch_delete")
def batch_delete_items(goods_ids: List[int], db: Session = Depends(get_db)):
    # Delete history
    db.query(PriceHistory).filter(PriceHistory.goods_id.in_(goods_ids)).delete(synchronize_session=False)
    # Delete products
    db.query(Product).filter(Product.goods_id.in_(goods_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {len(goods_ids)} items"}

@app.post("/api/scrape")
def trigger_scrape(db: Session = Depends(get_db)):
    # Use scheduler to run job immediately, so it can be managed by scheduler shutdown
    scheduler.add_job(manual_scrape_job, 'date', run_date=datetime.now(), id='manual_scrape', replace_existing=True)
    return {"message": "Scrape started in background"}

@app.get("/api/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total_items = db.query(Product).count()
    total_history = db.query(PriceHistory).count()
    return {"total_items": total_items, "total_history": total_history}

@app.get("/api/config/{key}")
def get_config(key: str, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not config:
        return {"key": key, "value": None}
    return {"key": config.key, "value": config.value}

import time

def restart_scraper_task():
    logging.info("正在等待当前爬虫停止...")
    timeout = 30
    start_time = time.time()
    while ScraperState.is_running() and time.time() - start_time < timeout:
        time.sleep(0.5)

    if ScraperState.is_running():
        logging.error("无法及时停止爬虫，重启已中止。")
        return

    logging.info("正在使用新配置重启爬虫...")
    ScraperState.set_stop(False)
    db = SessionLocal()
    try:
        service = ScraperService(db)
        service.run_scrape(max_pages=100)
    finally:
        db.close()

@app.post("/api/config")
def update_config(config_in: ConfigUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).filter(SystemConfig.key == config_in.key).first()
    if not config:
        config = SystemConfig(key=config_in.key, value=config_in.value)
        db.add(config)
    else:
        config.value = config_in.value
    db.commit()

    # Handle special config updates
    if config_in.key == "scrape_interval_minutes":
        try:
            new_minutes = int(config_in.value)
            if new_minutes > 0:
                scheduler.reschedule_job('hourly_scrape', trigger='interval', minutes=new_minutes)
                logging.info(f"已重新调度爬取任务为每 {new_minutes} 分钟一次")
        except ValueError:
            pass

    # If scraper is running, stop and restart it
    if ScraperState.is_running():
        logging.info("爬虫运行时配置已更改，正在初始化重启...")
        ScraperState.set_stop(True)
        background_tasks.add_task(restart_scraper_task)

    return {"message": "Config updated"}

@app.get("/api/scraper/status")
def get_scraper_status():
    job = scheduler.get_job('hourly_scrape')
    scheduler_status = "stopped"
    next_run = None

    if job:
        scheduler_status = "running" if job.next_run_time else "paused"
        next_run = job.next_run_time

    return {
        "scheduler_status": scheduler_status, # running (enabled) / paused (disabled)
        "is_running": ScraperState.is_running(), # True if currently scraping
        "next_run": next_run
    }

@app.post("/api/scraper/continuous/start")
def start_continuous_scrape(background_tasks: BackgroundTasks):
    if ScraperState.is_running():
        raise HTTPException(status_code=400, detail="Scraper is already running")

    # Pause scheduler job if running to avoid conflict
    job = scheduler.get_job('hourly_scrape')
    if job:
        job.pause()
        logging.info("已暂停定时任务以运行常驻爬虫。")

    background_tasks.add_task(continuous_scrape_job)
    return {"message": "Continuous scrape started"}

@app.post("/api/scraper/scheduler/toggle")
def toggle_scheduler(action: str, db: Session = Depends(get_db)): # action: start, stop
    job = scheduler.get_job('hourly_scrape')

    if action == "start":
        # Check if continuous scraper is running
        if ScraperState.is_running():
             raise HTTPException(status_code=400, detail="Cannot start scheduler while scraper is running. Please stop scraper first.")

    # Update DB config
    config = db.query(SystemConfig).filter(SystemConfig.key == "scheduler_enabled").first()
    new_value = "true" if action == "start" else "false"

    if not config:
        config = SystemConfig(key="scheduler_enabled", value=new_value, description="Scheduler Enabled Status")
        db.add(config)
    else:
        config.value = new_value
    db.commit()

    if action == "start":
        if job:
            job.resume()
        else:
            # Should not happen if initialized correctly, but fallback
            # Get interval from DB
            config_interval = db.query(SystemConfig).filter(SystemConfig.key == "scrape_interval_minutes").first()
            interval = int(config_interval.value) if config_interval else 60
            scheduler.add_job(scheduled_scrape, 'interval', minutes=interval, id='hourly_scrape', next_run_time=datetime.now() + timedelta(seconds=1))
        return {"message": "Scheduler started"}
    elif action == "stop":
        if job:
            job.pause()
        return {"message": "Scheduler paused"}
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

@app.post("/api/scraper/stop")
def stop_scrape(db: Session = Depends(get_db)):
    ScraperState.set_stop(True)

    # Resume scheduler if enabled in config
    config_enabled = db.query(SystemConfig).filter(SystemConfig.key == "scheduler_enabled").first()
    if config_enabled and config_enabled.value.lower() == "true":
        job = scheduler.get_job('hourly_scrape')
        if job:
            job.resume()
            logging.info("已发送停止信号，并恢复定时调度任务。")

    return {"message": "Stop signal sent"}

@app.post("/api/scraper/manual")
def trigger_manual_scrape(background_tasks: BackgroundTasks):
    if ScraperState.is_running():
        raise HTTPException(status_code=400, detail="Scraper is already running")

    background_tasks.add_task(manual_scrape_job)
    return {"message": "Manual scrape started"}
