from __future__ import annotations

from typing import Optional, List, Dict, Any
import json
import asyncio
import logging
import anyio

from fastapi import APIRouter, Depends, HTTPException, Request, Header, Query
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.recommendation import Recommendation  # noqa: F401
from app.models.survey import Survey                 # noqa: F401
from app.schemas.survey import SurveyCreate
from app.crud import survey_crud, recommendation_crud

# --- RAG/LLM & 일정 정규화 유틸 ---
from app.services.rag_service import (
    get_rag_recommendation,
    SpeedProfile,
    LAST_USED_MODEL,
)
from app.services.prompt_builder import _extract_days
from app.services.schedule_guard import (
    normalize_schedule_to_array,
    guard_schedule,
    schedule_array_to_map,
)

# --- 인증 (세션/CSRF) ---
from app.api.v1.endpoints.auth import require_auth

# --- 숙소 검증/폴백 ---
from app.services.geo_enrich import enrich_one_recommendation
from app.services.hotel_guard import decide_lodging_mode
from app.services.places_client import places_text_search  # Google Places 래퍼 사용

router = APIRouter()
log = logging.getLogger("survey")

# 동시 보강 상한 (외부 API 남발 방지)
_SEM = asyncio.Semaphore(4)

# -------------------- JSON 정규화 유틸 --------------------

def _loads_if_json_str(v: Any) -> Any:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return v
    return v


def _normalize_city_item(item: Any) -> Optional[Dict[str, Any]]:
    """LLM 결과를 표준 스키마로 강제 변환."""
    item = _loads_if_json_str(item)
    if not isinstance(item, dict):
        return None

    city = str(item.get("city") or "추천 도시")
    country = str(item.get("country") or "").strip()
    reason = str(item.get("reason") or "")
    schedule = item.get("schedule", [])
    if not isinstance(schedule, list):
        schedule = []

    norm_days: List[Dict[str, Any]] = []
    for day_block in schedule:
        day_block = _loads_if_json_str(day_block)
        if not isinstance(day_block, dict):
            continue

        day = str(day_block.get("day") or "day_1")
        acts = day_block.get("activities", [])
        if isinstance(acts, str):
            acts = [acts]
        if not isinstance(acts, list):
            acts = []

        fixed_acts = []
        for a in acts:
            a = _loads_if_json_str(a)
            if isinstance(a, dict):
                t = str(a.get("time") or "")
                act = str(a.get("activity") or "")
            else:
                t, act = "", str(a or "")
            fixed_acts.append({"time": t, "activity": act})

        norm_days.append({"day": day, "activities": fixed_acts})

    # lodging 필드 정규화
    lodging = item.get("lodging", {"areas": [], "hotels": []})
    if not isinstance(lodging, dict):
        lodging = {"areas": [], "hotels": []}

    normalized = {
        "city": city,
        "country": country,
        "reason": reason,
        "schedule": norm_days,
        "lodging": lodging,
    }

    # allPlaces/days는 있으면 그대로 둔다 (보강 단계에서 사용)
    if isinstance(item.get("allPlaces"), list):
        normalized["allPlaces"] = item["allPlaces"]
    if isinstance(item.get("days"), list):
        normalized["days"] = item["days"]

    return normalized


def _force_schedule_shape(schedule_arr: Any, days: int) -> List[Dict[str, Any]]:
    """스케줄 형태 강제"""
    if not isinstance(schedule_arr, list):
        return []

    out: List[Dict[str, Any]] = []
    for idx, day_block in enumerate(schedule_arr, start=1):
        day_block = _loads_if_json_str(day_block)
        if not isinstance(day_block, dict):
            continue

        day = str(day_block.get("day") or f"day_{idx}")
        acts = day_block.get("activities", [])

        if isinstance(acts, str):
            acts = [acts]
        if not isinstance(acts, list):
            acts = []

        fixed_acts = []
        for a in acts:
            a = _loads_if_json_str(a)
            if isinstance(a, dict):
                t, act = str(a.get("time") or ""), str(a.get("activity") or "")
            else:
                t, act = "", str(a or "")
            fixed_acts.append({"time": t, "activity": act})

        out.append({"day": day, "activities": fixed_acts})

    return out


