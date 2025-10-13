# app/api/v1/endpoints/upload.py
from __future__ import annotations

import os
import uuid
import shutil
import pathlib
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

# ✅ 세션 보호
from app.api.v1.endpoints.auth import require_auth
# ✅ auth.py의 아바타 디렉토리/타임스탬프 도우미 재사용
from app.api.v1.endpoints.auth import AVATAR_DIR, _avatar_updated_ts

router = APIRouter()

ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


# --------------------------------------------------------------------
# 1) 일반 파일 업로드 (기존 로직 유지)
#    예: 본문 이미지, 기타 첨부 등 → /static/uploads/YYYY-MM/uuid.ext 로 저장
# --------------------------------------------------------------------
@router.post("/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    user = Depends(require_auth),
):
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
                chunk = await file.read(1024 * 1024)  # 1MB
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

    # 접근 URL 구성 (FastAPI에서 /static 마운트됨)
    url = str(request.base_url).rstrip("/") + f"/static/uploads/{today}/{fname}"
    return JSONResponse({"url": url})


# --------------------------------------------------------------------
# 2) 프로필 아바타 업로드 (파일 기반 프로필 전용)
#    저장: uploads/avatars/{user_id}.{ext}
#    기존 확장자 파일은 모두 삭제 후 새 파일로 교체
#    응답: { ok, profile_image_url: "/api/auth/avatar", updated_at: <int> }
# --------------------------------------------------------------------
@router.post("/upload/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user = Depends(require_auth),
):
    ext = ALLOWED_MIME.get(file.content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WebP allowed")

    user_id = int(user["id"])

    # 디렉토리 보장
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    # 같은 유저의 기존 아바타(다른 확장자 포함) 제거
    for e in (".png", ".jpg", ".jpeg", ".webp"):
        oldp = AVATAR_DIR / f"{user_id}{e}"
        if oldp.exists():
            oldp.unlink()

    # 목적지 경로
    dest: pathlib.Path = AVATAR_DIR / f"{user_id}{ext}"

    # 스트리밍 저장 (크기 제한)
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    out.close()
                    if dest.exists():
                        dest.unlink()
                    raise HTTPException(status_code=400, detail="File too large (max 5MB)")
                out.write(chunk)
    finally:
        await file.close()

    # mtime 업데이트 → 캐시 버스트용
    try:
        os.utime(dest, None)
    except Exception:
        pass

    updated_at = _avatar_updated_ts(dest)

    # 파일 기반이므로 DB 칼럼(profile_image_url) 없이도 /api/auth/me가 감지함
    # (원한다면 여기서 DB를 열어 profile_image_url=None로 만들어도 됨)

    return JSONResponse({
        "ok": True,
        "profile_image_url": "/api/auth/avatar",
        "updated_at": updated_at,
    })
