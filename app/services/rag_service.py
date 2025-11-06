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


# ENV 설정

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

# 지도 마커 우선순위 정책( 공항 고정 1번)
MAP_MARKER_POLICY = "airport_first"


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


# Structured Output Schema

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

            # ✅ LLM이 직접 계산한 총예산(₩), 항목별 분해
            "estimated_budget": Schema(type=Type.NUMBER),
            "budget_breakdown": Schema(
                type=Type.OBJECT,
                properties={
                    "meals": Schema(type=Type.NUMBER),      # 식비
                    "transport": Schema(type=Type.NUMBER),  # 현지 이동
                    "tickets": Schema(type=Type.NUMBER),    # 입장/체험
                    "etc": Schema(type=Type.NUMBER),        # 예비비
                },
            ),
        },
        required=["city", "reason", "schedule"],
    ),
)


# Retry & REST 임베딩

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
    def one(t: str) -> List[float]:
        return _retry(lambda: _embed_rest(t), tries=2, base=0.2, cap=1.0)
    return [one(t) for t in texts]


# 캐시

_CACHE: TTLCache[str, Dict[str, Any]] = TTLCache(maxsize=4096, ttl=3600 * 6)  # 6시간 유지
_NAME_CACHE: TTLCache[Tuple[float, float], str] = TTLCache(maxsize=10000, ttl=3600 * 24)  # 좌표→이름 24h

