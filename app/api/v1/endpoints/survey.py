# # app/api/v1/endpoints/survey.py
# from typing import Optional, List, Dict, Any

# from fastapi import APIRouter, Depends, HTTPException, Request, Header
# from starlette.concurrency import run_in_threadpool
# from sqlalchemy.orm import Session

# from app.db.session import get_db
# from app.models.recommendation import Recommendation
# from app.models.survey import Survey
# from app.schemas.survey import SurveyCreate
# from app.crud import survey_crud, recommendation_crud

# # 프롬프트 + 일수 추출
# from app.services.prompt_builder import generate_prompt_from_survey, _extract_days

# # 일정 정규화/가드/포맷 변환
# from app.services.schedule_guard import (
#     normalize_schedule_to_array,
#     guard_schedule,
#     schedule_array_to_map,
# )

# # 세션 인증 (쿠키/세션 + CSRF)
# from app.api.v1.endpoints.auth import require_auth

# # 구조화 출력으로 변경된 Gemini 클라이언트
# from gemini_api.gemini_api_client import generate_travel_recommendation

# router = APIRouter()


# @router.post("/recommend", summary="설문 저장 + AI 추천 생성(세션/CSRF 필요)")
# async def survey_and_recommend(
#     survey: SurveyCreate,
#     request: Request,
#     db: Session = Depends(get_db),
#     user: Dict[str, Any] = Depends(require_auth),
#     x_csrf_token: Optional[str] = Header(None),
# ):
#     # 1) CSRF 더블서브밋 검증
#     session_csrf = request.session.get("csrf")
#     if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
#         raise HTTPException(status_code=403, detail="CSRF token invalid")

#     # 2) 닉네임 위변조 방지: 세션 닉네임으로 강제
#     try:
#         survey = survey.model_copy(update={"nickname": user["nickname"]})  # pydantic v2
#     except Exception:
#         if hasattr(survey, "nickname"):
#             survey.nickname = user["nickname"]

#     # 3) 설문 저장
#     saved_survey = survey_crud.create_survey(db=db, survey=survey)

#     # 4) 프롬프트 생성
#     prompt = generate_prompt_from_survey(survey.preferences)

#     # 5) LLM 호출 (동기 SDK → threadpool)
#     result: Dict[str, Any] = await run_in_threadpool(generate_travel_recommendation, prompt)
#     if result.get("status") != "success":
#         raise HTTPException(status_code=502, detail=result.get("message", "AI recommendation error"))

#     raw_data: List[Dict[str, Any]] = result.get("data", [])

#     # 6) 후처리: 정규화 → 가드 → 프론트 포맷(맵)으로 변환
#     days = _extract_days(survey.preferences.duration)
#     safe_data: List[Dict[str, Any]] = []

#     for city in raw_data:
#         schedule_raw = city.get("schedule", [])

#         # 무엇이 오든 배열 표준형 [ {"day":"day_1", "activities":[...]}, ... ] 으로 정규화
#         schedule_arr = normalize_schedule_to_array(schedule_raw, days)

#         # 출/귀국 시간대 & 템포 반영한 라이트 가드
#         guarded_arr = guard_schedule(
#             schedule_arr,
#             days=days,
#             depart_window=getattr(survey.preferences, "depart_window", None),
#             return_window=getattr(survey.preferences, "return_window", None),
#             density=getattr(survey.preferences, "density", None),
#         )

#         # 프론트가 쓰는 맵 포맷 {'day_1':[...]} 으로 변환
#         city_norm = {**city, "schedule": schedule_array_to_map(guarded_arr)}
#         safe_data.append(city_norm)

#     # 7) 추천 저장
#     saved_rec = recommendation_crud.save_recommendation(
#         db=db,
#         survey_id=saved_survey.id,  # type: ignore
#         result=safe_data,
#     )

#     return {
#         "status": "success",
#         "survey_id": saved_survey.id,
#         "recommendation_id": saved_rec.id,
#         "data": safe_data,
#     }


# # ─────────────────────────────────────────────────────────
# # 아래 history/detail/delete 엔드포인트는 기존과 동일
# # ─────────────────────────────────────────────────────────

