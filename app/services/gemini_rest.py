# app/services/gemini_rest.py
from __future__ import annotations

import json
import os
import time
from typing import Dict, Iterable, List, Optional, Tuple

import requests

# ===== 환경 =====
GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
# v1beta 권장 (너 계정 ListModels가 v1beta에 최신 모델 노출)
GEMINI_API_BASE = os.environ.get(
    "GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta"
)

# HTTP 타임아웃
RAG_LLM_TIMEOUT_SEC = int(os.environ.get("RAG_LLM_TIMEOUT_SEC", "35"))


class GeminiRESTError(RuntimeError):
    pass


def _build_url(model: str) -> str:
    # model은 "models/xxx" 또는 "xxx" 모두 허용
    name = model if model.startswith("models/") else f"models/{model}"
    return f"{GEMINI_API_BASE}/{name}:generateContent?key={GEMINI_API_KEY}"


def _mk_contents_text(text: str) -> Dict:
    # REST는 role: user/model 만 허용. system 금지.
    return {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": text}],
            }
        ]
    }


def _merge_gencfg(base_cfg: Optional[Dict], overrides: Optional[Dict]) -> Dict:
    cfg = dict(base_cfg or {})
    if overrides:
        cfg.update(overrides)
    return cfg


def _resp_to_text_and_finish_reason(resp_json: Dict) -> Tuple[str, Optional[str]]:
    """
    Google REST 응답을 텍스트와 finishReason으로 변환.
    텍스트가 없을 수 있으므로 빈 문자열 반환 가능.
    """
    cand = None
    try:
        cands = resp_json.get("candidates") or []
        if cands:
            cand = cands[0]
    except Exception:
        cand = None

    finish_reason = None
    if cand and isinstance(cand, dict):
        finish_reason = cand.get("finishReason") or cand.get("finish_reason")

    # 텍스트 긁기
    text = ""
    try:
        if cand and "content" in cand:
            parts = cand["content"].get("parts") or []
            # parts 가 [{text:"..."}, ...]
            for p in parts:
                t = p.get("text")
                if t:
                    text += t
    except Exception:
        pass

    return text, finish_reason


def gemini_generate_content(
    user_text: str,
    model_candidates: Iterable[str],
    generation_config: Optional[Dict] = None,
    per_call_overrides: Optional[Dict] = None,
) -> Tuple[str, Optional[str], Dict, str]:
    """
    모델 후보들을 순차 폴백하며 호출.
    반환: (text, finish_reason, raw_json, request_url)
    실패 시 GeminiRESTError 발생.
    """
    if not GEMINI_API_KEY:
        raise GeminiRESTError("GOOGLE_API_KEY / GEMINI_API_KEY 가 설정되지 않음")

    contents = _mk_contents_text(user_text)
    last_err_detail = None

    for model in model_candidates:
        url = _build_url(model)
        body = {
            **contents,
            "generationConfig": _merge_gencfg(generation_config, per_call_overrides),
        }

        try:
            r = requests.post(url, json=body, timeout=RAG_LLM_TIMEOUT_SEC)
        except requests.RequestException as e:
            last_err_detail = f"request error: {e}"
            continue

        # 2xx만 성공으로 간주
        if not (200 <= r.status_code < 300):
            # 404 모델 이름 오탈자/권한 문제 등
            try:
                err_json = r.json()
            except Exception:
                err_json = r.text
            # 로깅은 상위에서 하니 상세만 넘김
            last_err_detail = f"{r.status_code} {err_json}"
            # 다음 후보로
            time.sleep(0.1)
            continue

        # 성공
        try:
            resp_json = r.json()
        except Exception:
            raise GeminiRESTError(f"JSON 디코드 실패 url={r.url}")

        text, fr = _resp_to_text_and_finish_reason(resp_json)
        return text, fr, resp_json, url

    # 모든 후보 실패
    raise GeminiRESTError(f"REST 요청 실패(모델 폴백 소진): {last_err_detail or 'unknown'}")