def _prefs_key(prefs: dict, speed: SpeedProfile, num_cities: int) -> str:
    # prefs 안에 _variant/_avoid_cities/_force_new_city 가 들어오면 자연스럽게 키가 달라짐
    s = json.dumps({**prefs, "_num": num_cities}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1((s + "|" + speed.value).encode("utf-8")).hexdigest()


# 유틸

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


# 프롬프트 빌더 + RAG-lite

def _compress(doc: str, limit: int) -> str:
    if not doc:
        return ""
    return doc[:limit]

def _build_final_prompt(
    survey_preferences: dict,
    retrieved_docs: List[str],
    num_cities: int = 1
) -> str:
    # 1) 컨텍스트 + RAG 예시
    context = (
        "당신은 여행 전문가입니다. 아래는 과거 고평가 예시입니다. 복사말고 현재 선호에 맞게 재구성하세요.\n\n"
    )
    if retrieved_docs:
        for i, doc in enumerate(retrieved_docs, 1):
            context += f"--- 사례 {i} ---\n{doc}\n\n"

    # 2) 사용자 설문 기반 베이스 프롬프트
    prefs_ns = SimpleNamespace(**survey_preferences)
    base_prompt = prompt_builder.generate_prompt_from_survey(prefs_ns)

    # 3) 다양화/회피/도시변경 힌트
    variant = int(survey_preferences.get("_variant") or 0)
    avoid_list = survey_preferences.get("_avoid_cities") or []
    force_new = bool(survey_preferences.get("_force_new_city"))

    # 4) 여행 일수 힌트
    try:
        days_hint = prompt_builder._extract_days(survey_preferences.get("duration") or "")
    except Exception:
        days_hint = 3

    # 5) 다양화/회피/도시 변경 규칙 문자열 구성
    diversity_rule = (
        "- 동일 선호라도 **코스/맛집/숙소를 일부 새롭게** 제안하세요.\n"
        if variant else
        "- 재현성을 위해 과도한 랜덤성은 피하고 핵심 동선을 유지하세요.\n"
    )
    avoid_rule = f"- 다음 도시는 추천하지 마세요: {', '.join(map(str, avoid_list))}\n" if avoid_list else ""

    keep_city = survey_preferences.get("_keep_city")

    if force_new:
        city_rule = (
            "- 이번 추천은 **이전과 다른 도시**로 구성하세요. 회피 도시가 있으면 반드시 제외하세요.\n"
            "- 동일 도시는 절대 포함하지 마세요.\n"
        )
    elif keep_city:
        city_rule = (
            f"- 사용자는 같은 조건으로 다시 추천을 요청했습니다. "
            f"가능하면 **'{keep_city}' 도시를 그대로 유지**하세요.\n"
            "- 도시를 바꾸지 말고, 동일 도시 내에서 다른 **숙소/코스/맛집**을 추천하세요.\n"
            "- 같은 나라 내 인근 지역(예: 도쿄↔요코하마)은 허용하되, 다른 나라로 이동하지 마세요.\n"
        )
    else:
        city_rule = (
            "- 사용자는 같은 조건으로 다시 추천을 요청했습니다. "
            "도시는 그대로 유지하고 내부 코스를 다양화하세요.\n"
        )

    # 6) 하드 규칙(출력 형식 + 예산 산출 규칙)
    hard_rules = (
        "- 출력은 **JSON 배열만**. 불필요한 문장·코드블록 금지.\n"
        f"- 도시 {num_cities}개 **정확히** 포함.\n"
        f"{diversity_rule}{avoid_rule}{city_rule}"
        "- 장소명에 'Unknown', 'Unnamed', 'N/A' 금지. 이름이 불명확하면 카테고리+동네형 한국어 설명 이름을 만들어라 "
        "(예: '삿포로 시내 카페', '스스키노 인기 라멘집').\n"
        "\n"
        "### 💸 예산 산출 규칙\n"
        f"- 여행 일수: {days_hint}일 기준으로 계산하라.\n"
        "- 통화는 모두 **KRW(원)** 으로 환산하여 **정수**만 사용하라.\n"
        "- 항목은 최소 `meals`(하루 3끼+간식), `transport`(현지 이동), `tickets`(입장/체험), `etc`(예비비)로 분해하여 합산한다.\n"
        "- 사용자가 '먹방/food/맛집' 성향이면 식비를 **1.6~2.0배** 가중한다. 가족/커플이면 `etc`를 약간(10~20%) 추가한다.\n"
        "- 대중교통 선호 시 transport는 지하철/버스 기준, 자가용이면 유류/주차를 고려하되 보수적으로 잡아라.\n"
        "- 최종 합계는 `estimated_budget`에 넣고, 항목별 합은 `budget_breakdown` 객체에 넣어라.\n"
        "- 모든 값은 **KRW 정수**로만 제공하라 (쉼표/단위/문장 금지).\n"
    )

    # 7) 최종 결합
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
        return []
    n = 1 if speed == SpeedProfile.BALANCED else 2
    docs = _query_chroma(query_emb, month, season_hint) if query_emb is not None else []
    limit = 1200 if speed == SpeedProfile.BALANCED else 2400
    return [_compress(d, limit) for d in docs[:n]]


# LLM 호출 — 동기 컨텍스트 전용

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

def _extract_variant_from_prefs(prompt: str) -> int:
    try:
        m = re.search(r'"_variant"\s*:\s*(\d+)', prompt)
        return int(m.group(1)) if m else 0
    except Exception:
        return 0

def _call_gemini(prompt: str, speed: SpeedProfile):
    """
    모든 SpeedProfile에서 gemini-2.5-flash만 사용.
    variant>0인 경우 살짝 더 다양한 샘플(temperature 0.8) 시도.
    """
    global LAST_USED_MODEL
    candidates = ["models/gemini-2.5-flash"]
    base_temp = 0.6
    v = _extract_variant_from_prefs(prompt)
    temp = 0.8 if v and v > 0 else base_temp

    last_err = None
    for mid in candidates:
        logger.info("[RAG] ▶ try: %s (speed=%s, temp=%.2f, variant=%s)", mid, speed.value, temp, v)
        try:
            result = _call_gemini_with_schema(prompt, mid, temp)
            LAST_USED_MODEL = mid
            logger.info("[RAG] ✅ success: %s", mid)
            return result
        except Exception as e:
            last_err = e
            logger.warning("[RAG] ⚠️ %s failed: %s", mid, e)
    raise RuntimeError(f"Gemini 호출 실패: {last_err}")


# 후처리 유틸

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

# ── Day1 공항/체크인 블록 보장 ─────────────────────────────
import re as _re_patch

_AIRPORT_RX = _re_patch.compile(r"(공항|airport|aeroport|aéroport|aeropuerto|aeroporto)", _re_patch.I)
_CHECKIN_RX = _re_patch.compile(r"(체크\s*인|체크인|check-?\s*in|숙소\s*(체크인|도착|짐\s*(풀|보관)))", _re_patch.I)

def _has_airport_block(arr):
    return any(_AIRPORT_RX.search((x or {}).get("activity", "")) for x in (arr or []))

def _has_checkin_block(arr):
    return any(_CHECKIN_RX.search((x or {}).get("activity", "")) for x in (arr or []))



# 1일차 도착·체크인 보정 (지역 중립)

import datetime as _dt
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

def _add_minutes(hhmm: str, minutes: int) -> str:
    if not _HHMM.match(hhmm or ""):
        return hhmm
    h, m = map(int, hhmm.split(":"))
    t = _dt.datetime(2000,1,1,h,m) + _dt.timedelta(minutes=minutes)
    return t.strftime("%H:%M")

def _slot(start: str, end_plus_min: int = 60) -> str:
    end = _add_minutes(start, end_plus_min) if _HHMM.match(start or "") else None
    return f"{start}-{end or '00:00'}"

_AIRPORT_RE = re.compile(r"(공항|airport|空港)", re.I)
_CHECKIN_RE = re.compile(r"(체크\s*인|체크인|check-?\s*in|숙소|호텔)", re.I)

def _ensure_day1_arrival_checkin(item: Dict[str, Any], survey_preferences: dict) -> Dict[str, Any]:
    """
    schedule[0] (1일차)에
      1) '공항 도착 및 시내 이동'
      2) '호텔 체크인 및 짐 정리 (숙소명)'
    두 블록이 없다면 중립 문구로 삽입.
    """
    sch = item.get("schedule") or []
    if not sch or not isinstance(sch, list):
        return item

    day1 = sch[0]
    acts = day1.get("activities") or []
    if not isinstance(acts, list):
        acts = []

    has_airport = any(_AIRPORT_RE.search(str(a.get("activity",""))) for a in acts)
    has_checkin = any(_CHECKIN_RE.search(str(a.get("activity",""))) for a in acts)
    if has_airport and has_checkin:
        return item

    city = (item.get("city") or "").strip()
    hotels = (item.get("lodging") or {}).get("hotels") or []
    hotel_name = ""
    if hotels and isinstance(hotels, list):
        h0 = hotels[0] or {}
        hotel_name = (h0.get("name_ko") or h0.get("name_original") or h0.get("name") or "숙소").strip()

    tr = survey_preferences or {}
    arrival_airport = str(tr.get("arrivalAirportName") or "").strip()
    arrival_time    = str(tr.get("arrivalTime") or "").strip()     # "HH:MM"일 때만 사용
    transfer_hint   = str(tr.get("arrivalTransferHint") or tr.get("arrivalTransit") or "").strip()
    checkin_time    = str(((item.get("lodging") or {}).get("checkinTime")) or tr.get("checkinTime") or "").strip()

    airport_label = arrival_airport or (f"{city} 공항" if city else "공항")
    move_phrase = f"{airport_label} 도착 및 {city or '도시'} 시내 이동"
    if transfer_hint:
        move_phrase += f" ({transfer_hint})"  # 힌트 있을 때만 표시

    new_acts = list(acts)

    # A) 공항 도착/이동
    if not has_airport:
        t1 = arrival_time if _HHMM.match(arrival_time) else "13:00"
        new_acts.insert(0, {"time": _slot(t1), "activity": move_phrase})

    # B) 호텔 체크인/짐 정리
    if not has_checkin:
        if checkin_time and _HHMM.match(checkin_time):
            t2 = checkin_time
        else:
            lead = new_acts[0]["time"].split("-")[0] if new_acts and "time" in new_acts[0] else "14:00"
            t2 = _add_minutes(lead, 60) if _HHMM.match(lead) else "14:00"
        checkin_phrase = f"호텔 체크인 및 짐 정리 ({hotel_name or '숙소'})"
        insert_idx = 1 if (not has_airport) else 0
        new_acts.insert(insert_idx, {"time": _slot(t2), "activity": checkin_phrase})

    day1["activities"] = new_acts
    sch[0] = day1
    item["schedule"] = sch
    return item

def _split_arrival_combo(day1_acts: List[Dict[str,str]]) -> List[Dict[str,str]]:
    out = []
    for a in day1_acts:
        text = str(a.get("activity",""))
        if "공항" in text and ("체크인" in text or "짐" in text or "숙소" in text):
            start = (a.get("time","") or "13:00-14:00").split("-")[0]
            mid   = _add_minutes(start, 60)
            out.append({"time": _slot(start, 60), "activity": re.sub(r"(→|,).*$", "", text).strip()})
            out.append({"time": _slot(mid, 60),   "activity": "숙소 체크인 및 짐 정리"})
        else:
            out.append(a)
    return out

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


# 이름/좌표 보강 (속도/퀄리티 최적화)

def _ensure_airport_place(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """설문/도시명 기반으로 공항 마커를 만들어서 돌려줌."""
    city = (item.get("city") or "").strip()
    country = (item.get("country") or "").strip()

    # get_rag_recommendation에서 item["_survey"] = survey_preferences 해줄 거라 가정
    tr = (item.get("_survey") or {}) if isinstance(item.get("_survey"), dict) else {}

    name = (tr.get("arrivalAirportName") or f"{city} 공항").strip()
    lat = tr.get("arrivalLat")
    lng = tr.get("arrivalLng")

    if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float))):
        g_lat, g_lng = _geocode_text(name, city, country)
        if g_lat is not None and g_lng is not None:
            lat, lng = g_lat, g_lng
        else:
            return None

    return {
        "id": "airport_main",
        "name_original": name,
        "name_ko": name,
        "category": "공항",
        "lat": float(lat),
        "lng": float(lng),
        "name": name,
    }


