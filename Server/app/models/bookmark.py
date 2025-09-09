# app/models/bookmark.py
from sqlalchemy import Column, Integer, DateTime, String, Enum
from app.db.base_class import Base
import enum

class ItemType(str, enum.Enum):
    recommendation = "recommendation"

class Bookmark(Base):
    __tablename__ = "bookmark"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    item_type = Column(Enum(ItemType), nullable=False)
    item_id = Column(Integer, nullable=False)
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime)