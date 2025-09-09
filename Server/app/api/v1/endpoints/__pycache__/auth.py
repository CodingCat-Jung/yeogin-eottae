from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.schemas.user import UserSignup, UserLogin
from app.db.session import get_db
from app.crud import user_crud
from typing import Optional
import secrets

router = APIRouter()

# ─────────────────────────────────────────────────────────
# 공통: 인증 의존성 (세션에 user가 없으면 401)
# ─────────────────────────────────────────────────────────
def require_auth(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user

# ─────────────────────────────────────────────────────────
# 회원가입 (기존 로직 유지)
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
# 로그인: 세션 생성 + CSRF 토큰 쿠키 발급
# ─────────────────────────────────────────────────────────
@router.post("/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    db_user = user_crud.authenticate_user(db, payload.nickname, payload.password)
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid nickname or password")

    # 세션에 최소 정보 저장 (민감정보 금지)
    request.session["user"] = {"id": db_user.id, "nickname": db_user.nickname}

    # CSRF 토큰(더블 서브밋) 발급: 세션 + 일반 쿠키
    csrf = secrets.token_urlsafe(32)
    request.session["csrf"] = csrf
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,   # 프론트에서 읽어서 헤더로 보낼 수 있게
        secure=False,     # 🔒 배포 시 True (HTTPS)
        samesite="Lax",   # 필요에 따라 'Strict' 권장
        path="/"
    )

    return {
        "status": "success",
        "user_id": db_user.id,
        "nickname": db_user.nickname
    }

# ─────────────────────────────────────────────────────────
# 내 정보: 세션에서 읽기
# ─────────────────────────────────────────────────────────
@router.get("/me")
def me(user = Depends(require_auth)):
    return {"id": user["id"], "nickname": user["nickname"]}

# ─────────────────────────────────────────────────────────
# 로그아웃: 세션 정리 + CSRF 쿠키 삭제
# ─────────────────────────────────────────────────────────
@router.post("/logout")
def logout(request: Request, response: Response):
    request.session.clear()
    response.delete_cookie("csrf_token", path="/")
    return {"status": "logged_out"}

# ─────────────────────────────────────────────────────────
# 닉네임 중복 체크 (기존 로직 유지)
# ─────────────────────────────────────────────────────────
@router.get("/check-nickname", summary="Check if the user name is duplicated")
def check_nickname(nickname: str, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.nickname == nickname).first()
    return {
        "nickname": nickname,
        "is_available": not bool(exists)
    }

# ─────────────────────────────────────────────────────────
# (예시) 상태 변경이 있는 API: CSRF 검증
# 프론트는 헤더 'X-CSRF-Token: <쿠키의 csrf_token 값>' 으로 전송
# ─────────────────────────────────────────────────────────
@router.post("/secure-action")
def secure_action(
    request: Request,
    user = Depends(require_auth),
    x_csrf_token: Optional[str] = None
):
    session_csrf = request.session.get("csrf")
    if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
        raise HTTPException(status_code=403, detail="CSRF token invalid")
    return {"ok": True, "by": user["nickname"]}
