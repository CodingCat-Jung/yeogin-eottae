from pydantic import BaseModel
from typing import List, Optional, Literal

# 시간대 표현: 새벽/오전/오후/저녁
TimeWindow = Literal["dawn", "morning", "afternoon", "evening"]

class Preferences(BaseModel):
    companion: str
    style: List[str]
    duration: str
    driving: str
    budget: str
    climate: str
    continent: str
    density: str

    # ✅ 새로 추가 (선택값)
    depart_window: Optional[TimeWindow] = None
    return_window: Optional[TimeWindow] = None

class SurveyCreate(BaseModel):
    nickname: str
    preferences: Preferences
