# Magic Market Price Platform (魔力市场价格平台)

这是一个基于 FastAPI + React + MySQL 的全栈 Bilibili 魔力赏市场价格监控平台。

## 功能特性

- **Web UI**: 现代化的数据看板，支持排序、筛选、分页。
- **持久化存储**: 使用 MySQL 数据库存储商品信息和历史价格。
- **自动抓取**: 后台定时任务自动抓取最新数据。
- **价格趋势**: 可视化记录商品价格变化历史。
- **配置管理**: 在网页上直接修改 Cookie 和筛选条件。
- **Docker 部署**: 支持一键 Docker 部署。

## 目录结构

- `backend/`: Python 后端代码 (FastAPI)
- `frontend/`: React 前端代码 (Vite + Ant Design)

## 快速开始 (Docker 部署 - 推荐)

这是最简单的运行方式，适合服务器部署。

### 前置要求
- Docker
- Docker Compose

### 启动服务

在项目根目录下运行：

```bash
docker-compose up -d --build
```

### 访问服务

- **前端页面**: `http://localhost:82` (或服务器 IP:82)
- **后端 API**: `http://localhost:8111`
- **数据库**: `localhost:3307`

---

## 本地开发指南

如果你想修改代码，可以分别启动前后端。

### 1. 数据库准备

确保你已经安装了 MySQL，并创建了一个名为 `magic_market` 的数据库。

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

3.  配置环境变量：
    复制 `.env.example` (如果有) 或直接创建 `.env` 文件，配置数据库连接：
    ```ini
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=你的密码
    DB_NAME=magic_market
    ```

4.  启动后端服务：
    ```bash
    # 注意：为了与前端代理匹配，建议指定端口 8111
    uvicorn main:app --reload --port 8111
    ```
    服务将在 `http://127.0.0.1:8111` 启动。

### 3. 前端设置 (Frontend)

1.  进入 `frontend` 目录：
    ```bash
    cd frontend
    ```

2.  安装依赖：
    ```bash
    npm install
    ```

3.  启动前端开发服务器：
    ```bash
    npm run dev
    ```
    服务将在 `http://localhost:5173` 启动。
    *注意：前端配置了代理，会将 `/api` 请求转发到 `http://127.0.0.1:8111`。*

## 使用说明

1.  打开浏览器访问前端地址。
2.  **首次使用配置**：
    - 点击左侧菜单的 **Settings**。
    - **获取 Cookie**:
        1. 在浏览器中访问 [Bilibili 魔力赏市场](https://mall.bilibili.com/neul-next/index.html?page=magic-market_index) 并登录。
        2. 按 `F12` 打开开发者工具，切换到 **Network** (网络) 标签页。
        3. 刷新页面，找到名为 `list` 或 `queryC2cItemsDetail` 的请求。
        4. 在请求头 (Request Headers) 中找到 `cookie` 字段，复制其全部内容。
    - 在 **Request Headers** 中，填入你获取的 `cookie`。
    - 点击 **Save Configuration**。
3.  **开始抓取**：
    - 点击左侧菜单的 **Dashboard**。
    - 点击 **Trigger Manual Scrape** 按钮开始手动抓取。
    - 或者等待后台定时任务（默认每小时一次）。
4.  **查看数据**：
    - 点击 **Items** 查看抓取到的商品列表。

## 注意事项

- 请勿频繁请求，以免被 Bilibili 封禁 IP。
- `backend/services/scraper.py` 中设置了简单的速率限制。
