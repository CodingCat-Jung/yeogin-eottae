# app/schemas/user.py
from pydantic import BaseModel, field_validator

class UserSignup(BaseModel):
    nickname: str
    password: str

    @field_validator("password")
    @classmethod
    def _check_bcrypt_limit(cls, v: str):
        if len(v.encode("utf-8")) > 72:
            raise ValueError("비밀번호는 72바이트 이하로 입력해주세요.")
        return v

class UserLogin(BaseModel):
    nickname: str
    password: str