# @router.get("/history/{nickname}", summary="(본인 전용) 사용자 설문+추천 ID 목록 조회")
# def get_user_recommendation_ids(
#     nickname: str,
#     db: Session = Depends(get_db),
#     user: Dict[str, Any] = Depends(require_auth),
# ):
#     if user["nickname"] != nickname:
#         raise HTTPException(status_code=403, detail="Forbidden")

#     surveys: List[Survey] = db.query(Survey).filter(Survey.nickname == nickname).all()
#     results: List[Dict[str, Any]] = []
#     for s in surveys:
#         rec = db.query(Recommendation).filter(Recommendation.survey_id == s.id).first()
#         if rec:
#             results.append({"survey_id": s.id, "recommendation_id": rec.id})
#     return {"status": "success", "results": results}


# @router.get("/detail/{survey_id}", summary="(본인 전용) 설문+추천 상세 조회")
# def get_survey_detail(
#     survey_id: int,
#     db: Session = Depends(get_db),
#     user: Dict[str, Any] = Depends(require_auth),
# ):
#     survey: Optional[Survey] = db.query(Survey).filter(Survey.id == survey_id).first()
#     if not survey:
#         raise HTTPException(status_code=404, detail="Survey not found")
#     if survey.nickname != user["nickname"]:
#         raise HTTPException(status_code=403, detail="Forbidden")

#     recommendation: Optional[Recommendation] = (
#         db.query(Recommendation).filter(Recommendation.survey_id == survey_id).first()
#     )
#     return {
#         "status": "success",
#         "survey_id": survey.id,
#         "nickname": survey.nickname,
#         "preferences": survey.preferences,
#         "recommendation": recommendation.result if recommendation else None,
#     }


# @router.delete("/delete/{survey_id}", summary="설문과 추천 삭제(세션/CSRF/소유자만)")
# def delete_survey(
#     survey_id: int,
#     request: Request,
#     db: Session = Depends(get_db),
#     user: Dict[str, Any] = Depends(require_auth),
#     x_csrf_token: Optional[str] = Header(None),
# ):
#     session_csrf = request.session.get("csrf")
#     if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
#         raise HTTPException(status_code=403, detail="CSRF token invalid")

#     survey: Optional[Survey] = db.query(Survey).filter(Survey.id == survey_id).first()
#     if not survey:
#         raise HTTPException(status_code=404, detail="Survey not found")
#     if survey.nickname != user["nickname"]:
#         raise HTTPException(status_code=403, detail="Forbidden")

#     rec: Optional[Recommendation] = db.query(Recommendation).filter(Recommendation.survey_id == survey_id).first()
#     if rec:
#         db.delete(rec)

#     db.delete(survey)
#     db.commit()
#     return {"status": "success", "message": "Survey and recommendation deleted"}

# @router.get("/recommendations/my")
# def list_my_recommendations(user=Depends(require_auth), db: Session = Depends(get_db)):
#     recs = (
#         db.query(Recommendation)
#         .filter(Recommendation.user_id == user["id"])
#         .order_by(Recommendation.created_at.desc())
#         .all()
#     )
#     return [
#         {
#             "id": r.id,
#             "title": getattr(r, "title", "추천 여행"),
#             "summary": getattr(r, "reason", None),
#             "created_at": getattr(r, "created_at", None),
#             "rating": getattr(r, "rating", None),
#         }
#         for r in recs
#     ]


# app/api/v1/endpoints/survey.py
from typing import Optional, List, Dict, Any
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.recommendation import Recommendation
from app.models.survey import Survey
from app.schemas.survey import SurveyCreate
from app.crud import survey_crud, recommendation_crud

from app.services.rag_service import get_rag_recommendation
from app.services.prompt_builder import _extract_days
from app.services.schedule_guard import (
    normalize_schedule_to_array,
    guard_schedule,
    schedule_array_to_map,
)
from app.api.v1.endpoints.auth import require_auth

router = APIRouter()

# -------------------- 강제 정규화 유틸 --------------------

def _loads_if_json_str(v: Any) -> Any:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return v
    return v

