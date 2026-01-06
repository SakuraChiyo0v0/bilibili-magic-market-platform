from database import engine
from models import Base
from sqlalchemy import text

def reset_db():
    with engine.connect() as connection:
        # Disable foreign key checks to allow dropping tables in any order
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        connection.execute(text("DROP TABLE IF EXISTS price_history"))
        connection.execute(text("DROP TABLE IF EXISTS listings"))
        connection.execute(text("DROP TABLE IF EXISTS products"))
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        connection.commit()
    
    print("Database tables dropped.")
    
    # Recreate tables
    Base.metadata.create_all(bind=engine)
    print("Database tables recreated.")

if __name__ == "__main__":
    reset_db()
