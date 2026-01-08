from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, WebSocket, status, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, APIKeyHeader
from sqlalchemy.orm import Session
from sqlalchemy import case, func
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio
import logging
import json
import os
import random
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Debug: Print loaded SMTP config
smtp_user = os.getenv("SMTP_USER")
logging.info(f"启动检查 - SMTP配置: User={smtp_user if smtp_user else '未找到'}, Server={os.getenv('SMTP_SERVER')}")

from logging.handlers import QueueHandler
from contextlib import asynccontextmanager
from jose import JWTError, jwt

import queue
from database import get_db, engine, SessionLocal
from models import Base, Product, PriceHistory, SystemConfig, Listing, User, Favorite, APIKey
from schemas import ProductResponse, ConfigUpdate, StatsResponse, ProductCreate, ProductUpdate, ListingResponse, PriceHistoryResponse, ProductListResponse, UserCreate, UserResponse, Token, PasswordChange, APIKeyCreate, APIKeyResponse, APIKeyCreated, EmailConfig
from security import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM, generate_api_key, hash_api_key
from services.scraper import ScraperService
from services.notifier import NotifierService
from state import ScraperState, TaskManager
from limiter import api_limiter

from collections import deque

# ... (imports)

# Log Storage (In-Memory)
LOG_HISTORY_SIZE = 1000
log_history = deque(maxlen=LOG_HISTORY_SIZE)

# Init DB
Base.metadata.create_all(bind=engine)

# Scheduler
scheduler = BackgroundScheduler()

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

@asynccontextmanager
async def lifespan(app: FastAPI):
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

    # Initialize Admin User - REMOVED for Setup Wizard
    # We now rely on the frontend to detect if no users exist and prompt for setup.

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

    yield

    # Shutdown logic
    ScraperState.set_stop(True)
    if log_task:
        log_task.cancel()
    scheduler.shutdown(wait=False)

app = FastAPI(title="Bilibili Magic Market Scraper", lifespan=lifespan, docs_url=None, redoc_url=None)

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css",
    )

@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=app.title + " - ReDoc",
        redoc_js_url="https://unpkg.com/redoc@next/bundles/redoc.standalone.js",
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Manager removed
# manager = ConnectionManager()

# Old process_log_queue removed (replaced by new one below)

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

# Log Queue Processing
log_queue = queue.Queue()
queue_handler = QueueHandler(log_queue)

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(), # Output to console
        queue_handler # Output to queue
    ]
)

# Ensure uvicorn loggers also use our queue handler
for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logger = logging.getLogger(logger_name)
    logger.handlers = [h for h in logger.handlers if not isinstance(h, QueueHandler)] # Remove duplicates
    logger.addHandler(queue_handler)
    logger.propagate = False # Prevent double logging if root logger also has handlers

root_logger = logging.getLogger()
# Ensure root logger level is INFO
root_logger.setLevel(logging.INFO)

logging.getLogger('apscheduler').setLevel(logging.WARNING)

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
                        "message": record.getMessage(),
                        "timestamp": record.created
                    }
                    log_history.append(log_entry)
                except queue.Empty:
                    break
                except Exception as e:
                    print(f"Error processing log: {e}")
            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        pass

# ... (scrape functions)

# HTTP Log Endpoint
@app.get("/api/logs")
def get_logs(since: float = 0):
    """
    Get logs since a specific timestamp.
    If since is 0, returns the last 100 logs.
    """
    logs = list(log_history)

    if since > 0:
        # Filter logs newer than 'since'
        new_logs = [log for log in logs if log['timestamp'] > since]
        return new_logs
    else:
        # Return last 100 logs for initial load
        return logs[-100:]

# Auth Dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
    db: Session = Depends(get_db)
):
    # 1. Try API Key first
    if api_key:
        # Rate Limiting Check
        if not api_limiter.is_allowed(api_key):
            raise HTTPException(status_code=429, detail="Rate limit exceeded (60 req/min)")

        hashed_key = hash_api_key(api_key)
        db_key = db.query(APIKey).filter(APIKey.hashed_key == hashed_key, APIKey.is_active == True).first()
        if db_key:
            # Update last used time (Optimized: only update if > 60s ago)
            now = datetime.now()
            if not db_key.last_used_at or (now - db_key.last_used_at).total_seconds() > 60:
                db_key.last_used_at = now
                db.commit()
            return db_key.user
        # If API key is provided but invalid, fail immediately
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    # 2. Try JWT Token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

