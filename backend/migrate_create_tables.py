from database import engine
from models import Base

def migrate():
    Base.metadata.create_all(bind=engine)
    print("Migration successful: Created new tables if not exist.")

if __name__ == "__main__":
    migrate()
