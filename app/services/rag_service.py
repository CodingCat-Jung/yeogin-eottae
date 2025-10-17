# app/services/rag_service.py
import os
import json
import math
import time
import random
import logging
import hashlib
import requests
import re
from types import SimpleNamespace
from enum import Enum
from typing import Optional, List, Callable, Any, Dict, Tuple

from dotenv import load_dotenv
import chromadb
import google.generativeai as genai
from google.ai.generativelanguage import Schema, Type
from cachetools import TTLCache

from app.services import prompt_builder

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────
# ENV 설정
# ────────────────────────────────────────────────────────────────
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("RAG Service: .env 파일에서 GOOGLE_API_KEY를 찾을 수 없습니다.")
genai.configure(api_key=API_KEY)

CHROMA_PATH = os.path.join(REPO_ROOT, "chroma_db")
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")

# ✅ 어떤 모델이 실제 사용됐는지 기록용
LAST_USED_MODEL: Optional[str] = None

# 🚦 속도 프로파일
class SpeedProfile(str, Enum):
    FAST = "fast"          # 초고속: RAG 생략(또는 축소) + flash + 보강 최소화
    BALANCED = "balanced"  # 기본: RAG-lite + flash 우선, 보강 상한
    MAX = "max"            # 고품질: RAG + 풍부한 보강 (flash 유지)

DEFAULT_SPEED = SpeedProfile.BALANCED

# ────────────────────────────────────────────────────────────────
# Structured Output Schema
# ────────────────────────────────────────────────────────────────
RECOMMENDATION_SCHEMA = Schema(
    type=Type.ARRAY,
    items=Schema(
        type=Type.OBJECT,
        properties={
            "city": Schema(type=Type.STRING),
            "country": Schema(type=Type.STRING),
            "reason": Schema(type=Type.STRING),
            "schedule": Schema(
                type=Type.ARRAY,
                items=Schema(
                    type=Type.OBJECT,
                    properties={
                        "day": Schema(type=Type.STRING),
                        "activities": Schema(
                            type=Type.ARRAY,
                            items=Schema(
                                type=Type.OBJECT,
                                properties={
                                    "time": Schema(type=Type.STRING),
                                    "activity": Schema(type=Type.STRING),
                                },
                                required=["time", "activity"],
                            ),
                        ),
                    },
                    required=["day", "activities"],
                ),
            ),
            "allPlaces": Schema(
                type=Type.ARRAY,
                items=Schema(
                    type=Type.OBJECT,
                    properties={
                        "id": Schema(type=Type.STRING),
                        "name_original": Schema(type=Type.STRING),
                        "name_ko": Schema(type=Type.STRING),
                        "category": Schema(type=Type.STRING),
                        "lat": Schema(type=Type.NUMBER),
                        "lng": Schema(type=Type.NUMBER),
                    },
                    required=["id", "lat", "lng"],
                ),
            ),
            "days": Schema(
                type=Type.ARRAY,
                items=Schema(
                    type=Type.OBJECT,
                    properties={
                        "dateOffset": Schema(type=Type.NUMBER),
                        "stops": Schema(
                            type=Type.ARRAY,
                            items=Schema(
                                type=Type.OBJECT,
                                properties={
                                    "lat": Schema(type=Type.NUMBER),
                                    "lng": Schema(type=Type.NUMBER),
                                },
                                required=["lat", "lng"],
                            ),
                        ),
                    },
                ),
            ),
            "lodging": Schema(
                type=Type.OBJECT,
                properties={
                    "areas": Schema(
                        type=Type.ARRAY,
                        items=Schema(
                            type=Type.OBJECT,
                            properties={
                                "name_original": Schema(type=Type.STRING),
                                "name_ko": Schema(type=Type.STRING),
                                "lat": Schema(type=Type.NUMBER),
                                "lng": Schema(type=Type.NUMBER),
                                "why": Schema(type=Type.STRING),
                                "budget_hint": Schema(type=Type.STRING),
                            },
                        ),
                    ),
                    "hotels": Schema(
                        type=Type.ARRAY,
                        items=Schema(
                            type=Type.OBJECT,
                            properties={
                                "name_original": Schema(type=Type.STRING),
                                "name_ko": Schema(type=Type.STRING),
                                "lat": Schema(type=Type.NUMBER),
                                "lng": Schema(type=Type.NUMBER),
                                "why": Schema(type=Type.STRING),
                                "price_tier": Schema(type=Type.STRING),
                                "booking_query": Schema(type=Type.STRING),
                                "agoda_query": Schema(type=Type.STRING),
                            },
                        ),
                    ),
                },
            ),
            "lodging_area": Schema(type=Type.STRING),
        },
        required=["city", "reason", "schedule"],
    ),
)

