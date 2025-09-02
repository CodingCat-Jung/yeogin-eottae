# app/api/v1/endpoints/survey.py
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.recommendation import Recommendation
from app.models.survey import Survey
from app.schemas.survey import SurveyCreate
from app.crud import survey_crud, recommendation_crud

# 프롬프트 + 일수 추출
from app.services.prompt_builder import generate_prompt_from_survey, _extract_days

# 일정 정규화/가드/포맷 변환
from app.services.schedule_guard import (
    normalize_schedule_to_array,
    guard_schedule,
    schedule_array_to_map,
)

# 세션 인증 (쿠키/세션 + CSRF)
from app.api.v1.endpoints.auth import require_auth

# 구조화 출력으로 변경된 Gemini 클라이언트
from gemini_api.gemini_api_client import generate_travel_recommendation

router = APIRouter()


@router.post("/recommend", summary="설문 저장 + AI 추천 생성(세션/CSRF 필요)")
async def survey_and_recommend(
    survey: SurveyCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(None),
):
    # 1) CSRF 더블서브밋 검증
    session_csrf = request.session.get("csrf")
    if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
        raise HTTPException(status_code=403, detail="CSRF token invalid")

    # 2) 닉네임 위변조 방지: 세션 닉네임으로 강제
    try:
        survey = survey.model_copy(update={"nickname": user["nickname"]})  # pydantic v2
    except Exception:
        if hasattr(survey, "nickname"):
            survey.nickname = user["nickname"]

    # 3) 설문 저장
    saved_survey = survey_crud.create_survey(db=db, survey=survey)

    # 4) 프롬프트 생성
    prompt = generate_prompt_from_survey(survey.preferences)

    # 5) LLM 호출 (동기 SDK → threadpool)
    result: Dict[str, Any] = await run_in_threadpool(generate_travel_recommendation, prompt)
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail=result.get("message", "AI recommendation error"))

    raw_data: List[Dict[str, Any]] = result.get("data", [])

    # 6) 후처리: 정규화 → 가드 → 프론트 포맷(맵)으로 변환
    days = _extract_days(survey.preferences.duration)
    safe_data: List[Dict[str, Any]] = []

    for city in raw_data:
        schedule_raw = city.get("schedule", [])

        # 무엇이 오든 배열 표준형 [ {"day":"day_1", "activities":[...]}, ... ] 으로 정규화
        schedule_arr = normalize_schedule_to_array(schedule_raw, days)

        # 출/귀국 시간대 & 템포 반영한 라이트 가드
        guarded_arr = guard_schedule(
            schedule_arr,
            days=days,
            depart_window=getattr(survey.preferences, "depart_window", None),
            return_window=getattr(survey.preferences, "return_window", None),
            density=getattr(survey.preferences, "density", None),
        )

        # 프론트가 쓰는 맵 포맷 {'day_1':[...]} 으로 변환
        city_norm = {**city, "schedule": schedule_array_to_map(guarded_arr)}
        safe_data.append(city_norm)

    # 7) 추천 저장
    saved_rec = recommendation_crud.save_recommendation(
        db=db,
        survey_id=saved_survey.id,  # type: ignore
        result=safe_data,
    )

    return {
        "status": "success",
        "survey_id": saved_survey.id,
        "recommendation_id": saved_rec.id,
        "data": safe_data,
    }


# ─────────────────────────────────────────────────────────
# 아래 history/detail/delete 엔드포인트는 기존과 동일
# ─────────────────────────────────────────────────────────

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
def list_my_recommendations(user=Depends(require_auth), db: Session = Depends(get_db)):
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.user_id == user["id"])
        .order_by(Recommendation.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "title": getattr(r, "title", "추천 여행"),
            "summary": getattr(r, "reason", None),
            "created_at": getattr(r, "created_at", None),
            "rating": getattr(r, "rating", None),
        }
        for r in recs
    ]