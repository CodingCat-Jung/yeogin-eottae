# app/schemas/survey.py
from pydantic import BaseModel, field_validator
from typing import List, Optional, Literal

# 시간대 표현: 새벽/오전/오후/저녁
TimeWindow = Literal["dawn", "morning", "afternoon", "evening"]
SeasonEnum = Literal["SPRING", "SUMMER", "FALL", "WINTER"]

class Preferences(BaseModel):
    companion: str
    style: List[str]
    duration: str
    driving: str
    budget: str
    climate: str
    continent: str
    density: str

    # 선택 필드들
    depart_window: Optional[TimeWindow] = None
    return_window: Optional[TimeWindow] = None

    # ✅ 새로 추가(선택): 프론트가 보내는 정수 월(1~12)과, 선택적 시즌 문자열
    travel_month: Optional[int] = None
    season: Optional[SeasonEnum] = None

    @field_validator("travel_month")
    @classmethod
    def _chk_month(cls, v):
        if v is None:
            return v
        if 1 <= v <= 12:
            return v
        raise ValueError("travel_month must be 1~12")

class SurveyCreate(BaseModel):
    nickname: str
    preferences: Preferences
