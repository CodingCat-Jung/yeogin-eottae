# app/api/v1/endpoints/auth.py
from __future__ import annotations

import os
import time
import secrets
import pathlib
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
    Header,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, constr

from app.db.session import get_db
from app.schemas.user import UserSignup, UserLogin
from app.crud import user_crud
from app.models.user import User  # 닉네임/이미지 업데이트용

router = APIRouter()  # (main.py에서 /api/auth prefix 부여)

# ─────────────────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────────────────
SESSION_MAX_MIN = int(os.getenv("SESSION_MAX_MIN", "20"))   # 기본 20분
SLIDING_RENEWAL = True  # True면 매 요청마다 만료시간 갱신(슬라이딩 만료)

# 아바타 저장 디렉토리 (파일 기반)
AVATAR_DIR = pathlib.Path("uploads/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


def _find_avatar_file(user_id: int) -> Optional[pathlib.Path]:
    """uploads/avatars/<user_id>.(png|jpg|jpeg|webp) 중 존재하는 첫 파일 반환"""
    for ext in ("png", "jpg", "jpeg", "webp"):
        p = AVATAR_DIR / f"{user_id}.{ext}"
        if p.exists():
            return p
    return None


def _avatar_updated_ts(path: pathlib.Path) -> int:
    """캐시버스트/ETag용 타임스탬프(초)"""
    try:
        return int(path.stat().st_mtime)
    except Exception:
        return int(time.time())


# ─────────────────────────────────────────────────────────
# 공통 인증 의존성: 세션 + 만료 검사
# ─────────────────────────────────────────────────────────
def require_auth(request: Request):
    user = request.session.get("user")
    exp = request.session.get("exp")
    now = int(time.time())
    print("[AUTH] cookies keys:", list(request.cookies.keys()))
    print("[AUTH] session cookie:", request.cookies.get("session"))

    if not user or not exp or now >= exp:
        # 만료 또는 세션 없음 → 정리 후 401
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    # 슬라이딩 만료(옵션)
    if SLIDING_RENEWAL:
        request.session["exp"] = now + SESSION_MAX_MIN * 60

    return user  # {"id": ..., "nickname": ..., "profile_image_url": ..., "avatar_ts": ...}


# ─────────────────────────────────────────────────────────
# 회원가입
# ─────────────────────────────────────────────────────────
@router.post("/signup")
def signup(user: UserSignup, db: Session = Depends(get_db)):
    try:
        # 디버그
        pw = getattr(user, "password", "")
        print(f"[SIGNUP] raw pw type={type(pw)} len_chars={len(str(pw))} len_bytes={len(str(pw).encode('utf-8'))}")
        db_user = user_crud.create_user(db, user)
        return {"status": "success", "user_id": db_user.id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="nickname already exists")
    except Exception as e:
        db.rollback()
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# ─────────────────────────────────────────────────────────
# 로그인 (파일 아바타를 우선적으로 반영)
# ─────────────────────────────────────────────────────────
@router.post("/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    db_user = user_crud.authenticate_user(db, payload.nickname, payload.password)
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid nickname or password")

    # ✅ 파일 아바타 우선 탐색
    avatar_path = _find_avatar_file(db_user.id)
    if avatar_path:
        profile_url = "/api/auth/avatar"
        updated_at = _avatar_updated_ts(avatar_path)
    else:
        profile_url = getattr(db_user, "profile_image_url", None)
        # updated_at: DB의 updated_at이 있을 수 있음(없으면 None)
        updated_at = getattr(db_user, "updated_at", None)

    # 세션 저장
    request.session["user"] = {
        "id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": profile_url,
        "avatar_ts": updated_at,  # ✅ 캐시버스트용 타임스탬프
    }
    request.session["exp"] = int(time.time()) + SESSION_MAX_MIN * 60

    # CSRF 토큰(httponly=True) — JS로 읽을 쿠키는 /csrf에서 별도로 발급
    csrf = secrets.token_urlsafe(32)
    request.session["csrf"] = csrf
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=True,
        secure=False,     # 배포시 True 권장(HTTPS)
        samesite="lax",   # 다른 도메인일 땐 none + secure 필요
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )

    return {
        "status": "success",
        "user_id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": profile_url,
        "updated_at": updated_at,
    }


# ─────────────────────────────────────────────────────────
# 내 정보 (조회) - 항상 DB 기준 + 파일 fallback + 캐시 금지
# ─────────────────────────────────────────────────────────
@router.get("/me")
def me(
    response: Response,
    user = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    - DB에서 최신 유저를 읽어온다.
    - DB profile_image_url이 비어 있으면 파일 저장 방식을 확인하여 있으면 /api/auth/avatar 를 내려준다.
    - 캐시 방지 헤더 추가.
    """
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 캐시 방지
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Vary"] = "Cookie"

    profile_url = getattr(db_user, "profile_image_url", None)
    updated_at = getattr(db_user, "updated_at", None)

    # ✅ 파일 기반 우선
    avatar_path = _find_avatar_file(db_user.id)
    if avatar_path:
        profile_url = "/api/auth/avatar"
        updated_at = _avatar_updated_ts(avatar_path)

    return {
        "id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": profile_url,
        "updated_at": updated_at,
    }


# ─────────────────────────────────────────────────────────
# 내 정보 (수정) — 닉네임 + 프로필 이미지 URL(선택적)
# (파일 업로드는 별도 엔드포인트에서 처리하고, 저장 후 me가 파일을 감지하도록)
# ─────────────────────────────────────────────────────────
class ProfileUpdate(BaseModel):
    nickname: Optional[constr(strip_whitespace=True, min_length=2, max_length=20)] = None
    profile_image_url: Optional[str] = None  # (URL 방식 유지 시 사용)


@router.patch("/me")
def update_me(
    payload: ProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(default=None, alias="x-csrf-token"),
):
    # CSRF 토큰 검사 (선택)
    sess_csrf = request.session.get("csrf")
    if x_csrf_token is not None and sess_csrf and x_csrf_token != sess_csrf:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 닉네임 변경
    if payload.nickname and payload.nickname != db_user.nickname:
        exists = db.query(User).filter(User.nickname == payload.nickname).first()
        if exists:
            raise HTTPException(status_code=400, detail="nickname already exists")
        db_user.nickname = payload.nickname
        request.session["user"]["nickname"] = db_user.nickname  # 세션 동기화

    # 프로필 이미지 URL 변경 (파일 업로드가 아닌 URL 방식일 때만)
    if payload.profile_image_url is not None:
        db_user.profile_image_url = payload.profile_image_url
        request.session["user"]["profile_image_url"] = db_user.profile_image_url  # 세션 동기화

    try:
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="update failed (integrity error)")

    # 응답
    # 파일 방식이면 프론트는 어차피 /me 재호출 시 /api/auth/avatar를 받음
    return {
        "id": db_user.id,
        "nickname": db_user.nickname,
        "profile_image_url": getattr(db_user, "profile_image_url", None),
        "email": getattr(db_user, "email", None),
    }


# ─────────────────────────────────────────────────────────
# 파일 기반 아바타 내려주기
# 프론트는 <img src="/api/auth/avatar?..."> 로 호출
# ─────────────────────────────────────────────────────────
@router.get("/avatar")
def get_avatar(
    request: Request,
    user = Depends(require_auth),
):
    avatar_path = _find_avatar_file(user["id"])
    if not avatar_path:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # ETag/Cache 제어(강한 캐시 금지 + 조건부 요청 처리)
    ts = _avatar_updated_ts(avatar_path)
    etag = f'W/"{ts}-{avatar_path.name}"'
    headers = {
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        "ETag": etag,
    }
    inm = request.headers.get("If-None-Match")
    if inm == etag:
        return Response(status_code=304, headers=headers)

    # 확장자에 맞춰 media_type 지정
    ext = avatar_path.suffix.lower()
    media = "image/png"
    if ext in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif ext == ".webp":
        media = "image/webp"

    return FileResponse(
        path=str(avatar_path),
        media_type=media,
        headers=headers,
    )


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
# CSRF 재발급 (JS 읽기용 쿠키)
# ─────────────────────────────────────────────────────────
@router.get("/csrf")
def get_csrf(request: Request, response: Response):
    if "csrf" not in request.session:
        request.session["csrf"] = secrets.token_urlsafe(32)

    csrf = request.session["csrf"]

    # 브라우저에서 읽을 수 있도록(헤더 전송용)
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,   # JS에서 읽도록
        secure=False,     # HTTPS 환경이면 True 권장
        samesite="Lax",
        path="/",
        max_age=SESSION_MAX_MIN * 60,
    )
    return {"csrf": csrf}