# ────────────────────────────────────────────────────────────────
# Retry & REST 임베딩
# ────────────────────────────────────────────────────────────────
def _retry(fn: Callable[[], Any], tries=2, base=0.6, cap=3.0):
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            last = e
            if i == tries - 1:
                raise
            time.sleep(min(cap, base * (2 ** i) + random.random() * 0.2))
    raise last  # pragma: no cover

EMBED_MODEL = "text-embedding-004"
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent?key={API_KEY}"

def _embed_rest(text: str, timeout_s: float = 6.0) -> List[float]:
    payload = {"content": {"parts": [{"text": text}]}}
    resp = requests.post(EMBED_URL, json=payload, timeout=timeout_s)
    resp.raise_for_status()
    js = resp.json()
    emb = (js.get("embedding") or {})
    vec = emb.get("values") or emb.get("value")
    if not isinstance(vec, list) or not vec:
        raise ValueError(f"Bad embed response: {js}")
    return vec

def safe_embed_texts(texts: List[str]) -> List[List[float]]:
    """
    임베딩 재시도 기본 대기 시간을 줄여 1분 목표 달성.
    """
    def one(t: str) -> List[float]:
        # tries=2, base=0.2, cap=1.0으로 유지
        return _retry(lambda: _embed_rest(t), tries=2, base=0.2, cap=1.0)
    return [one(t) for t in texts]

# ────────────────────────────────────────────────────────────────
# 캐시
# ────────────────────────────────────────────────────────────────
_CACHE: TTLCache[str, Dict[str, Any]] = TTLCache(maxsize=4096, ttl=3600 * 6)  # 6시간 유지
_NAME_CACHE: TTLCache[Tuple[float, float], str] = TTLCache(maxsize=10000, ttl=3600 * 24)  # 좌표→이름 24h

