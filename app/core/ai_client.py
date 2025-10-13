# app/core/ai_client.py
import os
import httpx

API_KEY  = os.getenv("GOOGLE_API_KEY", "")
API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1")
MODEL    = os.getenv("GEMINI_MODEL", "models/gemini-1.5-flash")
print("[AI] API_BASE =", API_BASE)
print("[AI] MODEL    =", MODEL)
print("[AI] URL      =", f"{API_BASE}/{MODEL}:generateContent")

if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY is missing")

HEADERS = {
    "x-goog-api-key": API_KEY,
    "Content-Type": "application/json",
}

GENERATE_URL = f"{API_BASE}/{MODEL}:generateContent"
LIST_URL     = f"{API_BASE}/models"

async def list_models() -> dict:
    """부팅 시 모델 목록 확인(옵션)."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(LIST_URL, headers={"x-goog-api-key": API_KEY})
        r.raise_for_status()
        return r.json()

async def generate_text(prompt: str) -> dict:
    """
    텍스트 프롬프트로 Gemini 호출. 4xx는 그대로 던져서 FastAPI가 4xx로 반환하게 함.
    """
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(GENERATE_URL, headers=HEADERS, json=body)

    if 400 <= r.status_code < 500:
        # 4xx는 그대로 클라에 전달
        raise httpx.HTTPStatusError(
            f"Upstream {r.status_code}: {r.text}", request=r.request, response=r
        )

    r.raise_for_status()
    return r.json()

def extract_text(ai_resp: dict) -> str:
    """
    generateContent 응답에서 첫 번째 candidate의 텍스트만 안전하게 추출.
    """
    try:
        candidates = ai_resp.get("candidates") or []
        if not candidates:
            return ""
        parts = (
            candidates[0]
            .get("content", {})
            .get("parts", [])
        )
        # 텍스트 파트만 이어붙임
        texts = []
        for p in parts:
            if "text" in p and isinstance(p["text"], str):
                texts.append(p["text"])
        return "\n".join(texts).strip()
    except Exception:
        return ""
