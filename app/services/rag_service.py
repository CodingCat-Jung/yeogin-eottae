# import google.generativeai as genai
# import chromadb
# import os
# import json
# from dotenv import load_dotenv

# # --- RAG 로직에 필요한 설정 ---
# project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
# API_KEY = os.getenv("GOOGLE_API_KEY")

# # API 키가 로드되었는지 확인
# if not API_KEY:
#     raise ValueError("RAG Service: .env 파일에서 GOOGLE_API_KEY를 찾을 수 없습니다.")
# genai.configure(api_key=API_KEY)
# # --- 설정 끝 ---


# def get_rag_recommendation(survey_preferences: dict) -> list:
#     """
#     사용자 설문조사를 기반으로 RAG를 사용하여 여행 추천을 생성합니다.
#     """
    
#     # 1. 벡터 데이터베이스에 연결
#     print("[RAG] 벡터 DB에 연결하여 유사한 사례 검색 중...")
#     client = chromadb.PersistentClient(path=os.path.join(project_root, "chroma_db"))
#     collection = client.get_collection(name="recommendations")

#     # 2. 새로운 사용자 설문을 임베딩하여 검색 쿼리로 사용
#     query_text = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    
#     query_embedding = genai.embed_content(
#         model="models/text-embedding-004",
#         content=query_text,
#         task_type="RETRIEVAL_QUERY"
#     )['embedding']

#     # 3. 벡터 DB에서 유사한 '성공 사례' 검색
#     retrieved_results = collection.query(
#         query_embeddings=[query_embedding],
#         n_results=3, # 상위 3개의 유사한 사례를 가져옵니다.
#         where={"rating": {"$gte": 4}} # 평점이 4점 이상인 데이터만 필터링
#     )

#     # 4. 검색된 사례를 AI에게 제공할 '참고 자료(Context)'로 가공
#     context = (
#         "당신은 최고의 여행 전문가 AI입니다.\n"
#         "아래의 <참고 자료>는 현재 사용자와 비슷한 요청에 대해 과거에 매우 좋은 평가를 받았던 추천 사례들입니다.\n"
#         "이 사례들을 참고하여 <새로운 사용자 요청>에 대한 최고의 여행 계획을 JSON 형식으로 추천해주세요.\n\n"
#     )
              
#     context += "<참고 자료>\n"
#     # retrieved_results['documents']는 리스트의 리스트 형태이므로 [0]으로 접근합니다.
#     if retrieved_results and retrieved_results['documents'] and retrieved_results['documents'][0]:
#         for i, doc in enumerate(retrieved_results['documents'][0]):
#             context += f"--- 참고 사례 {i+1} ---\n{doc}\n\n"
#     else:
#         context += "참고할만한 과거 사례가 없습니다.\n\n"

#     # 5. 최종 프롬프트 생성
#     final_prompt = f"""
#     {context}
#     ---
#     <새로운 사용자 요청>
#     {query_text}

#     ---
#     이제 위의 모든 정보를 종합하여, 새로운 사용자를 위한 추천 결과를 JSON 배열 형식으로만 생성해주세요.
#     """

#     print("[RAG] AI에게 최종 프롬프트를 전달하여 추천 생성 중...")
    
#     # 6. 최종 프롬프트를 Gemini 모델에 보내서 결과 받기
#     model = genai.GenerativeModel('models/gemini-1.5-pro-latest')
#     generation_config = genai.types.GenerationConfig(
#         response_mime_type="application/json"
#     )
#     response = model.generate_content(final_prompt, generation_config=generation_config)
    
#     # 7. 최종 결과 반환
#     recommendation = json.loads(response.text)
    
#     return recommendation


# app/services/rag_service.py
# app/services/rag_service.py
import os
import json
import math
import logging
from types import SimpleNamespace
from dotenv import load_dotenv
from typing import Optional

import requests
import chromadb
import google.generativeai as genai
from google.ai.generativelanguage import Schema, Type  # Structured Output
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
TENANT_HINT = (
    "ChromaDB 연결 실패: Could not connect to tenant default_tenant. "
    f"'{CHROMA_PATH}' 폴더가 존재하고 쓰기 가능하며, 임베딩이 올라가 있는지 확인하세요."
)
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")

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
        },
        required=["city", "reason", "schedule"],
    ),
)

