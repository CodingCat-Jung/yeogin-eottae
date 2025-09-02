from pydantic import BaseModel

class UserSignup(BaseModel):
    nickname: str
    password: str

class UserLogin(BaseModel):
    nickname: str
    password: str

