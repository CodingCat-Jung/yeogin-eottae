# app/services/geo_enrich.py
from __future__ import annotations
from typing import Dict, List, Any, Set, Optional
import re, logging
from .places_client import search_text_top1

log = logging.getLogger("geo_enrich")

SEPS = ["→","->","-","~","에서","로"," to "," at "," in "," 방문"," 감상"," 체험"," 식사"," 점심"," 저녁"]

def _pick_place_phrase(activity: str) -> str:
    s = activity or ""
    m = re.search(r"[\"'“”‘’]([^\"'“”‘’]+)[\"'“”‘’]", s)
    if m:
        s = m.group(1)
    s = re.sub(r"\(.*?\)|\[.*?\]|【.*?】", "", s)
    for sep in SEPS:
        if sep in s:
            parts = [p.strip() for p in s.split(sep) if p.strip()]
            if parts:
                s = parts[-1]
    s = re.sub(r"(추천|명물|맛집|현지|근처|대표|포토\s*스팟|야경\s*스팟|전망대|쇼핑|산책|휴식|박물관|미술관|시장|백화점|공원|역|정류장|도보|버스|지하철|기차|택시|렌터카|공항|체크인)", "", s)
    s = re.sub(r"(에서|으로|로|에|에게|에서\s*식사|에서\s*감상)$", "", s).strip()
    return s if len(s) >= 2 else (activity or "").strip()

def _uniq_key(p: Dict[str, Any]) -> str:
    return f"{p.get('name_original','')}|{p.get('lat')}|{p.get('lng')}"

def _looks_food(activity: str) -> bool:
    return bool(re.search(r"(라멘|스시|초밥|수프카레|카레|징기스칸|양고기|식당|맛집|ramen|sushi|curry)", activity, re.I))

async def enrich_one_recommendation(rec: dict, collect_debug: bool = False):
    city = (rec.get("city") or "").strip()
    country = (rec.get("country") or "").strip()
    schedule: dict = rec.get("schedule") or {}

    all_places: list[dict] = []
    seen: set[str] = set()
    days: list[dict] = []

    # 0) 도시 중심 (locationBias)
    city_center = search_text_top1(f"{city}, {country}".strip(", "))
    loc_bias = {"latitude": city_center["lat"], "longitude": city_center["lng"]} if city_center else None

    # 1) 일정 키 정렬 (day_1, day_2… / 1일차, 2일차… 모두 케이스)
    def day_order(k: str) -> int:
        m = re.search(r"(\d+)", k or "")
        return int(m.group(1)) if m else 9999
    items = sorted(schedule.items(), key=lambda kv: day_order(kv[0]))

    for idx, (day_key, acts) in enumerate(items):
        if not isinstance(acts, list):
            continue
        day_stops: list[dict] = []

        for a in acts:
            raw = str(a.get("activity", ""))
            # ① 정확 명칭(따옴표/괄호) 우선
            m = re.search(r"[\"'“”‘’(（]([^\"'“”‘’()（）]+)[\"'”’)）]", raw)
            precise = m.group(1).strip() if m else None

            base_phrase = _pick_place_phrase(raw)
            base_query = f"{base_phrase}, {city}, {country}".strip(", ")
            precise_query = f"{precise}, {city}, {country}".strip(", ") if precise else None

            # 음식이면 타입 힌트
            types = ["restaurant"] if _looks_food(raw) else None

            place = None
            # 1차: precise + 타입힌트 + locationBias
            if precise_query:
                place = search_text_top1(precise_query, language="ko", location_bias=loc_bias, types=types)

            # 2차: 일반 구문 + 타입힌트 + locationBias
            if not place:
                place = search_text_top1(base_query, language="ko", location_bias=loc_bias, types=types)

            # 3차: 타입힌트 없이(locationBias만)
            if not place and precise_query:
                place = search_text_top1(precise_query, language="ko", location_bias=loc_bias)

            if not place:
                place = search_text_top1(base_query, language="ko", location_bias=loc_bias)

            # 4차: 최종 폴백 – 도시만 (정말 안 잡힐 때)
            if not place and city_center:
                place = city_center

            if not place:
                continue

            key = _uniq_key(place)
            if key not in seen:
                seen.add(key)
                all_places.append(place)
            day_stops.append({"lat": place["lat"], "lng": place["lng"]})

        if day_stops:
            days.append({"dateOffset": idx, "stops": day_stops})

    rec["allPlaces"] = all_places
    rec["days"] = days
    return rec
