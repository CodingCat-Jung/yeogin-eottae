# app/schemas/toggle.py
from pydantic import BaseModel, Field, conint
from typing import Literal, Optional

class ToggleBody(BaseModel):
    item_type: Literal["recommendation"] = "recommendation"
    item_id: conint(gt=0)
    note: Optional[str] = Field(None, max_length=200)