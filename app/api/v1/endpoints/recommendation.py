# app/api/v1/endpoints/recommendation.py
from __future__ import annotations
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.api.v1.endpoints.auth import require_auth
from app.models.recommendation import Recommendation
from app.models.survey import Survey
from app.schemas.recommendation import RatingUpdate
from app.core.csrf import issue_csrf_cookie_if_needed, verify_csrf

# ✅ 추가: 설문 스키마 + RAG 서비스
from app.schemas.survey import SurveyCreate
from app.services import rag_service

router = APIRouter()

RECO_SURVEY_FK_CANDIDATES: List[str] = ["survey_id", "surveyId", "sid"]
SURVEY_USER_ID_CANDIDATES: List[str] = [
    "user_id", "userId", "uid", "owner_id", "created_by", "author_id"
]
SURVEY_NICKNAME_CANDIDATES: List[str] = ["nickname", "user_nickname", "userName"]
CREATED_AT_CANDIDATES: List[str] = [
    "created_at", "createdAt", "created", "reg_date", "inserted_at"
]


def pick_col(model, names: List[str]):
    for n in names:
        if hasattr(model, n):
            return getattr(model, n)
    return None


def _model_to_dict(r: Recommendation):
    """Recommendation 모델을 dict로 직렬화"""
    # ← FK 값 추출 (survey_id, surveyId, sid 중 있는 걸 사용)
    survey_fk_name = next((n for n in RECO_SURVEY_FK_CANDIDATES if hasattr(r, n)), None)
    survey_fk_value = getattr(r, survey_fk_name, None) if survey_fk_name else None

    summary = getattr(r, "reason", None) or getattr(r, "result", None)
    if isinstance(summary, str) and len(summary) > 160:
        summary = summary[:157] + "…"

    return {
        "id": r.id,
        "title": getattr(r, "title", "추천 여행"),
        "summary": summary,
        "created_at": getattr(r, "created_at", None),
        "rating": getattr(r, "rating", None),
        # ✅ 추가
        "survey_id": survey_fk_value,
    }


@router.get("/recommendations/my")
def list_my_recommendations(
    request: Request,
    response: Response,
    user=Depends(require_auth),
    db: Session = Depends(get_db),
):
    # ✅ 쿠키에 csrf 없으면 발급
    issue_csrf_cookie_if_needed(request, response)

    rec_survey_fk = pick_col(Recommendation, RECO_SURVEY_FK_CANDIDATES)
    if rec_survey_fk is None:
        existing = list(Recommendation.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Recommendation에 설문 FK가 없습니다. 후보={RECO_SURVEY_FK_CANDIDATES}, 실제={existing}",
        )

    survey_user_id = pick_col(Survey, SURVEY_USER_ID_CANDIDATES)
    survey_nickname = pick_col(Survey, SURVEY_NICKNAME_CANDIDATES)
    if survey_user_id is None and survey_nickname is None:
        existing = list(Survey.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Survey에 사용자 식별 컬럼이 없습니다. 후보 id={SURVEY_USER_ID_CANDIDATES}, "
            f"nick={SURVEY_NICKNAME_CANDIDATES}, 실제={existing}",
        )

    created_col = pick_col(Recommendation, CREATED_AT_CANDIDATES) or Recommendation.id

    q = db.query(Recommendation).join(Survey, rec_survey_fk == Survey.id)
    if survey_user_id is not None:
        q = q.filter(survey_user_id == user["id"])
    else:
        q = q.filter(survey_nickname == user["nickname"])

    recs = q.order_by(desc(created_col)).all()

    return [_model_to_dict(r) for r in recs]


@router.get("/recommendations/{rec_id}")
def get_recommendation(
    rec_id: int,
    request: Request,
    response: Response,
    user=Depends(require_auth),
    db: Session = Depends(get_db),
):
    # ✅ 쿠키에 csrf 없으면 발급
    issue_csrf_cookie_if_needed(request, response)

    rec_survey_fk = pick_col(Recommendation, RECO_SURVEY_FK_CANDIDATES)
    if rec_survey_fk is None:
        existing = list(Recommendation.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Recommendation에 설문 FK가 없습니다. 후보={RECO_SURVEY_FK_CANDIDATES}, 실제={existing}",
        )

    survey_user_id = pick_col(Survey, SURVEY_USER_ID_CANDIDATES)
    survey_nickname = pick_col(Survey, SURVEY_NICKNAME_CANDIDATES)
    if survey_user_id is None and survey_nickname is None:
        existing = list(Survey.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Survey에 사용자 식별 컬럼이 없습니다. 후보 id={SURVEY_USER_ID_CANDIDATES}, "
            f"nick={SURVEY_NICKNAME_CANDIDATES}, 실제={existing}",
        )

    q = db.query(Recommendation).join(Survey, rec_survey_fk == Survey.id).filter(
        Recommendation.id == rec_id
    )
    if survey_user_id is not None:
        q = q.filter(survey_user_id == user["id"])
    else:
        q = q.filter(survey_nickname == user["nickname"])

    rec = q.first()
    if not rec:
        raise HTTPException(404, "Recommendation not found")

    return _model_to_dict(rec)