# ────────────────────────────────────────────────────────────────
# 유틸
# ────────────────────────────────────────────────────────────────
def _adapt_to_array(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ["recommendation", "recommendations", "data", "cities", "plans", "plan"]:
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
    key = s[:3].lower()
    return map_en.get(key)

def _month_to_season(m: Optional[int]) -> Optional[str]:
    if not m:
        return None
    if m in (3, 4, 5):
        return "SPRING"
    if m in (6, 7, 8):
        return "SUMMER"
    if m in (9, 10, 11):
        return "FALL"
    return "WINTER"

def _build_final_prompt(survey_preferences: dict, retrieved_docs: list[str]) -> str:
    context = (
        "당신은 최고의 여행 전문가 AI입니다.\n"
        "아래 <참고 자료>는 과거 유사 요청에서 높은 평가를 받은 추천 사례들입니다.\n"
        "이 자료를 참고하되 그대로 복사하지 말고, 현재 사용자 선호에 맞게 새롭게 생성하세요.\n\n"
        "<참고 자료>\n"
    )
    if retrieved_docs:
        for i, doc in enumerate(retrieved_docs, start=1):
            context += f"--- 참고 사례 {i} ---\n{doc}\n\n"
    else:
        context += "참고 자료 없음.\n\n"

    prefs_ns = SimpleNamespace(**survey_preferences)
    base_prompt = prompt_builder.generate_prompt_from_survey(prefs_ns)

    hard_rules = """
[출력 형식 고정 규칙 (중요)]
- 최종 출력은 'data' 키 없이 **바로 JSON 배열만** 출력한다.
- 도시(배열 요소)는 2~3개를 권장한다.
- 불필요한 자연어 문장/설명/코드블록은 절대 포함하지 않는다.
""".strip()

    user_block = f"<새로운 사용자 요청>\n사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"

    return f"{context}\n{base_prompt}\n\n{hard_rules}\n\n{user_block}"

def _query_chroma(query_emb, month: Optional[int], season_hint: Optional[str]):
    try:
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        collection = client.get_or_create_collection(name="recommendations")
    except Exception as e:
        logger.error("[RAG] PersistentClient 연결 실패: %s", e)
        raise RuntimeError(TENANT_HINT)

    where = {"rating": {"$gte": 4}}
    season = (season_hint or _month_to_season(month))
    if season:
        where = {"$and": [where, {"season": {"$eq": season}}]}

    try:
        retrieved = collection.query(query_embeddings=[query_emb], n_results=3, where=where)
    except Exception as e:
        logger.warning("[RAG] where 필터 실패 → 필터 없이 재시도: %s", e)
        retrieved = collection.query(query_embeddings=[query_emb], n_results=3)

    docs = []
    if retrieved and retrieved.get("documents") and retrieved["documents"][0]:
        docs = retrieved["documents"][0]
    return docs

def _call_gemini_with_schema(prompt: str, model_name: str):
    model = genai.GenerativeModel(model_name)
    cfg = genai.types.GenerationConfig(
        response_mime_type="application/json",
        response_schema=RECOMMENDATION_SCHEMA,
    )
    resp = model.generate_content(prompt, generation_config=cfg)
    if getattr(resp, "parsed", None):
        return resp.parsed
    raw = resp.text or ""
    logger.error("[RAG] structured 응답 없음. raw text 앞 500자: %s", raw[:500])
    parsed = json.loads(raw)
    return parsed if parsed is not None else []

def _call_gemini(prompt: str):
    schema_candidates = [
        "models/gemini-2.5-pro",
        "models/gemini-2.5-flash",
        "models/gemini-pro-latest",
        "models/gemini-flash-latest",
    ]
    last_err = None
    for mid in schema_candidates:
        try:
            return _call_gemini_with_schema(prompt, mid)
        except Exception as e:
            last_err = e
            logger.warning("[RAG] 모델 %s 시도 실패: %s", mid, e)
    raise RuntimeError(f"Gemini 호출 실패: {last_err}")

def _ensure_days(schedule, days: int):
    if not isinstance(schedule, list):
        schedule = []

    def _normalize_day_label(idx):
        return f"day_{idx}"

    cur = []
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

def _lodging_areas_to_text(item: dict) -> dict:
    """
    LLM이 생성한 item["lodging"]["areas"] -> item["lodging_area"] (문장)로 변환.
    프론트는 lodging_area(string)만 사용하므로 호환을 위해 한 줄 요약 문자열로 매핑.
    """
    if item.get("lodging_area"):
        return item  # 이미 있으면 그대로

    lodg = item.get("lodging") or {}
    areas = lodg.get("areas") or []
    if not isinstance(areas, list) or not areas:
        return item

    # 상위 2곳 정도만 요약
    labels = []
    for a in areas[:2]:
        name = (a.get("name_ko") or a.get("name_original") or "").strip()
        why  = (a.get("why") or "").strip()
        hint = a.get("budget_hint") or ""
        segs = [name] if name else []
        if hint:
            segs.append(hint)
        if why:
            segs.append(why)
        if segs:
            labels.append(" / ".join(segs))

    if labels:
        item["lodging_area"] = " · ".join(labels)
    return item    

# ────────────────────────────────────────────────────────────────
# 이름/좌표 보강 유틸
# ────────────────────────────────────────────────────────────────
def _simple_ko(name: str) -> str:
    import re
    s = name or ""
    rep = [
        (r"\bStation\b", "역"), (r"\bTower\b", "타워"), (r"\bPark\b", "공원"),
        (r"\bShrine\b", "신사"), (r"\bTemple\b", "사원"), (r"\bCastle\b", "성"),
        (r"\bMarket\b", "시장"), (r"\bShopping Street\b", "상점가"),
        (r"\bMuseum\b", "박물관"), (r"\bGarden\b", "정원"), (r"\bUniversity\b", "대학"),
    ]
    for pat, ko in rep:
        s = re.sub(pat, ko, s, flags=re.IGNORECASE)
    s = re.sub(r"\bSapporo\b", "삿포로", s, flags=re.IGNORECASE)
    s = re.sub(r"\bHokkaido\b", "홋카이도", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTokyo\b", "도쿄", s, flags=re.IGNORECASE)
    s = re.sub(r"\bOsaka\b", "오사카", s, flags=re.IGNORECASE)
    return s.strip()

def _enrich_place_name_ko(p: dict) -> dict:
    if p.get("name_ko"):
        return p
    lat, lng = p.get("lat"), p.get("lng")
    if MAPBOX_TOKEN and isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        try:
            url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json?types=poi&language=ko&limit=1&access_token={MAPBOX_TOKEN}"
            r = requests.get(url, timeout=4)
            r.raise_for_status()
            js = r.json()
            feat = (js.get("features") or [None])[0]
            text_ko = feat.get("text_ko") or feat.get("text") if feat else None
            if text_ko:
                p["name_ko"] = text_ko
        except Exception as e:
            logger.debug("[RAG] Mapbox ko name enrich fail: %s", e)
    if not p.get("name_ko"):
        no = p.get("name_original") or p.get("name") or ""
        p["name_ko"] = _simple_ko(no)
    return p

def _enrich_all_places_ko(item: dict) -> dict:
    aps = item.get("allPlaces") or []
    out = []
    for idx, p in enumerate(aps):
        if not isinstance(p, dict):
            continue
        p.setdefault("id", f"poi_{idx+1}")
        p.setdefault("name_original", p.get("name") or "")
        p = _enrich_place_name_ko(p)
        p.setdefault("name", p.get("name_ko") or p.get("name_original") or "")
        out.append(p)
    item["allPlaces"] = out
    return item

# ────────────────────────────────────────────────────────────────
# 도시 중심 기반 필터
# ────────────────────────────────────────────────────────────────
def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))

