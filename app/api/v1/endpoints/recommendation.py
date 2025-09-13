# app/api/v1/endpoints/recommendation.py
from __future__ import annotations
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.api.v1.endpoints.auth import require_auth
from app.models.recommendation import Recommendation
from app.models.survey import Survey
from app.schemas.recommendation import RatingUpdate
from app.core.csrf import issue_csrf_cookie_if_needed, verify_csrf  # ✅ 추가

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
