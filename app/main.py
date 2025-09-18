# app/main.py
import os
import pprint
from dotenv import load_dotenv

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from fastapi.staticfiles import StaticFiles  # ✅ 추가

# 1) .env
load_dotenv()

# 2) 모델 등록
from app.db.base import Base
from app.db.session import engine

# ⚠️ 여기서 'import app....'를 쓰면 로컬 이름 app이 패키지가 됩니다.
#    이름 충돌 방지를 위해 'from ... import ...' 형태로만 불러오거나 importlib 사용
from app.models import user as _user_model      # noqa
from app.models import survey as _survey_model  # noqa
from app.models import recommendation as _rec_model  # noqa

# 3) 라우터
from app.api.v1.endpoints import auth as auth
from app.api.v1.endpoints import survey as survey
from app.api.v1.endpoints import recommendation as recommendation
from app.api.v1.endpoints import savebox as savebox  # 보관함/위시리스트
from app.api.v1.endpoints import upload as upload    # ✅ 업로드 라우터 추가

# 4) FastAPI 인스턴스 (변수명: api)
api = FastAPI(title="Travia API")

# 5) CORS
front_origins_env = os.getenv("FRONT_ORIGINS", "http://34.47.89.151,http://localhost:5173")
allow_origins = [o.strip() for o in front_origins_env.split(",") if o.strip()]
api.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 6) 세션
SESSION_SECRET = os.getenv("SESSION_SECRET", "CHANGE_ME_SUPER_SECRET_KEY")
SESSION_MAX_MIN = int(os.getenv("SESSION_MAX_MIN", "20"))
HTTPS_ONLY = os.getenv("SESSION_HTTPS_ONLY", "false").lower() == "true"
SAMESITE = os.getenv("SESSION_SAMESITE", "lax")  # 'lax' | 'strict' | 'none'

api.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="session",
    same_site=SAMESITE,
    https_only=HTTPS_ONLY,
    max_age=SESSION_MAX_MIN * 60,
)

# ✅ 정적 폴더 서빙 (/static/...)
os.makedirs("static", exist_ok=True)
api.mount("/static", StaticFiles(directory="static"), name="static")

# 7) startup: 테이블 생성/로그
@api.on_event("startup")
def _startup_create_all():
    try:
        print("[DB] metadata tables (before):", list(Base.metadata.tables.keys()))
        Base.metadata.create_all(bind=engine)
        print("[DB] create_all() done.")
        with engine.connect() as conn:
            dbname = conn.execute(text("SELECT DATABASE()")).scalar()
            rows = conn.exec_driver_sql("SHOW TABLES").fetchall()
            print(f"[DB] current database: {dbname}")
            print("[DB] tables in MySQL:", [r[0] for r in rows])
    except Exception as e:
        print("[DB] create_all() error:", e)

# (선택) 라우트 덤프
@api.on_event("startup")
async def show_routes():
    print("=== ROUTES ===")
    for r in api.router.routes:
        try:
            print(r.methods, getattr(r, "path", getattr(r, "path_format", "")))
        except Exception:
            pass

# 8) 예외 핸들러
@api.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("🚨 [Validation Error] 요청 파싱 실패:")
    pprint.pprint(exc.errors())
    return JSONResponse(status_code=400, content={"message": "요청 데이터가 유효하지 않습니다.", "detail": exc.errors()})

@api.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    print("🔥 [HTTPException 발생] 상세 내용:", exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"message": f"❗ {exc.detail}"})

# 9) 라우터 등록
api.include_router(auth.router,           prefix="/api/auth",      tags=["auth"])
api.include_router(survey.router,         prefix="/api/v1/survey", tags=["survey"])
api.include_router(recommendation.router, prefix="/api",           tags=["recommendation"])
api.include_router(savebox.router,        prefix="/api",           tags=["savebox"])
api.include_router(upload.router,         prefix="/api",           tags=["upload"])  # ✅ 업로드 라우터 등록

# 10) 헬스체크
@api.get("/health")
def health():
    return {"ok": True}

# uvicorn이 찾을 엔트리포인트
app = api