def _prefs_key(prefs: dict, speed: SpeedProfile, num_cities: int) -> str:
    s = json.dumps({**prefs, "_num": num_cities}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1((s + "|" + speed.value).encode("utf-8")).hexdigest()

# ────────────────────────────────────────────────────────────────
# 유틸
# ────────────────────────────────────────────────────────────────
def _adapt_to_array(payload: Any) -> List[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ["recommendation", "recommendations", "data", "cities", "plans", "plan", "results"]:
            v = payload.get(k)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                return [v]
    return []

def _parse_month_str(month_str: Optional[str]) -> Optional[int]:
    if not month_str or month_str == "flexible":
        return None
    s = month_str.strip()
    if "-" in s or "/" in s:
        try:
            mm = s.split("-" if "-" in s else "/")[1]
            m = int(mm)
            return m if 1 <= m <= 12 else None
        except Exception:
            pass
    try:
        if s.endswith("월"):
            m = int(s[:-1])
            return m if 1 <= m <= 12 else None
    except Exception:
        pass
    if s.isdigit():
        m = int(s)
        return m if 1 <= m <= 12 else None
    map_en = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
    return map_en.get(s[:3].lower())

def _month_to_season(m: Optional[int]) -> Optional[str]:
    if not m:
        return None
    if m in (3, 4, 5): return "SPRING"
    if m in (6, 7, 8): return "SUMMER"
    if m in (9, 10, 11): return "FALL"
    return "WINTER"

# ────────────────────────────────────────────────────────────────
# 프롬프트 빌더 + RAG-lite
# ────────────────────────────────────────────────────────────────
def _compress(doc: str, limit: int) -> str:
    if not doc:
        return ""
    return doc[:limit]

def _build_final_prompt(
    survey_preferences: dict,
    retrieved_docs: List[str],
    num_cities: int = 1
) -> str:
    context = (
        "당신은 여행 전문가입니다. 아래는 과거 고평가 예시입니다. 복사말고 현재 선호에 맞게 재구성하세요.\n\n"
    )
    if retrieved_docs:
        for i, doc in enumerate(retrieved_docs, 1):
            context += f"--- 사례 {i} ---\n{doc}\n\n"

    prefs_ns = SimpleNamespace(**survey_preferences)
    base_prompt = prompt_builder.generate_prompt_from_survey(prefs_ns)

    hard_rules = (
        "- 출력은 **JSON 배열만**. 불필요한 문장·코드블록 금지.\n"
        f"- 도시 {num_cities}개 **정확히** 포함.\n"
        "- 장소명에 'Unknown', 'Unnamed', 'N/A' 금지. 이름이 불명확하면 카테고리+동네형 한국어 설명 이름을 만들어라 "
        "(예: '삿포로 시내 카페', '스스키노 인기 라멘집').\n"
    )

    user_block = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    return f"{context}{base_prompt}\n{hard_rules}\n{user_block}"

def _query_chroma(query_emb, month: Optional[int], season_hint: Optional[str]) -> List[str]:
    try:
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        collection = client.get_or_create_collection(name="recommendations")
    except Exception as e:
        logger.error("[RAG] Chroma 연결 실패(폴백 진행): %s", e)
        return []

    where: Dict[str, Any] = {"rating": {"$gte": 4}}
    season = (season_hint or _month_to_season(month))
    if season:
        where = {"$and": [where, {"season": {"$eq": season}}]}

    try:
        retrieved = collection.query(query_embeddings=[query_emb], n_results=2, where=where)
    except Exception as e:
        logger.warning("[RAG] where 필터 실패 → 필터 없이 재시도: %s", e)
        try:
            retrieved = collection.query(query_embeddings=[query_emb], n_results=2)
        except Exception as e2:
            logger.error("[RAG] Chroma 조회 실패(폴백 진행): %s", e2)
            return []

    docs: List[str] = []
    if retrieved and retrieved.get("documents") and retrieved["documents"][0]:
        docs = retrieved["documents"][0]
    return docs

def _query_chroma_lite(query_emb, month: Optional[int], season_hint: Optional[str], speed: SpeedProfile) -> List[str]:
    if speed == SpeedProfile.FAST:
        return []  # RAG 생략
    n = 1 if speed == SpeedProfile.BALANCED else 2
    docs = _query_chroma(query_emb, month, season_hint) if query_emb is not None else []
    limit = 1200 if speed == SpeedProfile.BALANCED else 2400
    return [_compress(d, limit) for d in docs[:n]]

# ────────────────────────────────────────────────────────────────
# LLM 호출 — 동기 컨텍스트 전용
# ────────────────────────────────────────────────────────────────
def _call_gemini_with_schema(prompt: str, model_name: str, temp: float):
    model = genai.GenerativeModel(model_name)
    cfg = genai.types.GenerationConfig(
        response_mime_type="application/json",
        response_schema=RECOMMENDATION_SCHEMA,
        temperature=temp,
        candidate_count=1,
    )
    resp = model.generate_content(prompt, generation_config=cfg)
    if getattr(resp, "parsed", None):
        return resp.parsed
    raw = resp.text or ""
    logger.error("[RAG] structured 응답 없음. raw text 앞 500자: %s", raw[:500])
    return json.loads(raw) if raw.strip() else []

def _call_gemini(prompt: str, speed: SpeedProfile):
    """
    모든 SpeedProfile에서 gemini-2.5-flash만 사용.
    """
    global LAST_USED_MODEL
    candidates, temp = ["models/gemini-2.5-flash"], 0.6
    last_err = None
    for mid in candidates:
        logger.info("[RAG] ▶ try: %s (speed=%s)", mid, speed.value)
        try:
            result = _call_gemini_with_schema(prompt, mid, temp)
            LAST_USED_MODEL = mid
            logger.info("[RAG] ✅ success: %s", mid)
            return result
        except Exception as e:
            last_err = e
            logger.warning("[RAG] ⚠️ %s failed: %s", mid, e)
    raise RuntimeError(f"Gemini 호출 실패: {last_err}")

# ────────────────────────────────────────────────────────────────
# 후처리 유틸
# ────────────────────────────────────────────────────────────────
def _ensure_days(schedule: Any, days: int) -> List[Dict[str, Any]]:
    if not isinstance(schedule, list):
        schedule = []

    def _normalize_day_label(idx):
        return f"day_{idx}"

    cur: List[Dict[str, Any]] = []
    for idx, d in enumerate(schedule[:days], start=1):
        if not isinstance(d, dict):
            d = {}
        d_day = d.get("day") or _normalize_day_label(idx)
        acts = d.get("activities") or []
        if not isinstance(acts, list):
            acts = []
        cur.append({"day": d_day, "activities": acts})

    for idx in range(len(cur) + 1, days + 1):
        cur.append({
            "day": _normalize_day_label(idx),
            "activities": [
                {"time": "09:00-11:00", "activity": "도시 탐방/카페 휴식 (도보)"},
                {"time": "11:30-13:00", "activity": "점심"},
                {"time": "14:00-17:00", "activity": "핵심 스팟 방문 (대중교통/도보)"},
                {"time": "18:00-20:00", "activity": "저녁 또는 야경"},
            ],
        })
    return cur

def _lodging_areas_to_text(item: Dict[str, Any]) -> Dict[str, Any]:
    if item.get("lodging_area"):
        return item
    lodg = item.get("lodging") or {}
    areas = lodg.get("areas") or []
    if not isinstance(areas, list) or not areas:
        return item

    labels = []
    for a in areas[:2]:
        name = (a.get("name_ko") or a.get("name_original") or "").strip()
        why = (a.get("why") or "").strip()
        hint = a.get("budget_hint") or ""
        segs = [name] if name else []
        if hint: segs.append(hint)
        if why: segs.append(why)
        if segs: labels.append(" / ".join(segs))
    if labels:
        item["lodging_area"] = " · ".join(labels)
    return item

# ────────────────────────────────────────────────────────────────
# 이름/좌표 보강 (속도/퀄리티 최적화)
# ────────────────────────────────────────────────────────────────
def _simple_ko(name: str) -> str:
    s = (name or "").strip()
    if not s or s.lower() in ("unknown", "unnamed", "poi", "point of interest", "n/a"):
        return ""
    rep = [
        (r"\bStation\b", "역"),
        (r"\bTower\b", "타워"),
        (r"\bPark\b", "공원"),
        (r"\bShrine\b", "신사"),
        (r"\bTemple\b", "사원"),
        (r"\bCastle\b", "성"),
        (r"\bMarket\b", "시장"),
        (r"\bShopping Street\b", "상점가"),
        (r"\bMuseum\b", "박물관"),
        (r"\bGarden\b", "정원"),
        (r"\bUniversity\b", "대학"),
        (r"\bArea\b", "지역"),
    ]
    for pat, ko in rep:
        s = re.sub(pat, ko, s, flags=re.IGNORECASE)
    s = re.sub(r"\bSapporo\b", "삿포로", s, flags=re.IGNORECASE)
    s = re.sub(r"\bHokkaido\b", "홋카이도", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTokyo\b", "도쿄", s, flags=re.IGNORECASE)
    s = re.sub(r"\bOsaka\b", "오사카", s, flags=re.IGNORECASE)
    return s.strip()

def _city_hint(item: Dict[str, Any]) -> str:
    return (item.get("city") or "").strip() or "시내"

def _enrich_place_name_ko(p: Dict[str, Any], city_hint: str) -> Dict[str, Any]:
    if p.get("name_ko"):
        return p
    lat, lng = p.get("lat"), p.get("lng")

    # 좌표 캐시
    key: Optional[Tuple[float, float]] = None
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        key = (round(lat, 5), round(lng, 5))
        if key in _NAME_CACHE:
            p["name_ko"] = _NAME_CACHE[key]
            return p

    if MAPBOX_TOKEN and key:
        try:
            url = (
                f"https://api.mapbox.com/geocoding/v5/mapbox.places/"
                f"{lng},{lat}.json?types=poi,address&language=ko&limit=1&access_token={MAPBOX_TOKEN}"
            )
            r = requests.get(url, timeout=1.5)
            r.raise_for_status()
            js = r.json()
            feat = (js.get("features") or [None])[0]
            if feat:
                name_ko = feat.get("text_ko") or feat.get("text") \
                          or feat.get("place_name_ko") or feat.get("place_name")
                if name_ko:
                    p["name_ko"] = name_ko
                    _NAME_CACHE[key] = name_ko
                    return p
        except Exception as e:
            logger.debug("[RAG] Mapbox ko name enrich fail: %s", e)

    base = (p.get("name_original") or p.get("name") or "").strip()
    ko = _simple_ko(base)
    if not ko:
        cat = (p.get("category") or "추천 장소").strip()
        ko = f"{city_hint} {cat}"
    p["name_ko"] = ko or base
    if key and p["name_ko"]:
        _NAME_CACHE[key] = p["name_ko"]
    return p

def _enrich_all_places_ko(item: Dict[str, Any], speed: SpeedProfile) -> Dict[str, Any]:
    """
    속도 프로파일에 따라 장소 개수 제한 및 Mapbox 호출. 숙소도 allPlaces로 병합.
    """
    if speed == SpeedProfile.FAST:
        return item

    max_places = 3 if speed == SpeedProfile.BALANCED else 5
    aps = item.get("allPlaces") or []

    # 숙소 정보를 마커 목록에 포함
    lodging_items: List[Dict[str, Any]] = []
    lodg = item.get("lodging") or {}
    for lodg_list_key in ["areas", "hotels"]:
        for idx, lodg_item in enumerate(lodg.get(lodg_list_key) or []):
            if isinstance(lodg_item.get("lat"), (int, float)) and isinstance(lodg_item.get("lng"), (int, float)):
                lodging_items.append({
                    "id": f"lodg_{lodg_list_key[:4]}_{idx+1}",
                    "name_original": lodg_item.get("name_original") or lodg_item.get("name") or "",
                    "name_ko": lodg_item.get("name_ko"),
                    "category": "숙박" if lodg_list_key == "areas" else "호텔",
                    "lat": lodg_item["lat"],
                    "lng": lodg_item["lng"],
                })

    combined_places = lodging_items + aps
    out: List[Dict[str, Any]] = []
    city_hint = _city_hint(item)

    for idx, p in enumerate(combined_places):
        if not isinstance(p, dict):
            continue
        p.setdefault("id", f"poi_{idx+1}")
        p.setdefault("name_original", p.get("name") or "")

        # Mapbox 호출 대상 제한
        if idx < max_places:
            p = _enrich_place_name_ko(p, city_hint)
        else:
            if not p.get("name_ko"):
                base = p.get("name_original") or p.get("name") or ""
                ko = _simple_ko(base) or f"{city_hint} {(p.get('category') or '추천 장소')}"
                p["name_ko"] = ko

        p.setdefault("name", p.get("name_ko") or p.get("name_original") or "")
        out.append(p)

    item["allPlaces"] = out
    return item

def _cleanup_unknowns(item: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: List[Dict[str, Any]] = []
    city_hint = _city_hint(item)
    for p in item.get("allPlaces") or []:
        name = (p.get("name_ko") or p.get("name_original") or "").strip().lower()
        if not name or name in ("unknown", "unnamed", "poi", "point of interest", "n/a"):
            p["name_ko"] = f"{city_hint} {(p.get('category') or '추천 장소')}"
            p["name"] = p["name_ko"]
        cleaned.append(p)
    item["allPlaces"] = cleaned
    return item

# ────────────────────────────────────────────────────────────────
# 도시 중심 기반 필터 (옵션)
# ────────────────────────────────────────────────────────────────
def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2 +
        math.cos(math.radians(lat1)) *
        math.cos(math.radians(lat2)) *
        math.sin(d_lon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))

def _fetch_city_center(city: str, country: str, token: str):
    try:
        q = f"{city},{country}" if country else city
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json?types=place&limit=1&access_token={token}"
        r = requests.get(url, timeout=2.0)
        r.raise_for_status()
        js = r.json()
        feat = (js.get("features") or [None])[0]
        if feat and "center" in feat:
            lng, lat = feat["center"]
            return lat, lng
    except Exception as e:
        logger.warning("[RAG] 도시 중심 좌표 가져오기 실패: %s", e)
    return None, None

def _filter_outliers(item: Dict[str, Any], max_km: float = 120.0) -> Dict[str, Any]:
    if not MAPBOX_TOKEN:
        return item

    city, country = item.get("city"), item.get("country")
    lat_c, lng_c = _fetch_city_center(city, country, MAPBOX_TOKEN)
    if not (lat_c and lng_c):
        return item

    aps = []
    for p in item.get("allPlaces") or []:
        lat, lng = p.get("lat"), p.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            dist = _haversine_km(lat_c, lng_c, lat, lng)
            if dist <= max_km:
                aps.append(p)
            else:
                logger.debug(f"[RAG] {city}: {p.get('name_original')} ({dist:.1f}km) 제외")
    item["allPlaces"] = aps

    days_new = []
    for d in item.get("days") or []:
        stops_new = []
        for s in d.get("stops") or []:
            lat, lng = s.get("lat"), s.get("lng")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                if _haversine_km(lat_c, lng_c, lat, lng) <= max_km:
                    stops_new.append(s)
        d["stops"] = stops_new
        days_new.append(d)
    item["days"] = days_new
    return item

# ────────────────────────────────────────────────────────────────
# 메인
# ────────────────────────────────────────────────────────────────
def get_rag_recommendation(
    survey_preferences: dict,
    speed: SpeedProfile = DEFAULT_SPEED,
    num_cities: int = 1
) -> Dict[str, Any]:
    """RAG-lite + flash 우선 + 보강 상한 + 캐시. 결과는 최상위 배열(JSON)."""
    def _t(): return time.perf_counter()

    cache_key = _prefs_key(survey_preferences, speed, num_cities)
    if cache_key in _CACHE:
        logger.info("[RAG] cache hit: %s", cache_key[:8])
        return _CACHE[cache_key]

    t0 = _t()

    # 월/시즌 힌트
    month = survey_preferences.get("travel_month")
    if month is None:
        month = _parse_month_str(survey_preferences.get("month"))
    try:
        if month is not None:
            month = int(month)
            if not (1 <= month <= 12):
                month = None
    except Exception:
        month = None
    season_hint = survey_preferences.get("season")

    # 1) 임베딩
    query_text = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    try:
        emb = None if speed == SpeedProfile.FAST else safe_embed_texts([query_text])[0]
    except Exception as e:
        logger.error("[RAG] 임베딩 호출 실패(폴백): %s", e)
        emb = None
    t1 = _t()

    # 2) RAG-lite
    docs = _query_chroma_lite(emb, month, season_hint, speed) if (emb is not None or speed != SpeedProfile.FAST) else []
    t2 = _t()

    # 3) LLM
    final_prompt = _build_final_prompt(survey_preferences, docs, num_cities=num_cities)
    data = _call_gemini(final_prompt, speed)
    t3 = _t()

    # 3.5) 개수 보정
    arr = _adapt_to_array(data)
    if isinstance(arr, list) and len(arr) > num_cities:
        arr = arr[:num_cities]

    # 4) 후처리
    try:
        days = prompt_builder._extract_days(survey_preferences.get("duration", "") or "")
    except Exception:
        days = 3

    fixed: List[Dict[str, Any]] = []
    for item in (arr or []):
        if not isinstance(item, dict):
            continue
        sch = item.get("schedule") or []
        item["schedule"] = _ensure_days(sch, days)
        item = _lodging_areas_to_text(item)

        # Mapbox + 폴백 보강 (속도 프로파일에 따라 상한 적용)
        item = _enrich_all_places_ko(item, speed)

        # Unknown 방어선
        item = _cleanup_unknowns(item)

        # 필요시 반경 필터
        # item = _filter_outliers(item, max_km=120.0)

        fixed.append(item)
    t4 = _t()

    logger.info(
        "[RAG][latency] embed=%.2fs chroma=%.2fs llm=%.2fs post=%.2fs total=%.2fs (model=%s)",
        t1 - t0, t2 - t1, t3 - t2, t4 - t3, t4 - t0, LAST_USED_MODEL
    )

    result = {"recommendation": fixed, "prompt": final_prompt}
    _CACHE[cache_key] = result
    return result