def _fetch_city_center(city: str, country: str, token: str):
    try:
        q = f"{city},{country}" if country else city
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json?types=place&limit=1&access_token={token}"
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        js = r.json()
        feat = (js.get("features") or [None])[0]
        if feat and "center" in feat:
            lng, lat = feat["center"]
            return lat, lng
    except Exception as e:
        logger.warning("[RAG] 도시 중심 좌표 가져오기 실패: %s", e)
    return None, None

def _filter_outliers(item: dict, max_km: float = 120.0) -> dict:
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
                logger.debug(f"[RAG] {city}: {p.get('name_original')} ({dist:.1f}km) 제외됨")
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
# 메인 로직
# ────────────────────────────────────────────────────────────────
def get_rag_recommendation(survey_preferences: dict) -> dict:
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

    query_text = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    try:
        query_emb = genai.embed_content(
            model="models/text-embedding-004",
            content=query_text,
            task_type="RETRIEVAL_QUERY",
        )["embedding"]
    except Exception as e:
        logger.error("[RAG] 임베딩 호출 실패: %s", e)
        raise RuntimeError("임베딩 API 연결 실패")

    docs = _query_chroma(query_emb, month, season_hint)
    final_prompt = _build_final_prompt(survey_preferences, docs)

    data = _call_gemini(final_prompt)
    arr = _adapt_to_array(data)
    if isinstance(arr, list) and len(arr) < 2:
        logger.info("[RAG] 도시가 1개만 생성되어 한 번 재시도합니다.")
        data2 = _call_gemini(f"{final_prompt}\n\n[추가 지시] 반드시 2개 이상의 도시를 포함하라.")
        arr2 = _adapt_to_array(data2)
        if arr2:
            arr = arr2

    try:
        days = prompt_builder._extract_days(survey_preferences.get("duration", "") or "")
    except Exception:
        days = 3

    fixed = []
    for item in (arr or []):
        if not isinstance(item, dict):
            continue
        sch = item.get("schedule") or []
        item["schedule"] = _ensure_days(sch, days)
        item = _enrich_all_places_ko(item)
        item = _filter_outliers(item)
        item = _lodging_areas_to_text(item)   # ✅ 이 한 줄 추가
        fixed.append(item)

    return {"recommendation": fixed, "prompt": final_prompt}
