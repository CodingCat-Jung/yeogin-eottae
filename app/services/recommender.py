# app/services/recommender.py
from typing import Any, Dict, List
from .prompt_builder import generate_prompt_from_survey
from .gemini_client import generate_travel_recommendation
from .geo_enrich import enrich_one_recommendation
import asyncio

def recommend_from_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    prefs = payload.get("preferences", {})

    # dict -> 속성 객체
    PrefObj = type("PrefObj", (), {})
    p = PrefObj()
    for k, v in (prefs or {}).items():
        setattr(p, k, v)

    prompt = generate_prompt_from_survey(p)
    result = generate_travel_recommendation(prompt)
    if result.get("status") != "success":
        raise RuntimeError(result.get("message", "LLM 호출 실패"))

    items: List[Dict[str, Any]] = result["data"]

    # 좌표 보강 (동시에 처리)
    loop = asyncio.get_event_loop()
    enriched = loop.run_until_complete(asyncio.gather(*(enrich_one_recommendation(dict(r)) for r in items)))

    return list(enriched)