def _normalize_city_item(item: Any) -> Optional[Dict[str, Any]]:
    """도시 객체를 표준 스키마로 강제 변환."""
    item = _loads_if_json_str(item)
    if not isinstance(item, dict):
        return None

    city = str(item.get("city") or "추천 도시")
    reason = str(item.get("reason") or "")

    # schedule 기본값
    schedule = item.get("schedule", [])
    if not isinstance(schedule, list):
        schedule = []

    norm_days: List[Dict[str, Any]] = []
    for day_block in schedule:
        day_block = _loads_if_json_str(day_block)
        if not isinstance(day_block, dict):
            continue

        day = str(day_block.get("day") or "").strip() or "day_1"
        acts = day_block.get("activities", [])
        if isinstance(acts, str):
            acts = [acts]
        if not isinstance(acts, list):
            acts = []

        fixed_acts: List[Dict[str, str]] = []
        for a in acts:
            a = _loads_if_json_str(a)
            if isinstance(a, dict):
                t = str(a.get("time") or "")
                act = str(a.get("activity") or "")
            else:
                t = ""
                act = "" if a is None else str(a)
            fixed_acts.append({"time": t, "activity": act})
        norm_days.append({"day": day, "activities": fixed_acts})

    return {"city": city, "reason": reason, "schedule": norm_days}

def _force_schedule_shape(schedule_arr: Any, days: int) -> List[Dict[str, Any]]:
    """
    normalize_schedule_to_array() 결과를 최종 강제:
    - 리스트가 아니면 빈 리스트
    - 각 day 블록은 dict로, 'day'와 'activities' 보장
    - activities는 무조건 [{"time": str, "activity": str}] 배열
    """
    if not isinstance(schedule_arr, list):
        return []

    out: List[Dict[str, Any]] = []
    for idx, day_block in enumerate(schedule_arr, start=1):
        day_block = _loads_if_json_str(day_block)
        if not isinstance(day_block, dict):
            # 이상한 형태면 스킵
            continue

        day = str(day_block.get("day") or "").strip() or f"day_{idx if idx <= days else days}"

        acts = day_block.get("activities", [])
        if isinstance(acts, str):
            acts = [acts]
        if not isinstance(acts, list):
            acts = []

        fixed_acts: List[Dict[str, str]] = []
        for a in acts:
            a = _loads_if_json_str(a)
            if isinstance(a, dict):
                t = str(a.get("time") or "")
                act = str(a.get("activity") or "")
            else:
                t = ""
                act = "" if a is None else str(a)
            fixed_acts.append({"time": t, "activity": act})

        out.append({"day": day, "activities": fixed_acts})
    return out

# -------------------- 엔드포인트 --------------------

@router.post("/recommend", summary="[RAG 적용] 설문 저장 + AI 추천 생성")
async def survey_and_recommend(
    survey: SurveyCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(None),
):
    # 1) CSRF + 닉네임
    session_csrf = request.session.get("csrf")
    if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
        raise HTTPException(status_code=403, detail="CSRF token invalid")

    try:
        survey = survey.model_copy(update={"nickname": user["nickname"]})
    except Exception:
        if hasattr(survey, "nickname"):
            survey.nickname = user["nickname"]

    # 2) 설문 저장
    saved_survey = survey_crud.create_survey(db=db, survey=survey)

    # 3) RAG 호출 + 1차 정규화
    try:
        if hasattr(survey.preferences, "model_dump_json"):
            preferences_dict = json.loads(survey.preferences.model_dump_json())
        else:
            preferences_dict = survey.preferences.dict()

        rag_output = await run_in_threadpool(get_rag_recommendation, preferences_dict)

        raw = rag_output.get("recommendation", None)
        debug_prompt = rag_output.get("prompt", "(no prompt)")

        if raw is None:
            raise HTTPException(status_code=502, detail="AI recommendation error: empty recommendation")

        raw = _loads_if_json_str(raw)
        # {"data":[...]} 형태도 허용
        if isinstance(raw, dict) and "data" in raw:
            raw = raw["data"]

        if not isinstance(raw, list):
            raise HTTPException(status_code=502, detail="AI recommendation error: invalid recommendation format")

        normalized: List[Dict[str, Any]] = []
        for item in raw:
            norm = _normalize_city_item(item)
            if norm:
                normalized.append(norm)

        if not normalized:
            raise HTTPException(status_code=502, detail="AI recommendation error: empty/invalid recommendation payload")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI recommendation error: {e}")

    # 4) 일정 후처리 (2차 강제 정규화 → guard → map)
    duration = preferences_dict.get("duration")
    days = _extract_days(duration)
    safe_data: List[Dict[str, Any]] = []

    for city in normalized:
        try:
            schedule_raw = city.get("schedule", [])
            schedule_arr = normalize_schedule_to_array(schedule_raw, days)
            schedule_arr = _force_schedule_shape(schedule_arr, days)  # ← 핵심

            guarded_arr = guard_schedule(
                schedule_arr,
                days=days,
                depart_window=preferences_dict.get("depart_window"),
                return_window=preferences_dict.get("return_window"),
                density=preferences_dict.get("density"),
            )

            city_norm = {**city, "schedule": schedule_array_to_map(guarded_arr)}
            safe_data.append(city_norm)

        except Exception:
            # 해당 도시만 스킵해서 전체 500 방지
            continue

    if not safe_data:
        raise HTTPException(status_code=502, detail="AI recommendation error: all items invalid after guarding")

    # 5) 추천 저장
    saved_rec = recommendation_crud.save_recommendation(
        db=db,
        survey_id=saved_survey.id,
        result=safe_data,
    )

    # 6) 최종 응답
    return {
        "status": "success",
        "survey_id": saved_survey.id,
        "recommendation_id": saved_rec.id,
        "data": safe_data,
        "debug_prompt": debug_prompt,
    }