# 이름→좌표 (호텔/명소 좌표 누락 보완)

def _geocode_text(name: str, city: str, country: str) -> Tuple[Optional[float], Optional[float]]:
    """이름+도시로 대략 좌표 추정 (호텔/명소 좌표 누락 보완)."""
    if not MAPBOX_TOKEN or not name:
        return None, None
    try:
        q = f"{name} {city or ''} {country or ''}".strip()
        url = (
            "https://api.mapbox.com/geocoding/v5/mapbox.places/"
            f"{requests.utils.quote(q)}.json?types=poi&limit=1&language=ko&access_token={MAPBOX_TOKEN}"
        )
        r = requests.get(url, timeout=1.8)
        r.raise_for_status()
        js = r.json()
        feat = (js.get("features") or [None])[0]
        if feat and "center" in feat:
            lng, lat = feat["center"]
            return float(lat), float(lng)
    except Exception as e:
        logger.debug("[RAG] hotel geocode fail '%s': %s", name, e)
    return None, None



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
    - lodging.hotels / lodging.areas 정보를 allPlaces에 병합
    - 호텔 좌표 누락 시 지오코딩 → 권역 → 기존 POI 좌표로 보완
    - 호텔이 하나라도 있으면 lodging.mode = "hotels" 로 강제
    - 카테고리 통일: 호텔도 '숙박'으로 표준화 (프론트 필터와 일치)
    """
    # hotels가 lodging 바깥에 바로 있을 때 하위호환 처리
    if not item.get("lodging") and item.get("hotels"):
        item["lodging"] = {"hotels": item.pop("hotels"), "areas": item.get("areas") or []}

    if speed == SpeedProfile.FAST:
        return item

    aps = item.get("allPlaces") or []
    lodg = item.get("lodging") or {}
    city = (item.get("city") or "").strip()
    country = (item.get("country") or "").strip()

    hotels: List[Dict[str, Any]] = []
    areas: List[Dict[str, Any]] = []

    # 1) 호텔 우선 수집 (좌표 없으면 지오코딩/권역/도시중심/첫 POI 순서로 보완)
    for idx, h in enumerate(lodg.get("hotels") or []):
        lat, lng = h.get("lat"), h.get("lng")
        try:
            lat, lng = float(lat), float(lng)
        except Exception:
            lat, lng = None, None

        if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float))):
            qname = (h.get("name_original") or h.get("name_ko") or h.get("name") or "").strip()
            g_lat, g_lng = _geocode_text(qname, city, country)
            if g_lat is not None and g_lng is not None:
                lat, lng = g_lat, g_lng
            else:
                # 권역 → 도시중심 → 첫 POI fallback
                a0 = (lodg.get("areas") or [None])[0] or {}
                lat = a0.get("lat") or (aps[0].get("lat") if aps else None)
                lng = a0.get("lng") or (aps[0].get("lng") if aps else None)

        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            hotels.append({
                "id": f"lodg_hote_{idx+1}",
                "name_original": h.get("name_original") or h.get("name") or "",
                "name_ko": h.get("name_ko"),
                "category": "숙박",         # ✅ 지도/리스트 필터 통일
                "lat": float(lat),
                "lng": float(lng),
            })

    # 2) 숙박 권역 수집
    for idx, a in enumerate(lodg.get("areas") or []):
        try:
            lat, lng = float(a["lat"]), float(a["lng"])
        except Exception:
            continue
        areas.append({
            "id": f"lodg_area_{idx+1}",
            "name_original": a.get("name_original") or "",
            "name_ko": a.get("name_ko"),
            "category": "숙박",
            "lat": lat,
            "lng": lng,
        })

    # 3) 호텔이 하나도 없으면 권역/도시중심으로 '숙박' 대체 마커 1개 생성
    if not hotels:
        seed = areas[0] if areas else (aps[0] if aps else None)
        if seed and isinstance(seed.get("lat"), (int, float)) and isinstance(seed.get("lng"), (int, float)):
            hotels.append({
                "id": "lodg_hote_fallback_1",
                "name_original": f"{city} Central Hotel",
                "name_ko": f"{city} 추천 숙소(중심가)",
                "category": "숙박",        # ✅ 통일
                "lat": float(seed["lat"]),
                "lng": float(seed["lng"]),
            })

    # 4) 호텔 → 권역 → 기존 POI 순으로 병합, 좌표 중복은 숙박(호텔) 우선 유지
    merged: List[Dict[str, Any]] = []
    seen = set()

    def _push(p: Dict[str, Any]):
        key = (round(float(p["lat"]), 6), round(float(p["lng"]), 6))
        if key in seen:
            # 같은 좌표면 숙박(호텔/권역)을 남기고 기타는 스킵
            if p.get("category") not in ("숙박",):
                return
        seen.add(key)
        merged.append(p)

    for p in hotels: _push(p)
    for p in areas:  _push(p)
    for p in aps:    _push(p)

    # 5) id/name 채우기
    for i, p in enumerate(merged):
        p.setdefault("id", f"poi_{i+1}")
        p.setdefault("name", p.get("name_ko") or p.get("name_original") or "")

    # 6) 호텔 존재 여부에 따라 lodging.mode 자동 세팅
    try:
        if item.get("lodging") is None:
            item["lodging"] = {}
        if hotels:
            item["lodging"]["mode"] = "hotels"  # ✅ 호텔 우선
        elif areas:
            item["lodging"]["mode"] = "area"
    except Exception:
        pass
    
    
    item["allPlaces"] = merged
    return item



# 도시 중심 기반 필터 (옵션)

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

def _cleanup_unknowns(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    allPlaces 안에 이름이 비었거나 Unknown/Unnamed 같은 값인 경우
    카테고리/도시 힌트로 안전한 한국어 이름을 채워 넣는다.
    """
    def _bad(n: str) -> bool:
        s = (n or "").strip().lower()
        return (not s) or s in {"unknown", "unnamed", "poi", "point of interest", "n/a"}

    city_hint = (item.get("city") or "").strip() or "시내"
    cleaned: List[Dict[str, Any]] = []
    for p in (item.get("allPlaces") or []):
        name_ko = p.get("name_ko") or p.get("name") or p.get("name_original") or ""
        if _bad(name_ko):
            cat = (p.get("category") or "추천 장소").strip()
            name_ko = f"{city_hint} {cat}"
        p["name_ko"] = name_ko
        p.setdefault("name", name_ko)
        cleaned.append(p)
    item["allPlaces"] = cleaned
    return item

