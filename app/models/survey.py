from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, JSON
from app.db.base_class import Base
from datetime import datetime

class Survey(Base):
    __tablename__ = "surveys"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String(100), nullable=False) 
    preferences = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
