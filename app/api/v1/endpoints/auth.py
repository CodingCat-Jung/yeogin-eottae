# app/api/v1/endpoints/auth.py
from __future__ import annotations

import os
import time
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, constr, HttpUrl

from app.db.session import get_db
from app.schemas.user import UserSignup, UserLogin
from app.crud import user_crud
from app.models.user import User  # 닉네임/이미지 업데이트용

router = APIRouter()  # ✅ 내부 prefix 없음 (main.py 에서 /api/auth 붙임)

# ─────────────────────────────────────────────────────────
# 설정: 세션 만료 (분)
# ─────────────────────────────────────────────────────────
SESSION_MAX_MIN = int(os.getenv("SESSION_MAX_MIN", "20"))   # 기본 20분
SLIDING_RENEWAL = True  # True면 매 요청마다 만료시간 갱신(슬라이딩 만료)

# ─────────────────────────────────────────────────────────
# 공통 인증 의존성: 세션 + 만료 검사
# ─────────────────────────────────────────────────────────
def require_auth(request: Request):
    user = request.session.get("user")
    exp  = request.session.get("exp")
    now  = int(time.time())

    if not user or not exp or now >= exp:
        # 만료 또는 세션 없음 → 정리 후 401
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    # 슬라이딩 만료(옵션)
    if SLIDING_RENEWAL:
        request.session["exp"] = now + SESSION_MAX_MIN * 60

    return user  # {"id": ..., "nickname": ...}

# ─────────────────────────────────────────────────────────
# 회원가입
# ─────────────────────────────────────────────────────────
@router.post("/signup")
def signup(user: UserSignup, db: Session = Depends(get_db)):
    try:
        db_user = user_crud.create_user(db, user)
        return {"status": "success", "user_id": db_user.id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="nickname already exists")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# ─────────────────────────────────────────────────────────
# 로그인
# ─────────────────────────────────────────────────────────
@router.post("/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    db_user = user_crud.authenticate_user(db, payload.nickname, payload.password)
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid nickname or password")

    # 세션에 최소 정보만 저장
    request.session["user"] = {
        "id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": getattr(db_user, "profile_image_url", None)
    }
    request.session["exp"] = int(time.time()) + SESSION_MAX_MIN * 60

    # CSRF 토큰
    csrf = secrets.token_urlsafe(32)
    request.session["csrf"] = csrf
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=False,
        samesite="None",
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )

    return {
        "status": "success",
        "user_id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": db_user.profile_image_url,
    }

# ─────────────────────────────────────────────────────────
# 내 정보 (조회)
# ─────────────────────────────────────────────────────────
@router.get("/me")
def me(user = Depends(require_auth)):
    return {
        "id": user["id"],
        "nickname": user["nickname"],
        "profile_image_url": user.get("profile_image_url")
    }

# ─────────────────────────────────────────────────────────
# 내 정보 (수정) — 닉네임 + 프로필 이미지
# ─────────────────────────────────────────────────────────
class ProfileUpdate(BaseModel):
    nickname: Optional[constr(strip_whitespace=True, min_length=2, max_length=20)] = None
    profile_image_url: Optional[str] = None  # 단순 문자열 URL (검증 원하면 HttpUrl 사용)

@router.patch("/me")
def update_me(
    payload: ProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(default=None, alias="x-csrf-token"),
):
    # CSRF 토큰 검사 (선택적)
    sess_csrf = request.session.get("csrf")
    if x_csrf_token is not None and sess_csrf and x_csrf_token != sess_csrf:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 닉네임 변경 처리
    if payload.nickname and payload.nickname != db_user.nickname:
        exists = db.query(User).filter(User.nickname == payload.nickname).first()
        if exists:
            raise HTTPException(status_code=400, detail="nickname already exists")
        db_user.nickname = payload.nickname
        request.session["user"]["nickname"] = db_user.nickname

    # 프로필 이미지 변경 처리
    if payload.profile_image_url is not None:
        db_user.profile_image_url = payload.profile_image_url
        request.session["user"]["profile_image_url"] = db_user.profile_image_url

    try:
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="update failed (integrity error)")

    # 반환
    return {
        "id": db_user.id,
        "nickname": db_user.nickname,
        "email": getattr(db_user, "email", None),
        "profile_image_url": db_user.profile_image_url,
    }

# ─────────────────────────────────────────────────────────
# 로그아웃
# ─────────────────────────────────────────────────────────
@router.post("/logout")
def logout(request: Request, response: Response):
    request.session.clear()
    response.delete_cookie("csrf_token", path="/")
    return {"status": "logged_out"}

# ─────────────────────────────────────────────────────────
# 닉네임 중복 체크
# ─────────────────────────────────────────────────────────
@router.get("/check-nickname", summary="Check if the user name is duplicated")
def check_nickname(nickname: str, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.nickname == nickname).first()
    return {"nickname": nickname, "is_available": not bool(exists)}

# ─────────────────────────────────────────────────────────
# CSRF 재발급
# ─────────────────────────────────────────────────────────
@router.get("/csrf")
def get_csrf(request: Request, response: Response, user=Depends(require_auth)):
    csrf = request.session.get("csrf")
    if not csrf:
        csrf = secrets.token_urlsafe(32)
        request.session["csrf"] = csrf
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=False,
        samesite="Lax",
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )
    return {"ok": True}
