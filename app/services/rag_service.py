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
import os
import json
import logging
from types import SimpleNamespace
from dotenv import load_dotenv

import chromadb
import google.generativeai as genai
from google.ai.generativelanguage import Schema, Type  # Structured Output

from app.services import prompt_builder  # 프롬프트는 반드시 여기서 생성

logger = logging.getLogger(__name__)

# ── ENV ─────────────────────────────────────────────────────────────
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("RAG Service: .env 파일에서 GOOGLE_API_KEY를 찾을 수 없습니다.")
genai.configure(api_key=API_KEY)

CHROMA_PATH = os.path.join(REPO_ROOT, "chroma_db")
TENANT_HINT = (
    "ChromaDB 연결 실패: Could not connect to tenant default_tenant. Are you sure it exists? "
    f"'{CHROMA_PATH}' 폴더가 존재하고 쓰기 가능하며, 임베딩이 올라가 있는지 확인하세요."
)

# ── Structured Output Schema (survey.py / schedule_guard와 호환) ──
RECOMMENDATION_SCHEMA = Schema(
    type=Type.ARRAY,
    items=Schema(
        type=Type.OBJECT,
        properties={
            "city": Schema(type=Type.STRING),
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
        },
        required=["city", "reason", "schedule"],
    ),
)

# ── 유틸 ─────────────────────────────────────────────────────────────
def _adapt_to_array(payload):
    """LLM이 객체 형태로 줄 가능성까지 방어."""
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

def _build_final_prompt(survey_preferences: dict, retrieved_docs: list[str]) -> str:
    """RAG 컨텍스트 + prompt_builder 프롬프트 결합."""
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

    # prompt_builder 사용(중요)
    prefs_ns = SimpleNamespace(**survey_preferences)
    base_prompt = prompt_builder.generate_prompt_from_survey(prefs_ns)

    hard_rules = """
[출력 형식 고정 규칙 (중요)]
- 최종 출력은 'data' 키 없이 **바로 JSON 배열만** 출력한다. (예: [ { "city": "...", ... }, ... ])
- 도시(배열 요소)는 2~3개를 권장한다. (가능하면 2개 이상 생성)
- 불필요한 자연어 문장/설명/코드블록은 절대 포함하지 않는다.
""".strip()

    user_block = f"<새로운 사용자 요청>\n사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"

    return f"{context}\n{base_prompt}\n\n{hard_rules}\n\n{user_block}"

def _query_chroma(query_emb):
    """Chroma에서 유사 문서를 가져온다. 메타 where 실패 시 필터 없이 재시도."""
    try:
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        collection = client.get_or_create_collection(name="recommendations")
    except Exception as e:
        logger.error("[RAG] PersistentClient 연결 실패: %s", e)
        raise RuntimeError(TENANT_HINT)

    try:
        retrieved = collection.query(
            query_embeddings=[query_emb],
            n_results=3,
            where={"rating": {"$gte": 4}},
        )
    except Exception as e:
        logger.warning("[RAG] where 필터 실패 → 필터 없이 재시도: %s", e)
        retrieved = collection.query(query_embeddings=[query_emb], n_results=3)

    docs = []
    if retrieved and retrieved.get("documents") and retrieved["documents"][0]:
        docs = retrieved["documents"][0]
    return docs

def _call_gemini_with_schema(prompt: str, model_name: str):
    """Structured Output로 호출."""
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
    return json.loads(raw)

def _call_gemini_noschema(prompt: str, model_name: str):
    """스키마 미지원 모델용: 프롬프트로 JSON만 강제."""
    model = genai.GenerativeModel(model_name)
    strong = (
        prompt
        + "\n\n[매우 중요] 반드시 **JSON 배열만** 출력하라. "
          "자연어 문장/설명/코드블록 금지. 스키마: "
          "[{ \"city\":\"string\", \"reason\":\"string\", "
          "\"schedule\":[{ \"day\":\"day_1\", "
          "\"activities\":[{\"time\":\"HH:MM-HH:MM\",\"activity\":\"string\"}]}]}]"
    )
    resp = model.generate_content(strong)
    raw = getattr(resp, "text", "") or ""
    return json.loads(raw)

