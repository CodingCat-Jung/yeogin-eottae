import secrets
from fastapi import Request, Response, HTTPException

CSRF_COOKIE_NAME = "csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"

def issue_csrf_cookie_if_needed(request: Request, response: Response):
    """쿠키에 csrf 없으면 새 값 발급(Set-Cookie)"""
    if CSRF_COOKIE_NAME not in request.cookies:
        token = secrets.token_urlsafe(32)
        response.set_cookie(
            key=CSRF_COOKIE_NAME,
            value=token,
            httponly=False,        # 프론트 JS에서 읽어야 하므로 False
            samesite="Lax",        # 크로스도메인이면 "None" + secure=True 권장
            secure=False,          # HTTPS면 True
            path="/",
            max_age=60 * 60 * 24,  # 1day
        )

def verify_csrf(request: Request):
    """더블 서브밋: 쿠키 값 == 헤더 값인지 비교"""
    cookie_val = request.cookies.get(CSRF_COOKIE_NAME)
    header_val = request.headers.get(CSRF_HEADER_NAME)
    if not cookie_val or not header_val or cookie_val != header_val:
        raise HTTPException(status_code=403, detail="CSRF token invalid")
