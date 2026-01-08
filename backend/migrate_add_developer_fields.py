from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        try:
            print("Adding is_developer column...")
            conn.execute(text("ALTER TABLE users ADD COLUMN is_developer BOOLEAN DEFAULT FALSE;"))
            print("Success.")
        except Exception as e:
            print(f"Skipped (maybe already exists): {e}")

        try:
            print("Adding developer_applied_at column...")
            conn.execute(text("ALTER TABLE users ADD COLUMN developer_applied_at DATETIME NULL;"))
            print("Success.")
        except Exception as e:
            print(f"Skipped (maybe already exists): {e}")
            
        try:
            print("Creating api_keys table if not exists...")
            # We rely on create_all for new tables, but let's make sure
            # Actually create_all in main.py handles new tables.
            # But if we need to force it here:
            from models import Base
            Base.metadata.create_all(bind=engine)
            print("Success.")
        except Exception as e:
            print(f"Error creating tables: {e}")

if __name__ == "__main__":
    migrate()
