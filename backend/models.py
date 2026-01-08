from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Product(Base):
    __tablename__ = "products"

    goods_id = Column(Integer, primary_key=True, index=True)  # 商品ID (SKU)
    name = Column(String(255), index=True)
    img = Column(String(512))
    market_price = Column(Float)
    category = Column(String(50), default="2312") # 商品分类

    # Cache fields for sorting/display
    min_price = Column(Float) # 最低价缓存
    historical_low_price = Column(Float) # 历史最低价
    is_out_of_stock = Column(Boolean, default=False) # 是否无货
    link = Column(String(512)) # 最低价链接缓存
    update_time = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    price_history = relationship(
        "PriceHistory",
        back_populates="product",
        cascade="all, delete-orphan",
        primaryjoin="Product.goods_id == PriceHistory.goods_id",
        foreign_keys="PriceHistory.goods_id"
    )
    listings = relationship(
        "Listing",
        back_populates="product",
        cascade="all, delete-orphan",
        primaryjoin="Product.goods_id == Listing.goods_id",
        foreign_keys="Listing.goods_id"
    )

class Listing(Base):
    __tablename__ = "listings"

    c2c_id = Column(String(64), primary_key=True)
    goods_id = Column(Integer, index=True)
    price = Column(Float)
    update_time = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    product = relationship("Product", back_populates="listings", foreign_keys=[goods_id], primaryjoin="Product.goods_id == Listing.goods_id")

class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    goods_id = Column(Integer, index=True)
    price = Column(Float)
    c2c_id = Column(String(64)) # 对应的交易ID
    record_time = Column(DateTime, default=datetime.now)

    product = relationship("Product", back_populates="price_history", foreign_keys=[goods_id], primaryjoin="Product.goods_id == PriceHistory.goods_id")

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String(50), primary_key=True)
    value = Column(Text) # JSON string or plain text
    description = Column(String(255))

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    email = Column(String(100), unique=True, index=True, nullable=True)
    role = Column(String(20), default="user") # 'admin' or 'user'
    is_developer = Column(Boolean, default=False)
    developer_applied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")

class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    name = Column(String(50)) # 备注
    prefix = Column(String(10)) # Key的前几位，用于展示
    hashed_key = Column(String(255), index=True) # Key的哈希值

    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User", back_populates="api_keys")

class Favorite(Base):
    __tablename__ = "favorites"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    goods_id = Column(Integer, ForeignKey("products.goods_id"), primary_key=True)
    created_at = Column(DateTime, default=datetime.now)