@router.post("/recommendations/{rec_id}/rating")
def rate_recommendation(
    rec_id: int,
    payload: RatingUpdate,
    request: Request,
    user=Depends(require_auth),
    db: Session = Depends(get_db),
):
    # ✅ 더블 서브밋 검사 (쿠키 csrf == 헤더 X-CSRF-Token)
    verify_csrf(request)

    rating = payload.rating

    rec_survey_fk = pick_col(Recommendation, RECO_SURVEY_FK_CANDIDATES)
    if rec_survey_fk is None:
        existing = list(Recommendation.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Recommendation에 설문 FK가 없습니다. 후보={RECO_SURVEY_FK_CANDIDATES}, 실제={existing}",
        )

    survey_user_id = pick_col(Survey, SURVEY_USER_ID_CANDIDATES)
    survey_nickname = pick_col(Survey, SURVEY_NICKNAME_CANDIDATES)
    if survey_user_id is None and survey_nickname is None:
        existing = list(Survey.__table__.columns.keys())
        raise HTTPException(
            500,
            f"Survey에 사용자 식별 컬럼이 없습니다. 후보 id={SURVEY_USER_ID_CANDIDATES}, "
            f"nick={SURVEY_NICKNAME_CANDIDATES}, 실제={existing}",
        )

    q = (
        db.query(Recommendation)
        .join(Survey, rec_survey_fk == Survey.id)
        .filter(Recommendation.id == rec_id)
    )
    if survey_user_id is not None:
        q = q.filter(survey_user_id == user["id"])
    else:
        q = q.filter(survey_nickname == user["nickname"])

    rec = q.first()
    if not rec:
        raise HTTPException(404, "recommendation not found")

    rec.rating = rating
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return {"ok": True, "id": rec.id, "rating": rec.rating}


# ===============================
# ✅ 새로 추가: 설문 → 즉시 추천 생성
# ===============================
@router.post("/survey/recommend")
def create_recommendation_from_survey(
    payload: SurveyCreate,
    request: Request,
    response: Response,
    user=Depends(require_auth),          # 공개 엔드포인트로 열려야 하면 Depends 제거
    db: Session = Depends(get_db),
):
    """
    프론트에서 보낸 설문 + 월 정보를 가지고 즉시 RAG 추천을 생성해서 반환.
    DB 저장 없이 RAG만 호출하여 결과를 돌려준다.
    """

    # ✅ 쿠키 인증 기반이면 CSRF 더블서브밋 체크
    verify_csrf(request)
    # (선택) 쿠키에 CSRF가 없다면 발급 – 일관성 차원에서 유지
    issue_csrf_cookie_if_needed(request, response)

    # ✅ preferences를 평탄화해서 rag_service에 전달
    prefs = {
        "nickname": payload.nickname,
        **payload.preferences.model_dump(exclude_none=True),
    }
    # 예시:
    # {
    #   "nickname": "...",
    #   "companion": "...",
    #   "style": [...],
    #   "duration": "1박2일",
    #   "budget": "...",
    #   "climate": "...",
    #   "continent": "...",
    #   "density": "...",
    #   "driving": "public",
    #   "depart_window": "morning",
    #   "return_window": "evening",
    #   "travel_month": 11,          # 프론트에서 계산해 보낸 정수(1~12) 또는 None
    #   "season": "FALL",            # 선택
    # }

    try:
        out = rag_service.get_rag_recommendation(prefs)
        # rag_service는 {"recommendation": [...], "prompt": "..."} 형태를 반환한다고 가정.
        # 프론트에서 배열/ data/ results 어떤 키든 처리하지만, 일관성 위해 data 키로 감쌈.
        return {
            "data": out.get("recommendation", []),
            "debug": {
                "prompt": out.get("prompt"),
            },
        }
    except Exception as e:
        # 필요한 경우 logger.exception(...)으로 상세 로깅
        raise HTTPException(status_code=500, detail=str(e))