# 지도 표시용: 대표 숙소를 days[].stops에도 주입
def _almost_same(a: float, b: float, tol: float = 3e-5) -> bool:
    return abs(a - b) <= tol

def _has_point(stops: List[Dict[str, float]], lat: float, lng: float, tol: float = 3e-5) -> bool:
    for s in stops or []:
        if _almost_same(float(s.get("lat", 999)), lat, tol) and _almost_same(float(s.get("lng", 999)), lng, tol):
            return True
    return False

def _pick_primary_lodging(item: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """
    allPlaces에서 '숙박' 카테고리 중 호텔(id가 lodg_hote_*) 우선으로 1개 선택.
    없으면 lodg_area_* 1개를 반환.
    """
    aps = item.get("allPlaces") or []
    hotel = next((p for p in aps if p.get("category") == "숙박" and str(p.get("id","")).startswith("lodg_hote_")), None)
    if hotel and isinstance(hotel.get("lat"), (int, float)) and isinstance(hotel.get("lng"), (int, float)):
        return float(hotel["lat"]), float(hotel["lng"])
    area = next((p for p in aps if p.get("category") == "숙박" and str(p.get("id","")).startswith("lodg_area_")), None)
    if area and isinstance(area.get("lat"), (int, float)) and isinstance(area.get("lng"), (int, float)):
        return float(area["lat"]), float(area["lng"])
    return None

def _pick_airport(item: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    ap = next((p for p in (item.get("allPlaces") or []) if p.get("category") == "공항"), None)
    if ap and isinstance(ap.get("lat"), (int, float)) and isinstance(ap.get("lng"), (int, float)):
        return float(ap["lat"]), float(ap["lng"])
    return None

def _inject_lodging_into_days(item: Dict[str, Any], policy: str = "airport_first") -> Dict[str, Any]:
    """
    대표 숙소 좌표를 day_1과 마지막 날 stops에 주입.
    - day_1: 공항 다음(airport_first) 위치로 삽입, 없으면 맨 앞.
    - 마지막 날: 공항 바로 앞 위치로 삽입.
    이미 동일 좌표가 있으면 중복 삽입하지 않음.
    """
    days = item.get("days") or []
    if not days:
        return item

    pick = _pick_primary_lodging(item)
    if not pick:
        return item
    hlat, hlng = pick

    # ----- 1일차 처리 -----
    d0 = days[0].get("stops") or []
    if not _has_point(d0, hlat, hlng, tol=3e-5):
        insert_idx = 0
        if policy == "airport_first":
            ap = _pick_airport(item)
            if ap:
                for i, s in enumerate(d0):
                    if _almost_same(float(s.get("lat", 0)), ap[0]) and _almost_same(float(s.get("lng", 0)), ap[1]):
                        insert_idx = i + 1
                        break
        d0.insert(insert_idx, {"lat": hlat, "lng": hlng})
        days[0]["stops"] = d0

    # ----- 마지막 날 처리 -----
    last_i = len(days) - 1
    dl = days[last_i].get("stops") or []
    if not _has_point(dl, hlat, hlng, tol=3e-5):
        insert_idx = max(len(dl) - 1, 0)  # 마지막(공항) 바로 앞
        dl.insert(insert_idx, {"lat": hlat, "lng": hlng})
        days[last_i]["stops"] = dl

    item["days"] = days
    return item


# 메인
def get_rag_recommendation(
    survey_preferences: dict,
    speed: SpeedProfile = DEFAULT_SPEED,
    num_cities: int = 1,
    fresh: bool = False,
) -> Dict[str, Any]:
    """RAG-lite + flash 우선 + 보강 상한 + 캐시. 결과는 최상위 배열(JSON)."""
    def _t(): return time.perf_counter()

    cache_key = _prefs_key(survey_preferences, speed, num_cities)
    if (not fresh) and cache_key in _CACHE:
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
        # Day1 최소 시작 시각(프롬프트 규칙과 동일하게 산출)
    try:
        _dw = survey_preferences.get("depart_window")
        _rw = survey_preferences.get("return_window")
        min_start, _, _ = prompt_builder._window_to_bounds(_dw, _rw)
    except Exception:
        min_start = "13:00"


    fixed: List[Dict[str, Any]] = []
    for item in (arr or []):
        if not isinstance(item, dict):
            continue
        item["_survey"] = survey_preferences
        sch = item.get("schedule") or []
        item["schedule"] = _ensure_days(sch, days)
        item = _ensure_day1_arrival_checkin(item, survey_preferences)
        item = _lodging_areas_to_text(item)
        day1 = item["schedule"][0]
        day1["activities"] = _split_arrival_combo(day1.get("activities", []))
        item["schedule"][0] = day1

        # Mapbox + 폴백 보강
        item = _enrich_all_places_ko(item, speed)

        # Unknown 방어선
        item = _cleanup_unknowns(item)

        item = _inject_lodging_into_days(item, policy=MAP_MARKER_POLICY)

        # 필요시 반경 필터
        # item = _filter_outliers(item, max_km=120.0)

        # ✅ LLM 예산 → meta.budget로 매핑
        try:
            est = item.get("estimated_budget")
            brk = item.get("budget_breakdown") or {}
            if isinstance(est, (int, float)) and est > 0:
                mb = {
                    "estimatedTotalKRW": int(est),
                    "breakdown": {k: int(v) for k, v in brk.items() if isinstance(v, (int, float))},
                }
                meta = item.get("meta") or {}
                bud = meta.get("budget") or {}
                bud.update(mb)
                meta["budget"] = bud
                item["meta"] = meta
        except Exception as e:
            logger.debug("[RAG] inject estimated budget to meta fail: %s", e)

        fixed.append(item)
    t4 = _t()

    logger.info(
        "[RAG][latency] embed=%.2fs chroma=%.2fs llm=%.2fs post=%.2fs total=%.2fs (model=%s)",
        t1 - t0, t2 - t1, t3 - t2, t4 - t3, t4 - t0, LAST_USED_MODEL
    )

    result = {"recommendation": fixed, "prompt": final_prompt}
    _CACHE[cache_key] = result
    return result
