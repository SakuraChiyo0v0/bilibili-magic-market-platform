from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as connection:
        try:
            connection.execute(text("ALTER TABLE products ADD COLUMN images TEXT"))
            print("Migration successful: Added 'images' column.")
        except Exception as e:
            print(f"Migration failed (maybe column exists?): {e}")

if __name__ == "__main__":
    migrate()
