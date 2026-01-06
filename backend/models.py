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

    # Cache fields for sorting/display
    min_price = Column(Float) # 最低价缓存
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
