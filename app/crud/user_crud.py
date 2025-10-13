# app/crud/user_crud.py
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserSignup
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_user(db: Session, user_in: UserSignup):
    password = user_in.password.strip()

    # 🔍 디버그 로그
    try:
        print(f"[DEBUG] pw_head={password[:30]!r}, len_bytes={len(password.encode('utf-8'))}")
    except Exception as e:
        print(f"[DEBUG] password debug print failed: {e}")

    # 🧩 bcrypt 72바이트 제한 검사
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password too long (>72 bytes)")

    # 🧩 혹시 프론트에서 해시된 비밀번호 보냈는지 검사
    if password.startswith("$2b$") or password.startswith("$2a$"):
        raise ValueError("Do not send hashed password from client")

    # ✅ 비밀번호 해시화
    hashed_pw = pwd_context.hash(password)

    # ✅ DB 모델 생성
    db_user = User(
        nickname=user_in.nickname,
        hashed_password=hashed_pw,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    print(f"[DEBUG] user created: {db_user.nickname}")

    return db_user


def authenticate_user(db: Session, nickname: str, password: str):
    db_user = db.query(User).filter(User.nickname == nickname).first()
    if not db_user:
        return None

    # ✅ 비밀번호 검증 (원문 vs 저장된 해시)
    if not pwd_context.verify(password, db_user.hashed_password):
        return None

    return db_user