# -------------------- 사용자 히스토리 --------------------

@router.get("/history/{nickname}", summary="(본인 전용) 사용자 설문+추천 ID 목록 조회")
def get_user_recommendation_ids(
    nickname: str,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
):
    # 본인 아닌 경우 차단
    if user["nickname"] != nickname:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 설문 목록 조회
    surveys: List[Survey] = db.query(Survey).filter(Survey.nickname == nickname).all()

    results: List[Dict[str, Any]] = []
    for s in surveys:
        rec = db.query(Recommendation).filter(Recommendation.survey_id == s.id).first()
        if rec:
            results.append({
                "survey_id": s.id,
                "recommendation_id": rec.id,
                "created_at": getattr(s, "created_at", None)
            })

    return {"status": "success", "results": results}


@router.get("/detail/{survey_id}", summary="(본인 전용) 설문+추천 상세 조회")
def get_survey_detail(
    survey_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
):
    survey: Optional[Survey] = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    if survey.nickname != user["nickname"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    recommendation: Optional[Recommendation] = (
        db.query(Recommendation).filter(Recommendation.survey_id == survey_id).first()
    )

    return {
        "status": "success",
        "survey_id": survey.id,
        "nickname": survey.nickname,
        "preferences": survey.preferences,
        "recommendation": recommendation.result if recommendation else None,
    }


# -------------------- 메인 엔드포인트 --------------------

@router.post("/recommend", summary="[RAG] 설문 저장 + AI 추천 생성(+숙소 하이브리드 검증)")
async def survey_and_recommend(
    survey: SurveyCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_auth),
    x_csrf_token: Optional[str] = Header(None),
    debug: bool = Query(False, description="디버그 정보 포함 여부"),
    speed: str = Query("balanced", regex="^(fast|balanced|max)$"),
    city_count: int = Query(1, ge=1, le=3, description="추천 도시 개수(1~3)"),
):
    # 1️⃣ CSRF 검증
    session_csrf = request.session.get("csrf")
    if not x_csrf_token or not session_csrf or x_csrf_token != session_csrf:
        raise HTTPException(status_code=403, detail="CSRF token invalid")

    survey = survey.model_copy(update={"nickname": user["nickname"]})
    log.info("[REQ] recommend user=%s speed=%s city_count=%s", user.get("nickname"), speed, city_count)

    # 2️⃣ 설문 저장
    saved_survey = survey_crud.create_survey(db=db, survey=survey)

    # 3️⃣ LLM 호출 (속도 프로파일 적용)
    sp = getattr(SpeedProfile, speed.upper())

    try:
        prefs_dict = json.loads(survey.preferences.model_dump_json())

        timeout_s = 35 if sp == SpeedProfile.FAST else (45 if sp == SpeedProfile.BALANCED else 55)
        with anyio.fail_after(timeout_s):
            # ✅ 개수는 rag_service가 단일 출처로 통제
            rag_output = await run_in_threadpool(get_rag_recommendation, prefs_dict, sp, city_count)

        raw = rag_output.get("recommendation")
        debug_prompt = rag_output.get("prompt", "(no prompt)")

        raw = _loads_if_json_str(raw)

        if isinstance(raw, dict) and "data" in raw:
            raw = raw["data"]

        if not isinstance(raw, list):
            raise HTTPException(status_code=502, detail="invalid LLM output")

        normalized: List[Dict[str, Any]] = []
        for item in raw:
            norm = _normalize_city_item(item)
            if norm:
                normalized.append(norm)

        if not normalized:
            raise HTTPException(status_code=502, detail="empty normalized result")

    except Exception as e:
        log.exception("LLM pipeline failed: %s", e)
        raise HTTPException(status_code=502, detail=f"AI error: {e}")

    # 4️⃣ 일정 후처리
    duration = prefs_dict.get("duration")
    days = _extract_days(duration)
    safe_data: List[Dict[str, Any]] = []

    for city in normalized:
        try:
            schedule_raw = city.get("schedule", [])

            if sp == SpeedProfile.FAST:
                # 빠른 길: 형태만 강제
                arr = _force_schedule_shape(schedule_raw, days)
            else:
                arr = normalize_schedule_to_array(schedule_raw, days)
                arr = _force_schedule_shape(arr, days)
                arr = guard_schedule(
                    arr,
                    days=days,
                    depart_window=prefs_dict.get("depart_window"),
                    return_window=prefs_dict.get("return_window"),
                    density=prefs_dict.get("density"),
                )

            city["schedule"] = schedule_array_to_map(arr)
            safe_data.append(city)
        except Exception as e:
            log.warning("schedule guard failed city=%s err=%s", city.get("city"), e)

    if not safe_data:
        raise HTTPException(status_code=502, detail="invalid schedules")

    # 5️⃣ 숙소 검증/폴백 (핵심)
    enriched_lodging: List[Dict[str, Any]] = []
    for rec in safe_data:
        lodging = rec.get("lodging", {})
        hotels = lodging.get("hotels", [])
        areas = lodging.get("areas", [])

        city_center = (None, None)
        # city_center 추출 (간단 추정)
        if rec.get("allPlaces") and isinstance(rec["allPlaces"], list) and rec["allPlaces"]:
            first = rec["allPlaces"][0]
            city_center = (first.get("lat"), first.get("lng"))

        try:
            # 외부 검색 남발 방지: hotel_guard 내부에서 검색 호출 상한을 두는 설계 권장
            lodging_final = decide_lodging_mode(
                city_center=city_center if all(city_center) else (0.0, 0.0),
                model_hotels=hotels,
                areas=areas,
                places_search_fn=places_text_search,
            )
            rec["lodging"] = lodging_final
        except Exception as e:
            log.error("lodging validation failed city=%s err=%s", rec.get("city"), e)
            rec["lodging"] = {
                "mode": "area",
                "areas": [{"name_original": rec.get("city"), "name_ko": f"{rec.get('city')} 시내 중심", "why": "교통과 접근성이 우수"}],
                "hotels": [],
            }
        enriched_lodging.append(rec)

    # 6️⃣ 좌표/경로 보강 (speed에 따라 생략/제한)
    if sp == SpeedProfile.FAST:
        final_data = enriched_lodging
    else:
        async def _enrich_guarded(rec: Dict[str, Any], debug_flag: bool):
            async with _SEM:
                return await enrich_one_recommendation(dict(rec), collect_debug=debug_flag)

        try:
            enriched_list = await asyncio.gather(
                *(_enrich_guarded(r, debug) for r in enriched_lodging),
                return_exceptions=True,
            )

            final_data: List[Dict[str, Any]] = []
            for i, r in enumerate(enriched_list):
                if isinstance(r, Exception):
                    log.error("[enrich] fail idx=%d: %s", i, r)
                    final_data.append(enriched_lodging[i])
                else:
                    merged = {**enriched_lodging[i], **r}
                    # lodging 보존 (enrich 내부에서 덮어쓰지 않도록)
                    merged["lodging"] = enriched_lodging[i].get("lodging")
                    final_data.append(merged)
        except Exception as e:
            log.error("geo enrich failed: %s", e)
            final_data = enriched_lodging

    # 7️⃣ DB 저장 (debug 필드 제거)
    to_save: List[Dict[str, Any]] = []
    for item in final_data:
        m = dict(item)
        m.pop("_debug", None)
        to_save.append(m)

    saved_rec = recommendation_crud.save_recommendation(
        db=db,
        survey_id=saved_survey.id,  # type: ignore
        result=to_save,
    )

    # 8️⃣ 응답 조립
    return {
        "status": "success",
        "survey_id": saved_survey.id,
        "recommendation_id": saved_rec.id,
        "model": LAST_USED_MODEL,
        "speed": sp.value,
        "city_count": city_count,
        "data": final_data if debug else to_save,
        "debug_prompt": debug_prompt,
    }
