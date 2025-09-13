# app/api/v1/endpoints/upload.py
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse

# ✅ auth의 require_auth 재사용 (세션 로그인 보호)
from app.api.v1.endpoints.auth import require_auth

router = APIRouter()

# 설정
ALLOWED_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB

@router.post("/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    user = Depends(require_auth),
):
    # MIME 검사
    ext = ALLOWED_MIME.get(file.content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WebP allowed")

    # 저장 경로 (예: static/uploads/2025-09/)
    today = datetime.utcnow().strftime("%Y-%m")
    base_dir = os.path.join("static", "uploads", today)
    os.makedirs(base_dir, exist_ok=True)

    # 파일명
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(base_dir, fname)

    # 크기 제한 + 스트리밍 저장
    size = 0
    try:
        with open(fpath, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB씩
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    out.close()
                    os.remove(fpath)
                    raise HTTPException(status_code=400, detail="File too large (max 5MB)")
                out.write(chunk)
    finally:
        await file.close()

    # 접근 URL 구성
    # request.base_url: http://localhost:8000/
    url = str(request.base_url).rstrip("/") + f"/static/uploads/{today}/{fname}"

    # 클라이언트에 URL 반환 (프로필에 저장할 값)
    return JSONResponse({"url": url})
