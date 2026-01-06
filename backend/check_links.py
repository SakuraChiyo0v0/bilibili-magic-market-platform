from database import SessionLocal
from models import Product

def check_null_links():
    db = SessionLocal()
    try:
        products = db.query(Product).filter(Product.link == None).all()
        print(f"Found {len(products)} products with NULL link.")
        for p in products:
            print(f"ID: {p.goods_id}, Name: {p.name}")
            
        # Check total products
        total = db.query(Product).count()
        print(f"Total products: {total}")
    finally:
        db.close()

if __name__ == "__main__":
    check_null_links()
