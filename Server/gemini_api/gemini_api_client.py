import os
import json
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# ✅ Structured Output 스키마 (additionalProperties 전부 제거)
response_schema = {
    "type": "object",
    "properties": {
        "data": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "city": {"type": "string"},
                    "country": {"type": "string"},
                    "reason": {"type": "string"},
                    # schedule: [{ day: string, activities: [{time, activity}] }]
                    "schedule": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "day": {"type": "string"},
                                "activities": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "time": {"type": "string"},
                                            "activity": {"type": "string"}
                                        },
                                        "required": ["time", "activity"]
                                    }
                                }
                            },
                            "required": ["day", "activities"]
                        }
                    }
                },
                "required": ["city", "country", "reason", "schedule"]
            }
        }
    },
    "required": ["data"]
}

model = genai.GenerativeModel(
    "models/gemini-1.5-flash-latest",
    generation_config={
        "response_mime_type": "application/json",
        "response_schema": response_schema,
        # 필요하면 온도 등 추가
        # "temperature": 0.7,
        # "top_p": 0.9,
    },
)

def _schedule_list_to_map(rec: dict) -> dict:
    """
    모델이 반환한 schedule(배열)을 기존 프론트/DB에서 쓰던 맵 형태로 변환.
    [{day:"day_1", activities:[...]}] -> {"day_1":[...]}
    """
    sched = rec.get("schedule") or []
    out = {}
    for d in sched:
        day_key = d.get("day") or "day_1"
        out[day_key] = d.get("activities") or []
    rec["schedule"] = out
    return rec

def generate_travel_recommendation(prompt: str) -> dict:
    try:
        res = model.generate_content(prompt)
        obj = json.loads(res.text)  # 구조화 출력: 순수 JSON 문자열
        data = obj.get("data", [])
        # 프론트/DB 호환을 위해 후처리
        normalized = [_schedule_list_to_map(dict(item)) for item in data]
        return {"status": "success", "data": normalized}
    except json.JSONDecodeError as e:
        return {"status": "error", "message": f"JSON 파싱 오류: {e}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
