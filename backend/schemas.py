from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ProductBase(BaseModel):
    goods_id: int
    name: str
    img: str
    market_price: float
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
    min_price: Optional[float] = None
    link: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    img: Optional[str] = None
    market_price: Optional[float] = None
    min_price: Optional[float] = None
    link: Optional[str] = None

class ProductResponse(ProductBase):
    pass

class ListingResponse(BaseModel):
    c2c_id: str
    goods_id: int
    price: float
    update_time: datetime

    class Config:
        from_attributes = True

class ConfigUpdate(BaseModel):
    key: str
    value: str # JSON string

class StatsResponse(BaseModel):
    total_items: int
    total_history: int
