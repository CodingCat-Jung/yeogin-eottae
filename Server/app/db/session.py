# app/db/session.py
import os
from urllib.parse import quote_plus
from app.db.base_class import Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()  # .env 로드

def to_bool(v: str, default=False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "t", "yes", "y"}

DRIVER = os.getenv("DB_DRIVER", "sqlite")

if DRIVER.startswith("mysql"):
    USER = os.getenv("DB_USER", "root")
    PASSWORD = os.getenv("DB_PASSWORD", "")
    HOST = os.getenv("DB_HOST", "127.0.0.1")
    PORT = int(os.getenv("DB_PORT", "3306"))
    NAME = os.getenv("DB_NAME", "travel")
    ECHO = to_bool(os.getenv("DB_ECHO", "false"))

    # 비밀번호 특수문자 안전 처리
    url = f"{DRIVER}://{USER}:{quote_plus(PASSWORD)}@{HOST}:{PORT}/{NAME}?charset=utf8mb4"
    engine = create_engine(
        url,
        pool_pre_ping=True,   # 죽은 커넥션 감지
        pool_recycle=1800,    # 30분마다 재활용 (타임아웃 대응)
        echo=ECHO,
        future=True,
    )
else:
    # 로컬 SQLite (디폴트)
    SQLITE_PATH = os.getenv("SQLITE_PATH", "./test.db")
    url = f"sqlite:///{SQLITE_PATH}"
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False},
        future=True,
    )

# ➕ 현재 어떤 DB에 붙었는지 콘솔에 출력 (비밀번호는 마스킹)
print("[DB] URL =", engine.url.render_as_string(hide_password=True))
try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        if DRIVER.startswith("mysql"):
            dbname = conn.execute(text("SELECT DATABASE()")).scalar()
            print(f"[DB] Connected to MySQL database: {dbname}")
    print("[DB] ✅ connection OK")
except Exception as e:
    print("[DB] ❌ connection failed:", e)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
