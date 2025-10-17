# app/services/hotel_guard.py
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple, Callable
import math

# ─────────────────────────────────────────────────────
# Dataclass
# ─────────────────────────────────────────────────────
@dataclass
class HotelCandidate:
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None
    price_tier: Optional[str] = None
    source_link: Optional[str] = None
    confidence: float = 0.0  # 모델명 ↔ API명 매칭 신뢰도(0~1)

# ─────────────────────────────────────────────────────
# Small utils
# ─────────────────────────────────────────────────────
def _norm(s: str) -> str:
    return "".join((s or "").lower().split())

def _name_confidence(model_name: str, api_name: str) -> float:
    a, b = _norm(model_name), _norm(api_name)
    if not a or not b:
        return 0.0
    # 간단 부분일치(필요시 fuzzy로 교체)
    return 1.0 if (a in b or b in a) else 0.0

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))

# ─────────────────────────────────────────────────────
# Core
# ─────────────────────────────────────────────────────
def validate_hotels_with_places(
    city_center: Tuple[float, float],
    model_hotels: List[Dict],
    places_search_fn: Callable[[str], List[Dict]],
    *,
    min_rating: float = 4.2,
    min_reviews: int = 200,
    max_distance_km: float = 12.0,
) -> List[HotelCandidate]:
    """
    LLM이 낸 hotel 후보(model_hotels)를 외부 검색(places_search_fn)으로 검증.
    반환: 기준 통과한 상위 3개.
    """
    validated: List[HotelCandidate] = []
    cx, cy = city_center

    for h in model_hotels or []:
        q = h.get("name_original") or h.get("name_ko") or h.get("name") or ""
        if not q.strip():
            continue

        hits = []
        try:
            hits = places_search_fn(q) or []
        except Exception:
            hits = []

        if not hits:
            continue

        top = hits[0]  # 가장 상위 결과만 사용(간단화)
        conf = _name_confidence(q, top.get("name") or "")
        lat = top.get("lat")
        lng = top.get("lng")
        dist = None
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            dist = _haversine_km(cy, cx, lat, lng)  # (lat, lng) 주의

        cand = HotelCandidate(
            name=top.get("name") or q,
            lat=lat,
            lng=lng,
            rating=top.get("rating"),
            reviews=top.get("userRatingsTotal") or top.get("reviews"),
            price_tier=h.get("price_tier"),
            source_link=top.get("url"),
            confidence=conf,
        )

        # 필터 기준
        if cand.confidence >= 0.85 \
           and (cand.rating or 0) >= min_rating \
           and (cand.reviews or 0) >= min_reviews \
           and (dist is None or dist <= max_distance_km):
            validated.append(cand)

    return validated[:3]

def decide_lodging_mode(
    city_center: Tuple[float, float],
    model_hotels: List[Dict],
    areas: List[Dict],
    places_search_fn: Callable[[str], List[Dict]],
    *,
    required_min: int = 2
) -> Dict:
    """
    검증 통과 호텔이 required_min(기본=2)개 이상이면 'hotels' 모드,
    아니면 'area' 모드로 폴백.
    """
    valid = validate_hotels_with_places(city_center, model_hotels or [], places_search_fn)

    if len(valid) >= required_min:
        return {
            "mode": "hotels",
            "hotels": [asdict(v) for v in valid],
            "areas": areas or [],
        }

    # area 폴백(최대 2개만)
    top_areas = (areas or [])[:2]
    if not top_areas:
        # areas가 비면 city_center만 있는 최소 형태라도 유지
        top_areas = []

    return {
        "mode": "area",
        "areas": top_areas,
        "hotels": [],
    }

__all__ = ["HotelCandidate", "validate_hotels_with_places", "decide_lodging_mode"]
