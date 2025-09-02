# app/api/v1/endpoints/auth.py
from __future__ import annotations

import os
import time
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.schemas.user import UserSignup, UserLogin
from app.crud import user_crud
from app.models.user import User  # 닉네임 중복 체크용

router = APIRouter()  # ✅ 내부 prefix 사용하지 않음 (main.py에서 /api/auth 붙임)

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
# 로그인: 세션 + CSRF(세션 값 == 헤더) + 쿠키(csrf_token) 발급
# ─────────────────────────────────────────────────────────
@router.post("/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    db_user = user_crud.authenticate_user(db, payload.nickname, payload.password)
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid nickname or password")

    # 세션에 최소 정보만 저장 (민감정보 X)
    request.session["user"] = {"id": db_user.id, "nickname": db_user.nickname}
    request.session["exp"] = int(time.time()) + SESSION_MAX_MIN * 60

    # CSRF 토큰(세션 + 일반 쿠키)
    csrf = secrets.token_urlsafe(32)
    request.session["csrf"] = csrf
    response.set_cookie(
        key="csrf_token",        # ✅ 프론트와 이름 일치하게 유지
        value=csrf,
        httponly=False,          # 프론트에서 읽어 헤더로 보냄
        secure=False,            # 배포(HTTPS) 시 True
        samesite="Lax",          # 크로스 도메인이면 "None" + secure=True
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )

    return {"status": "success", "user_id": db_user.id, "nickname": db_user.nickname}

# ─────────────────────────────────────────────────────────
# 내 정보
# ─────────────────────────────────────────────────────────
@router.get("/me")
def me(user = Depends(require_auth)):
    return {"id": user["id"], "nickname": user["nickname"]}

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
# (선택) CSRF만 재발급/보장: 로그인 상태에서 호출
# 프론트는 필요시 GET /api/auth/csrf → Set-Cookie: csrf_token=...
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
        secure=False,          # HTTPS면 True
        samesite="Lax",
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )
    return {"ok": True}
