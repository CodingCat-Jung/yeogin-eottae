# app/api/v1/endpoints/emergency.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, constr

from app.db.session import get_db

router = APIRouter()

# 응답 스키마 (호텔 주소 제외)
class EmergencyCard(BaseModel):
    country_code: constr(pattern=r'^[A-Za-z]{2}$')
    country_name: str
    police: str
    emergency: str
    embassy_name: str
    embassy_tel: str
    embassy_emergency_tel: str

TABLE = "emergency_contacts"  # ← 테이블명이 다르면 여기만 바꾸세요

# 1) 단건 조회: /api/v1/emergency/JP
@router.get("/emergency/{country_code}", response_model=EmergencyCard)
def get_emergency_card(country_code: str, db: Session = Depends(get_db)):
    row = db.execute(
        text(f"""
            SELECT country_code, country_name, police, emergency,
                   embassy_name, embassy_tel, embassy_emergency_tel
            FROM {TABLE}
            WHERE UPPER(country_code) = UPPER(:code)
            LIMIT 1
        """),
        {"code": country_code},
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="등록된 국가가 없습니다.")

    return {
        "country_code": row[0],
        "country_name": row[1],
        "police": row[2],
        "emergency": row[3],
        "embassy_name": row[4],
        "embassy_tel": row[5],
        "embassy_emergency_tel": row[6],
    }

# 2) 리스트/검색(선택): /api/v1/emergency?query=ja
@router.get("/emergency")
def list_emergency(
    query: str = Query(default="", description="국가코드/국가명 부분검색"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(f"""
            SELECT country_code, country_name, police, emergency,
                   embassy_name, embassy_tel, embassy_emergency_tel
            FROM {TABLE}
            WHERE (:q = '' OR country_code LIKE :qs OR country_name LIKE :qs)
            ORDER BY country_name
            LIMIT :limit
        """),
        {"q": query, "qs": f"%{query}%", "limit": limit},
    ).fetchall()

    cols = ("country_code","country_name","police","emergency",
            "embassy_name","embassy_tel","embassy_emergency_tel")
    return [dict(zip(cols, r)) for r in rows]
