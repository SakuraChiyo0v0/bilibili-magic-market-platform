from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ProductBase(BaseModel):
    goods_id: int
    name: str
    img: str
    market_price: float
    category: Optional[str] = None
    min_price: Optional[float] = None
    link: Optional[str] = None
    update_time: datetime

    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    goods_id: int
    name: str
    img: str
    market_price: float
    category: Optional[str] = "2312"
    min_price: Optional[float] = None
    link: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    img: Optional[str] = None
    market_price: Optional[float] = None
    category: Optional[str] = None
    min_price: Optional[float] = None
    link: Optional[str] = None

class ProductResponse(ProductBase):
    pass

class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int

class ListingResponse(BaseModel):
    c2c_id: str
    goods_id: int
    price: float
    update_time: datetime

    class Config:
        from_attributes = True

class PriceHistoryResponse(BaseModel):
    id: int
    goods_id: int
    price: float
    record_time: datetime

    class Config:
        from_attributes = True

class ConfigUpdate(BaseModel):
    key: str
    value: str # JSON string

class StatsResponse(BaseModel):
    total_items: int
    total_history: int
    new_items_today: int
    new_history_today: int
    category_distribution: dict[str, int] = {}

# Auth Schemas
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime
    is_default_password: bool = False

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

# API Key Schemas
class APIKeyBase(BaseModel):
    name: str

class APIKeyCreate(APIKeyBase):
    pass

class APIKeyResponse(APIKeyBase):
    id: int
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    is_active: bool

    class Config:
        from_attributes = True

class APIKeyCreated(APIKeyResponse):
    key: str # Only returned once
