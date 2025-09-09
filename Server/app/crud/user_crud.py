from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserSignup
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_user(db: Session, user: UserSignup):
    hashed_pw = pwd_context.hash(user.password)
    db_user = User(nickname=user.nickname, hashed_password=hashed_pw)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, nickname: str, password: str):
    db_user = db.query(User).filter(User.nickname == nickname).first()
    if not db_user or not pwd_context.verify(password, db_user.hashed_password):
        return None
    return db_user