# Developer & API Key Endpoints

@app.post("/api/developer/apply")
def apply_developer(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_developer:
        return {"message": "Already a developer"}

    # MVP: Auto-approve
    current_user.is_developer = True
    current_user.developer_applied_at = datetime.now()
    db.commit()
    return {"message": "Developer status granted"}

@app.get("/api/keys", response_model=List[APIKeyResponse])
def get_api_keys(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_developer:
        raise HTTPException(status_code=403, detail="Developer access required")
    return current_user.api_keys

@app.post("/api/keys", response_model=APIKeyCreated)
def create_api_key(key_in: APIKeyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_developer:
        raise HTTPException(status_code=403, detail="Developer access required")

    raw_key = generate_api_key()
    hashed_key = hash_api_key(raw_key)
    prefix = raw_key[:7] + "..."

    new_key = APIKey(
        user_id=current_user.id,
        name=key_in.name,
        prefix=prefix,
        hashed_key=hashed_key
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    # Return raw key only once
    # Manually construct response to include the raw key which is not in DB model
    return APIKeyCreated(
        id=new_key.id,
        name=new_key.name,
        prefix=new_key.prefix,
        created_at=new_key.created_at,
        last_used_at=new_key.last_used_at,
        is_active=new_key.is_active,
        key=raw_key
    )

@app.delete("/api/keys/{key_id}")
def delete_api_key(key_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id, APIKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API Key not found")

    db.delete(key)
    db.commit()
    return {"message": "API Key deleted"}

# System Endpoints

@app.get("/api/system/status")
def get_system_status(db: Session = Depends(get_db)):
    user_count = db.query(User).count()
    return {"initialized": user_count > 0}

@app.get("/api/system/email/config", response_model=EmailConfig)
def get_email_config(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Retrieve from DB or Env
    # Priority: DB > Env

    def get_config_val(key, default=None):
        # For SMTP settings, we ONLY read from Env as requested
        return os.getenv(key.upper(), default)

    # Check enabled status from DB
    enabled_conf = db.query(SystemConfig).filter(SystemConfig.key == "email_notification_enabled").first()
    enabled = enabled_conf.value.lower() == "true" if enabled_conf else False

    return {
        "smtp_server": get_config_val("smtp_server", "smtp.qq.com"),
        "smtp_port": int(get_config_val("smtp_port", "465")),
        "smtp_user": get_config_val("smtp_user", ""),
        "smtp_password": "***" if get_config_val("smtp_password") else "", # Mask password
        "smtp_from_name": get_config_val("smtp_from_name", "MagicMarket"),
        "enabled": enabled
    }

@app.post("/api/system/email/config")
def update_email_config(config: EmailConfig, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Only update the enabled toggle
    db_conf = db.query(SystemConfig).filter(SystemConfig.key == "email_notification_enabled").first()
    if not db_conf:
        db_conf = SystemConfig(key="email_notification_enabled", value="true" if config.enabled else "false")
        db.add(db_conf)
    else:
        db_conf.value = "true" if config.enabled else "false"

    db.commit()
    return {"message": "Email configuration updated"}

@app.post("/api/system/email/test")
def test_email(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.email:
        raise HTTPException(status_code=400, detail="当前用户未设置邮箱，无法发送测试邮件")

    # Reload config from DB to ensure we use latest settings
    # NotifierService usually loads from Env, we need to update it to load from DB too
    # For now, let's instantiate a new NotifierService which we will modify to support DB config
    notifier = NotifierService(db) # Pass DB session to notifier

    success = notifier.send_email(
        to_email=current_user.email,
        subject="Magic Market 测试邮件",
        content="<h1>恭喜！</h1><p>您的邮件通知服务配置正确。</p>"
    )

    if success:
        return {"message": "测试邮件已发送"}
    else:
        raise HTTPException(status_code=500, detail="发送失败，请检查后台日志")

@app.post("/api/system/setup", response_model=UserResponse)
def system_setup(user: UserCreate, db: Session = Depends(get_db)):
    # Check if already initialized
    if db.query(User).count() > 0:
        raise HTTPException(status_code=400, detail="系统已初始化")

    hashed_password = get_password_hash(user.password)
    new_admin = User(
        username=user.username,
        hashed_password=hashed_password,
        email=user.email,
        role="admin" # Force admin role
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    return new_admin

# Auth Endpoints

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已被注册")

    hashed_password = get_password_hash(user.password)

    # Handle empty email string to avoid unique constraint violation
    email_to_save = user.email
    if not email_to_save:
        email_to_save = None

    new_user = User(
        username=user.username,
        hashed_password=hashed_password,
        email=email_to_save,
        role="user" # Default role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/auth/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=60 * 24 * 7) # 7 days
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    # Check if password is default 'admin123'
    # Note: This adds a slight overhead but is acceptable for this endpoint
    is_default = verify_password("admin123", current_user.hashed_password)

    # Create a response object and set the flag
    response = UserResponse.from_orm(current_user)
    response.is_default_password = is_default
    return response

@app.get("/api/users", response_model=List[UserResponse])
def get_all_users(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@app.post("/api/auth/change-password")
def change_password(password_data: PasswordChange, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="旧密码错误")

    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    return {"message": "密码修改成功"}

# Favorite Endpoints

@app.get("/api/tasks/active")
def get_active_tasks(current_user: User = Depends(get_current_user)):
    return TaskManager.get_active_tasks()

@app.post("/api/favorites/check")
def check_all_favorites(body: dict, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get all favorite goods_ids
    favorites = db.query(Favorite.goods_id).filter(Favorite.user_id == current_user.id).all()
    goods_ids = [f.goods_id for f in favorites]

    if not goods_ids:
        return {"message": "No favorites to check"}

    # Register task
    task_id = TaskManager.add_task("check_favorites", f"检查 {len(goods_ids)} 个关注商品")
    TaskManager.update_task(task_id, total=len(goods_ids))

    # Run check in background to avoid timeout
    def check_task(ids: List[int], tid: str):
        # Create a new session for the background task
        task_db = SessionLocal()
        try:
            service = ScraperService(task_db)
            logging.info(f"开始检查用户 {current_user.username} 的 {len(ids)} 个关注商品...")
            count = 0
            for gid in ids:
                service.check_listings_validity(gid)
                count += 1
                TaskManager.update_task(tid, progress=count)
                # Add a small delay between items to be safe
                time.sleep(random.uniform(1.0, 2.0))

            TaskManager.update_task(tid, status="completed", message="检查完成")
            logging.info(f"用户 {current_user.username} 的关注商品检查完成。")
        except Exception as e:
            TaskManager.update_task(tid, status="failed", message=str(e))
            logging.error(f"检查任务失败: {e}")
        finally:
            task_db.close()

    background_tasks.add_task(check_task, goods_ids, task_id)
    return {"message": f"已开始后台检查 {len(goods_ids)} 个关注商品，请稍后刷新列表查看结果。"}

@app.post("/api/favorites/{goods_id}")
def toggle_favorite(goods_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.goods_id == goods_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"message": "Removed from favorites", "is_favorite": False}
    else:
        # Check if product exists
        product = db.query(Product).filter(Product.goods_id == goods_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        fav = Favorite(user_id=current_user.id, goods_id=goods_id)
        db.add(fav)
        db.commit()
        return {"message": "Added to favorites", "is_favorite": True}

@app.get("/api/favorites/ids", response_model=List[int])
def get_favorite_ids(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favorites = db.query(Favorite.goods_id).filter(Favorite.user_id == current_user.id).all()
    return [f.goods_id for f in favorites]

@app.get("/api/favorites/recent", response_model=List[ProductResponse])
def get_recent_favorites(limit: int = 5, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get favorites joined with products, ordered by update_time desc
    items = db.query(Product)\
        .join(Favorite, Product.goods_id == Favorite.goods_id)\
        .filter(Favorite.user_id == current_user.id)\
        .order_by(Product.update_time.desc())\
        .limit(limit)\
        .all()
    return items

@app.get("/api/tasks/active")
def get_active_tasks(current_user: User = Depends(get_current_user)):
    return TaskManager.get_active_tasks()

@app.post("/api/favorites/check")
def check_all_favorites(body: dict, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get all favorite goods_ids
    favorites = db.query(Favorite.goods_id).filter(Favorite.user_id == current_user.id).all()
    goods_ids = [f.goods_id for f in favorites]

    if not goods_ids:
        return {"message": "No favorites to check"}

    # Register task
    task_id = TaskManager.add_task("check_favorites", f"检查 {len(goods_ids)} 个关注商品")
    TaskManager.update_task(task_id, total=len(goods_ids))

    # Run check in background to avoid timeout
    def check_task(ids: List[int], tid: str):
        # Create a new session for the background task
        task_db = SessionLocal()
        try:
            service = ScraperService(task_db)
            logging.info(f"开始检查用户 {current_user.username} 的 {len(ids)} 个关注商品...")
            count = 0
            for gid in ids:
                service.check_listings_validity(gid)
                count += 1
                TaskManager.update_task(tid, progress=count)
                # Add a small delay between items to be safe
                time.sleep(random.uniform(1.0, 2.0))

            TaskManager.update_task(tid, status="completed", message="检查完成")
            logging.info(f"用户 {current_user.username} 的关注商品检查完成。")
        except Exception as e:
            TaskManager.update_task(tid, status="failed", message=str(e))
            logging.error(f"检查任务失败: {e}")
        finally:
            task_db.close()

    background_tasks.add_task(check_task, goods_ids, task_id)
    return {"message": f"已开始后台检查 {len(goods_ids)} 个关注商品，请稍后刷新列表查看结果。"}

# Endpoints

@app.get("/api/items", response_model=ProductListResponse)
def get_items(
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "update_time",
    order: str = "desc",
    search: Optional[str] = None,
    category: Optional[str] = None,
    only_favorites: bool = False,
    current_user: Optional[User] = Depends(get_current_user), # Optional auth for public view, but needed for favorites
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

    if only_favorites:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required for favorites")
        query = query.join(Favorite, Product.goods_id == Favorite.goods_id).filter(Favorite.user_id == current_user.id)

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
def get_item_listings(goods_id: int, limit: int = 20, db: Session = Depends(get_db)):
    listings = db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).limit(limit).all()
    return listings

@app.get("/api/items/{goods_id}/history", response_model=List[PriceHistoryResponse])
def get_item_history(goods_id: int, db: Session = Depends(get_db)):
    history = db.query(PriceHistory).filter(PriceHistory.goods_id == goods_id).order_by(PriceHistory.record_time.asc()).all()
    return history

@app.post("/api/items/{goods_id}/check_validity")
def check_item_validity(goods_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ScraperService(db)
    result = service.check_listings_validity(goods_id)
    return result

@app.post("/api/items/{goods_id}/recalc")
def recalc_item_price(goods_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.goods_id == goods_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Find lowest price listing
    min_listing = db.query(Listing).filter(Listing.goods_id == goods_id).order_by(Listing.price.asc()).first()

    if min_listing:
        product.min_price = min_listing.price
        product.is_out_of_stock = False
        product.link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={min_listing.c2c_id}&from=market_index"

        # Update historical low if needed
        if product.historical_low_price is None or min_listing.price < product.historical_low_price:
            product.historical_low_price = min_listing.price
    else:
        # No listings -> Out of stock -> Set price to market price
        product.min_price = product.market_price
        product.is_out_of_stock = True
        product.link = None

    db.commit()
    db.refresh(product)
    return product

@app.post("/api/items/recalc_all")
def recalc_all_items(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_admin_user)):
    # Register task
    task_id = TaskManager.add_task("recalc_all", "全局价格修正")

    def task(tid: str):
        db_task = SessionLocal()
        try:
            logging.info("开始全局价格修正任务...")
            products = db_task.query(Product).all()
            total = len(products)
            TaskManager.update_task(tid, total=total)

            count = 0
            for product in products:
                # Find lowest price listing
                min_listing = db_task.query(Listing).filter(Listing.goods_id == product.goods_id).order_by(Listing.price.asc()).first()

                if min_listing:
                    product.min_price = min_listing.price
                    product.is_out_of_stock = False
                    product.link = f"https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId={min_listing.c2c_id}&from=market_index"

                    # Update historical low if needed
                    if product.historical_low_price is None or min_listing.price < product.historical_low_price:
                        product.historical_low_price = min_listing.price
                else:
                    # No listings -> Out of stock -> Set price to market price
                    product.min_price = product.market_price
                    product.is_out_of_stock = True
                    product.link = None
                count += 1
                if count % 10 == 0: # Update progress every 10 items
                    TaskManager.update_task(tid, progress=count)

            db_task.commit()
            TaskManager.update_task(tid, status="completed", message=f"修正完成，共处理 {count} 个商品")
            logging.info(f"全局价格修正完成，共处理 {count} 个商品。")
        except Exception as e:
            TaskManager.update_task(tid, status="failed", message=str(e))
            logging.error(f"全局价格修正失败: {e}")
        finally:
            db_task.close()

    background_tasks.add_task(task, task_id)
    return {"message": "已开始后台全局修正任务，请稍后查看日志或刷新页面。"}

@app.post("/api/items", response_model=ProductResponse)
def create_item(item: ProductCreate, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
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
def update_item(goods_id: int, item: ProductUpdate, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
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
def delete_item(goods_id: int, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    db_item = db.query(Product).filter(Product.goods_id == goods_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Delete history first
    db.query(PriceHistory).filter(PriceHistory.goods_id == goods_id).delete()
    db.delete(db_item)
    db.commit()
    return {"message": "Item deleted"}

@app.post("/api/items/batch_delete")
def batch_delete_items(goods_ids: List[int], current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Delete history
    db.query(PriceHistory).filter(PriceHistory.goods_id.in_(goods_ids)).delete(synchronize_session=False)
    # Delete products
    db.query(Product).filter(Product.goods_id.in_(goods_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {len(goods_ids)} items"}

@app.post("/api/scrape")
def trigger_scrape(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Use scheduler to run job immediately, so it can be managed by scheduler shutdown
    scheduler.add_job(manual_scrape_job, 'date', run_date=datetime.now(), id='manual_scrape', replace_existing=True)
    return {"message": "Scrape started in background"}

@app.get("/api/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total_items = db.query(Product).count()
    total_history = db.query(PriceHistory).count()

    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # New History Today
    new_history_today = db.query(PriceHistory).filter(PriceHistory.record_time >= today_start).count()

    # New Items Today: Items where min(record_time) >= today_start
    # Note: This is an approximation. A better way is to check if created_at is today, but we don't have created_at.
    # We use first price history record time as creation time.
    new_items_today = db.query(PriceHistory.goods_id)\
        .group_by(PriceHistory.goods_id)\
        .having(func.min(PriceHistory.record_time) >= today_start)\
        .count()

    # Category Distribution
    cat_dist = db.query(Product.category, func.count(Product.goods_id))\
        .group_by(Product.category)\
        .all()

    category_distribution = {c: count for c, count in cat_dist if c}

    return {
        "total_items": total_items,
        "total_history": total_history,
        "new_items_today": new_items_today,
        "new_history_today": new_history_today,
        "category_distribution": category_distribution
    }

@app.get("/api/items/today/new", response_model=List[ProductResponse])
def get_today_new_items(limit: int = 20, db: Session = Depends(get_db)):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    subquery = db.query(PriceHistory.goods_id)\
        .group_by(PriceHistory.goods_id)\
        .having(func.min(PriceHistory.record_time) >= today_start)\
        .subquery()

    items = db.query(Product).join(subquery, Product.goods_id == subquery.c.goods_id).limit(limit).all()
    return items

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
def update_config(config_in: ConfigUpdate, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
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
def start_continuous_scrape(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_admin_user)):
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
def toggle_scheduler(action: str, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)): # action: start, stop
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
def stop_scrape(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
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
def trigger_manual_scrape(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_admin_user)):
    if ScraperState.is_running():
        raise HTTPException(status_code=400, detail="Scraper is already running")

    background_tasks.add_task(manual_scrape_job)
    return {"message": "Manual scrape started"}
