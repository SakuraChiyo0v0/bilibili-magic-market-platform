# API Key 系统设计文档

本文档详细描述了 Bilibili Magic Market Pro 的 API Key 管理系统的架构、实现思路及接口定义。

## 1. 核心目标

为高级用户（开发者）提供一种安全、可控的方式，通过编程接口访问平台数据，支持自动化集成与二次开发。

**关键特性：**
*   **开发者门槛**：普通用户需申请成为“开发者”后才能使用 API 功能。
*   **安全存储**：数据库仅存储 Key 的哈希值，绝不明文存储。
*   **权限控制**：API Key 继承用户的权限，但可被独立撤销。
*   **访问控制**：支持基于 Key 的频率限制 (Rate Limiting)。

---

## 2. 业务流程

### 2.1 开发者申请流程
1.  **普通用户**在“个人中心”点击“申请成为开发者”。
2.  **系统**自动审核（MVP阶段）或进入人工审核队列。
    *   *MVP 策略*：只要注册满 24 小时且无违规记录，自动通过。
3.  **用户角色**升级为 `developer`（或保留 `user` 角色但增加 `is_developer` 标记）。
4.  **用户**获得访问“API 管理”页面的权限。

### 2.2 API Key 生命周期
1.  **生成**：用户填写备注（如“我的爬虫”），系统生成 `sk-` 开头的随机字符串。
2.  **展示**：系统**仅在生成时展示一次**完整 Key，提示用户保存。
3.  **使用**：用户在 HTTP Header 中携带 `X-API-Key: sk-...` 发起请求。
4.  **验证**：后端拦截器提取 Key，哈希后比对数据库，通过则放行。
5.  **撤销**：用户可随时删除 Key，该 Key 立即失效。

---

## 3. 数据库设计

### 3.1 用户表变更 (`users`)
新增字段以支持开发者状态：

```python
class User(Base):
    # ... 现有字段 ...
    is_developer = Column(Boolean, default=False) # 是否为开发者
    developer_applied_at = Column(DateTime, nullable=True) # 申请时间
```

### 3.2 API Key 表 (`api_keys`)

```python
class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    name = Column(String(50)) # 备注，如 "HomeAssistant"
    prefix = Column(String(10)) # Key的前几位，用于展示，如 "sk-a1b2"
    hashed_key = Column(String(255), index=True) # 核心：Key的哈希值
    
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True) # 最后使用时间
    created_at = Column(DateTime, default=datetime.now)
    
    user = relationship("User", back_populates="api_keys")
```

---

## 4. 接口定义 (API Endpoints)

### 4.1 开发者管理
*   `POST /api/developer/apply`: 申请成为开发者。
*   `GET /api/developer/status`: 查询当前申请状态。

### 4.2 API Key 管理
*   `GET /api/keys`: 获取我的 API Key 列表（仅返回前缀和元数据）。
*   `POST /api/keys`: 生成一个新的 API Key。
    *   **Request**: `{"name": "My Script"}`
    *   **Response**: `{"key": "sk-mw82...", "name": "My Script", ...}` **(唯一一次返回明文)**
*   `DELETE /api/keys/{key_id}`: 撤销（删除）指定 Key。

### 4.3 开放数据接口 (Open API)
这些接口支持通过 API Key 访问（同时也支持 Cookie/JWT）：
*   `GET /api/v1/items`: 获取商品列表。
*   `GET /api/v1/items/{id}`: 获取商品详情。
*   `GET /api/v1/favorites`: 获取我的关注。

*(注：为了区分，建议将对外开放的稳定接口统一放在 `/api/v1/` 路径下，与前端使用的内部接口 `/api/` 逻辑解耦，或者复用现有接口但增加认证方式)*

---

## 5. 技术实现细节

### 5.1 Key 的生成与哈希
*   **格式**：`sk-{32位随机字符}`，例如 `sk-7f8a9d...`。
*   **哈希算法**：使用 `SHA256` 或 `Argon2`。考虑到 API 鉴权需要极高的速度（每秒可能几百次），`Argon2` 可能太慢（设计初衷就是慢以防爆破）。
    *   *建议*：使用 `SHA256` 进行快速哈希。因为 API Key 是高熵随机字符串，彩虹表攻击无效。

### 5.2 认证依赖 (Dependency)
在 FastAPI 中实现一个新的 Security Dependency：

```python
async def get_current_user_with_api_key(
    api_key_header: str = Security(APIKeyHeader(name="X-API-Key", auto_error=False)),
    token: str = Depends(oauth2_scheme)
):
    # 1. 优先尝试 API Key
    if api_key_header:
        user = authenticate_api_key(api_key_header)
        if user: return user
        
    # 2. 回退到 JWT Token (支持前端调用)
    return get_current_user(token)
```

### 5.3 频率限制 (Rate Limiting)
*   **实现**：使用内存字典（`dict`）或 `Redis` 记录 `key_id` 在当前时间窗口内的请求次数。
*   **策略**：
    *   普通开发者：60 请求/分钟。
    *   VIP 开发者：300 请求/分钟。
*   **响应**：超限返回 `429 Too Many Requests`。

---

## 6. 开发计划 (Roadmap)

### Phase 1: 基础架构 (MVP)
1.  [ ] 创建 `api_keys` 表，修改 `users` 表。
2.  [ ] 实现 `POST /api/developer/apply` (简化版：点击即通过)。
3.  [ ] 实现 API Key 的生成、哈希存储、列表查询、删除接口。
4.  [ ] 实现 `get_current_user_with_api_key` 依赖，并应用到 `GET /api/items` 等只读接口。

### Phase 2: 前端适配
1.  [ ] 在“个人中心”或“设置”页增加“开发者设置”入口。
2.  [ ] 实现 API Key 管理界面（列表、新建、复制弹窗）。
3.  [ ] 编写简单的 API 文档页面 (`/api/docs` 也就是 Swagger UI，确保对外友好)。

### Phase 3: 进阶控制
1.  [ ] 实现 API 访问频率限制 (Rate Limiting)。
2.  [ ] 记录 API Key 的 `last_used_at`，方便用户清理未使用的 Key。
