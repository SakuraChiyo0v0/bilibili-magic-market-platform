from database import engine, Base
# Imports are required to register models with Base.metadata
from models import Product, PriceHistory, SystemConfig, Listing, User, Favorite  # noqa: F401

def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")

if __name__ == "__main__":
    init_db()
