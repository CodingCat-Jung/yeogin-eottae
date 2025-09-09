from sqlalchemy import Column, Integer, SmallInteger, ForeignKey, JSON, TIMESTAMP, func
from app.db.base_class import Base
# recommendation.py
survey_id = Column(Integer, ForeignKey("surveys.id"), index=True, nullable=False)

class Recommendation(Base):
    __tablename__ = "recommendation"

    id = Column(Integer, primary_key=True, index=True)
    survey_id = Column(Integer, ForeignKey("surveys.id"), nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    # ✅ 새로 추가
    rating = Column(SmallInteger, nullable=True)   # 1~5 점수