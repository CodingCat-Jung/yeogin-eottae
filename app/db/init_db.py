from app.db.session import engine
from app.db.base_class import Base

def init_db():
    Base.metadata.create_all(bind=engine)
