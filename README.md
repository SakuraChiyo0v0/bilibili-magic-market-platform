# Bilibili Magic Market Scraper (Advanced Version)

这是一个基于 FastAPI + React + MySQL 的高级版 Bilibili 魔力赏市场爬虫程序。

## 功能特性

- **Web UI**: 现，而不是be代化的数据看板，支持排序、筛选、分页。
- **持久化存储**: 使用 MySQL 数据库存储商品信息和历史价格。
- **自动抓取**: 后台定时任务自动抓取最新数据。
- **价格趋势**: 记录商品价格变化历史。
- **配置管理**: 在网页上直接修改 Cookie 和筛选条件。

## 目录结构

- `backend/`: Python 后端代码 (FastAPI)
- `frontend/`: React 前端代码 (Vite + Ant Design)

## 安装与运行

### 1. 数据库准备

确保你已经安装了 MySQL，并创建了一个名为 `magic_market` 的数据库（或者你可以修改配置文件让程序自动创建，但最好手动创建数据库）。

```sql
CREATE DATABASE magic_market CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 后端设置 (Backend)

1.  进入 `backend` 目录：
    ```bash
    cd backend
    ```

2.  安装依赖：
    ```bash
    pip install -r requirements.txt
    ```

3.  配置数据库连接：
    打开 `backend/.env` 文件，修改你的数据库连接信息：
    ```ini
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=你的密码
    DB_NAME=magic_market
    ```

4.  启动后端服务：
    ```bash
    uvicorn main:app --reload
    ```
    服务将在 `http://127.0.0.1:8000` 启动。

### 3. 前端设置 (Frontend)

1.  打开一个新的终端窗口，进入 `frontend` 目录：
    ```bash
    cd frontend
    ```

2.  安装依赖 (需要 Node.js)：
    ```bash
    npm install
    ```

3.  启动前端开发服务器：
    ```bash
    npm run dev
    ```
    服务将在 `http://localhost:5173` (通常是这个端口) 启动。

## 使用说明

1.  打开浏览器访问前端地址 (如 `http://localhost:5173`)。
2.  **首次使用配置**：
    - 点击左侧菜单的 **Settings**。
    - 在 **Request Headers** 中，填入你从 Bilibili 获取的 `cookie` (这是必须的，否则无法抓取)。你可以参考 `main.py` 中的旧 cookie，或者在浏览器 F12 中获取最新的。
    - 点击 **Save Configuration**。
3.  **开始抓取**：
    - 点击左侧菜单的 **Dashboard**。
    - 点击 **Trigger Manual Scrape** 按钮开始手动抓取。
    - 或者等待后台定时任务（默认每小时一次）。
4.  **查看数据**：
    - 点击 **Items** 查看抓取到的商品列表。

## 注意事项

- 请勿频繁请求，以免被 Bilibili 封禁 IP。
- `backend/services/scraper.py` 中设置了简单的速率限制 (`time.sleep`)。