def _call_gemini(prompt: str):
    """
    모델 폴백 체인:
    1) (스키마) gemini-1.5-pro → 1.5-flash → 1.0-pro → 1.5-pro-latest → 1.5-flash-latest
    2) (노스키마) chat-bison-001 → text-bison-001
    실패 시 사용 가능한 모델 목록을 로그로 남김.
    """
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

    # 구형 PaLM 폴백(스키마X)
    noschema_candidates = [
        "models/chat-bison-001",
        "models/text-bison-001",
    ]
    for mid in noschema_candidates:
        try:
            return _call_gemini_noschema(prompt, mid)
        except Exception as e:
            last_err = e
            logger.warning("[RAG] (noschema) 모델 %s 시도 실패: %s", mid, e)

    # 사용 가능한 모델 리스트 로그로 출력
    try:
        names = [m.name for m in genai.list_models()]
        logger.error("[RAG] 사용 가능한 모델 목록: %s", names)
    except Exception as _e:
        logger.error("[RAG] 모델 목록 조회 실패: %s", _e)

    raise RuntimeError(f"Gemini 호출 실패(모든 후보 모델 시도 실패): {last_err}")

# ── 일정 일수 보정 ─────────────────────────────────────────────────
def _ensure_days(schedule, days: int):
    """
    모델이 days개보다 적게/많게 줄 때 보정.
    - 부족분은 안전한 미니 템플릿으로 채움
    - 초과분은 슬라이스
    """
    if not isinstance(schedule, list):
        schedule = []

    # day label 정규화: "1일차" → "day_1" 형태로 통일
    def _normalize_day_label(idx):
        return f"day_{idx}"

    cur = []
    # 먼저 있는 것들에서 최대 days개만 유지
    for idx, d in enumerate(schedule[:days], start=1):
        if not isinstance(d, dict):
            d = {}
        d_day = d.get("day") or _normalize_day_label(idx)
        acts = d.get("activities") or []
        if not isinstance(acts, list):
            acts = []
        cur.append({"day": d_day, "activities": acts})

    # 부족하면 템플릿 추가
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

# ── 메인 ────────────────────────────────────────────────────────────
def get_rag_recommendation(survey_preferences: dict) -> dict:
    """
    1) prompt_builder 프롬프트 사용
    2) 쿼리 임베딩 → Chroma 유사 사례 검색 → 참고자료로 주입
    3) Gemini 호출(폴백 포함) → JSON 배열 파싱
    4) 결과 보정: 도시 수/일수 스펙 충족
    """
    # 임베딩
    query_text = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    try:
        query_emb = genai.embed_content(
            model="models/text-embedding-004",
            content=query_text,
            task_type="RETRIEVAL_QUERY",
        )["embedding"]
    except Exception as e:
        logger.error("[RAG] 임베딩 호출 실패: %s", e)
        raise RuntimeError(
            "임베딩 API 연결 실패(네트워크/방화벽 이슈 가능). "
            "VPN/프록시/방화벽 설정을 확인하거나 잠시 후 재시도하세요."
        )

    # RAG 검색
    docs = _query_chroma(query_emb)

    # 최종 프롬프트(참고자료 + prompt_builder)
    final_prompt = _build_final_prompt(survey_preferences, docs)

    # LLM 호출
    data = _call_gemini(final_prompt)
    arr = _adapt_to_array(data)

    # 도시 1개만 왔을 때 한 번 재시도
    if isinstance(arr, list) and len(arr) < 2:
        logger.info("[RAG] 도시가 1개만 생성되어 한 번 재시도합니다.")
        data2 = _call_gemini(f"{final_prompt}\n\n[추가 지시] 반드시 2개 이상의 도시를 포함한 JSON 배열을 출력하라.")
        arr2 = _adapt_to_array(data2)
        if arr2:
            arr = arr2

    # ── 일수 보정 (중요)
    try:
        days = prompt_builder._extract_days(survey_preferences.get("duration", "") or "")
    except Exception:
        days = 3  # 최후의 안전값

    fixed = []
    for item in (arr or []):
        if not isinstance(item, dict):
            continue
        sch = item.get("schedule") or []
        item["schedule"] = _ensure_days(sch, days)
        fixed.append(item)

    return {"recommendation": fixed, "prompt": final_prompt}
