# app/schemas/recommendation.py
from pydantic import BaseModel, conint

class RatingUpdate(BaseModel):
    rating: conint(ge=1, le=5)  # 1~5 사이 정수만 허용