@router.get("/history/{nickname}", summary="(본인 전용) 사용자 설문+추천 ID 목록 조회")
def get_user_recommendation_ids(
    nickname: str,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
):
    if user["nickname"] != nickname:
        raise HTTPException(status_code=403, detail="Forbidden")

    surveys: List[Survey] = db.query(Survey).filter(Survey.nickname == nickname).all()
    results: List[Dict[str, Any]] = []
    for s in surveys:
        rec = db.query(Recommendation).filter(Recommendation.survey_id == s.id).first()
        if rec:
            results.append({"survey_id": s.id, "recommendation_id": rec.id})
    return {"status": "success", "results": results}


@router.get("/detail/{survey_id}", summary="(본인 전용) 설문+추천 상세 조회")
def get_survey_detail(
    survey_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
):
    survey: Optional[Survey] = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if survey.nickname != user["nickname"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    recommendation: Optional[Recommendation] = (
        db.query(Recommendation).filter(Recommendation.survey_id == survey_id).first()
    )
    return {
        "status": "success",
        "survey_id": survey.id,
        "nickname": survey.nickname,
        "preferences": survey.preferences,
        "recommendation": recommendation.result if recommendation else None,
    }


@router.delete("/delete/{survey_id}", summary="설문과 추천 삭제(세션/CSRF/소유자만)")
def delete_survey(
    survey_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(None),
):
    session_csrf = request.session.get("csrf")
    if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
        raise HTTPException(status_code=403, detail="CSRF token invalid")

    survey: Optional[Survey] = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if survey.nickname != user["nickname"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    rec: Optional[Recommendation] = db.query(Recommendation).filter(Recommendation.survey_id == survey_id).first()
    if rec:
        db.delete(rec)

    db.delete(survey)
    db.commit()
    return {"status": "success", "message": "Survey and recommendation deleted"}


@router.get("/recommendations/my")
def list_my_recommendations(user: Dict[str, Any] = Depends(require_auth), db: Session = Depends(get_db)):
    survey_ids = [s.id for s in db.query(Survey.id).filter(Survey.nickname == user["nickname"]).all()]
    if not survey_ids:
        return []

    recs = (
        db.query(Recommendation)
        .filter(Recommendation.survey_id.in_(survey_ids))
        .order_by(Recommendation.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "title": r.result[0].get("city", "추천 여행") if r.result and r.result else "추천 여행",
            "summary": r.result[0].get("reason", None) if r.result and r.result else None,
            "created_at": getattr(r, "created_at", None),
            "rating": getattr(r, "rating", None),
        }
        for r in recs
    ]
