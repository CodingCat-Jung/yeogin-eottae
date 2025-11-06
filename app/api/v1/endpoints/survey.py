# app/api/v1/endpoints/survey.py
from __future__ import annotations

from typing import Optional, List, Dict, Any
import json
import asyncio
import logging
import anyio
import re

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
    # ★ 추가
    guard_and_normalize_map,
    normalize_schedule_keys_to_day,
)

# --- 인증 (세션/CSRF) ---
from app.api.v1.endpoints.auth import require_auth

# --- 숙소 검증/폴백 ---
from app.services.geo_enrich import enrich_one_recommendation
from app.services.hotel_guard import decide_lodging_mode
from app.services.places_client import places_text_search  # Google Places 래퍼 사용

# --- Country 매칭 ---
from app.services.country_matcher import match_country_code  # ✅ 추가

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

    # LLM 예산 메타 보존
    if isinstance(item.get("meta"), dict):
        normalized["meta"] = item["meta"]

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
    if user["nickname"] != nickname:
        raise HTTPException(status_code=403, detail="Forbidden")

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

    # 🔽 다양화/캐시/도시 제어 신호
    fresh: bool = Query(False, description="캐시 무시하고 새로 생성"),
    variant: int = Query(0, description="결과 변형 시드(0=기본)"),
    avoid: Optional[str] = Query(None, description="피하고 싶은 도시들(쉼표 구분)"),
    new_city: bool = Query(False, description="이전과 다른 도시를 강제 시도"),
    keep_city: Optional[str] = Query(None, description="동일 도시 유지 강제(프론트에서 현재 도시 전달)"),
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

    # 프롬프트/캐시 키에서 사용할 prefs 확장
    prefs_dict = json.loads(survey.preferences.model_dump_json())
    prefs_dict["_variant"] = int(variant) if variant else 0
    if avoid:
        prefs_dict["_avoid_cities"] = [s.strip() for s in avoid.split(",") if s.strip()]
    if new_city:
        prefs_dict["_force_new_city"] = True
    if keep_city:
        prefs_dict["_keep_city"] = keep_city.strip()

    debug_prompt = "(no prompt)"
    try:
        timeout_s = 35 if sp == SpeedProfile.FAST else (45 if sp == SpeedProfile.BALANCED else 55)
        with anyio.fail_after(timeout_s):
            rag_output = await run_in_threadpool(
                get_rag_recommendation,
                prefs_dict,
                sp,
                city_count,
                fresh,  # ✅ 캐시 우회 옵션
            )

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

    # 4️⃣ 일정 후처리 (SSOT=일정)
    duration = prefs_dict.get("duration")
    days = _extract_days(duration)
    safe_data: List[Dict[str, Any]] = []

    for city in normalized:
        try:
            schedule_raw = city.get("schedule", [])

            if sp == SpeedProfile.FAST:
                # 🔹 FAST: 형태만 강제 + day_N 키 정규화 (시간 가드 생략)
                arr = _force_schedule_shape(schedule_raw, days)
                schedule_map = normalize_schedule_keys_to_day(schedule_array_to_map(arr))
            else:
                # 🔹 BALANCED/MAX: 시간 가드 + 키 통일을 한 번에
                schedule_map = guard_and_normalize_map(
                    schedule_raw,
                    days=days,
                    depart_window=prefs_dict.get("depart_window"),
                    return_window=prefs_dict.get("return_window"),
                    density=prefs_dict.get("density"),
                )

            city["schedule"] = schedule_map
            safe_data.append(city)
        except Exception as e:
            log.warning("schedule guard failed city=%s err=%s", city.get("city"), e)

    if not safe_data:
        raise HTTPException(status_code=502, detail="invalid schedules")

    # ✅ 4.5️⃣ 나라 매칭: country → country_code 주입
    for rec in safe_data:
        raw_country = (rec.get("country") or "").strip()
        try:
            code = match_country_code(db, raw_country)
        except Exception as e:
            log.warning("country match error city=%s country=%s err=%s",
                        rec.get("city"), raw_country, e)
            code = None
        if code:
            rec["country_code"] = code

    # ✅ 4.8️⃣ 예산 메타 주입 (프론트 배너/뱃지 트리거)
    try:
        total_days = _extract_days(prefs_dict.get("duration"))
        if not isinstance(total_days, int) or total_days <= 0:
            total_days = 3  # 안전 폴백

        # 사용자가 입력한 '내 예산'
        user_budget_raw = prefs_dict.get("budget", 0)
        if isinstance(user_budget_raw, str):
            import re as _re
            num = _re.sub(r"[^\d]", "", user_budget_raw)
            user_budget_krw = int(num) if num else 0
        elif isinstance(user_budget_raw, (int, float)):
            user_budget_krw = int(user_budget_raw)
        else:
            user_budget_krw = 0

        # ── 가격지수/가중치 테이블 ─────────────────────────────
        PRICE_INDEX_BY_CC = {
            # OECD 대략값/체감가 기준의 러프한 스케일 (없으면 1.0)
            "JP": 1.10, "KR": 1.00, "TW": 0.95, "TH": 0.70, "VN": 0.65, "MY": 0.75,
            "SG": 1.60, "HK": 1.50, "CN": 0.95,
            "US": 1.60, "CA": 1.40,
            "GB": 1.55, "FR": 1.50, "ES": 1.20, "IT": 1.35, "DE": 1.40, "CH": 1.90,
            "AU": 1.45, "NZ": 1.35,
        }
        DENSITY_MULT = {
            "relax": 0.90, "느긋": 0.90,
            "active": 1.15, "활동": 1.15,
            "default": 1.00,
        }
        COMP_MULT = {
            "family": 1.05, "가족": 1.05,
            "couple": 1.05, "연인": 1.05,
            "friends": 1.00, "친구": 1.00,
            "solo": 0.95, "혼자": 0.95,
        }

        # 기본 단가(현지 체류비만: 숙박/식비/교통/입장)
        BASE_MIN_PER_DAY     = 65_000   # '최소'를 구성할 때 1일 하한
        BASE_EXPECT_PER_DAY  = 120_000  # '예상'의 기본축 (LLM 없을 때)
        FAMILY_BUFFER_MAX_UP = 0.05     # 가족/커플이면 상한 폭 소폭 증가

        density = (prefs_dict.get("density") or "").lower()
        travel_with = (prefs_dict.get("travelWith") or prefs_dict.get("companion") or "").lower()

        def _density_mult():
            if "느긋" in density or "relax" in density:
                return DENSITY_MULT["relax"]
            if "활동" in density or "active" in density:
                return DENSITY_MULT["active"]
            return DENSITY_MULT["default"]

        def _comp_mult():
            for k, v in COMP_MULT.items():
                if k in travel_with:
                    return v
            return 1.0

        for rec in safe_data:
            meta = rec.get("meta") or {}
            existing_budget = (meta.get("budget") or {})
            cc = rec.get("country_code") or ""
            price_idx = PRICE_INDEX_BY_CC.get(cc, 1.0)

            # LLM 예상치가 있으면 최대한 존중
            llm_expected = existing_budget.get("estimatedTotalKRW")
            if isinstance(llm_expected, (int, float)) and llm_expected > 0:
                expected_total = int(llm_expected)
            else:
                expected_total = int(BASE_EXPECT_PER_DAY * total_days * price_idx * _density_mult() * _comp_mult())

            # 최소/최대 범위 산출 (상대폭은 템포/동행에 따라 가변)
            # - 느긋: 하한 낮게(0.55~0.65), 상한도 적당(1.25)
            # - 활동: 하한 조금 낮게(0.60), 상한 크게(1.40)
            if "느긋" in density or "relax" in density:
                min_total = int(max(BASE_MIN_PER_DAY * total_days * price_idx * 0.95, expected_total * 0.55))
                max_total = int(expected_total * (1.25 + (FAMILY_BUFFER_MAX_UP if "가족" in travel_with or "연인" in travel_with or "couple" in travel_with else 0.0)))
            elif "활동" in density or "active" in density:
                min_total = int(max(BASE_MIN_PER_DAY * total_days * price_idx, expected_total * 0.60))
                max_total = int(expected_total * (1.40 + (FAMILY_BUFFER_MAX_UP if "가족" in travel_with or "연인" in travel_with or "couple" in travel_with else 0.0)))
            else:
                min_total = int(max(BASE_MIN_PER_DAY * total_days * price_idx, expected_total * 0.58))
                max_total = int(expected_total * (1.32 + (FAMILY_BUFFER_MAX_UP if "가족" in travel_with or "연인" in travel_with or "couple" in travel_with else 0.0)))

            # 사용자 예산 충족 여부
            ok = (user_budget_krw > 0) and (user_budget_krw >= min_total)

            budget_meta = {
                "ok": ok,
                "minRequiredKRW": int(min_total),           # ✅ '최소'
                "expectedKRW": int(expected_total),         # ✅ '예상'
                "maxPlausibleKRW": int(max_total),          # ✅ '최대' (상한)
                "estimatedTotalKRW": int(expected_total),   # FE 호환 유지
                "perDayKRW": int(expected_total // max(1, total_days)),
                "breakdown": existing_budget.get("breakdown"),
                "notes": [
                    "예산이 부족합니다. 최소 비용 기준으로 간소한 일정을 구성했습니다." if not ok
                    else "예산이 충분하여 표준 일정을 구성했습니다."
                ],
            }
            existing_budget.update(budget_meta)
            meta["budget"] = existing_budget
            rec["meta"] = meta

    except Exception as e:
        log.warning("meta.budget inject failed err=%s", e)

    # -------------------- 5️⃣ 숙소 검증/폴백 (강화판) --------------------
    _HOTEL_NAME_RE = re.compile(r"(hotel|hostel|inn|resort|ryokan|bnb|guest\s*house|게스트하우스|호스텔|호텔|료칸)", re.I)

    def _fallback_hotels_from_allplaces(rec: Dict[str, Any], limit: int = 2) -> list:
        """allPlaces 안에서 숙소처럼 보이는 POI를 호텔 리스트로 변환"""
        out = []
        for p in rec.get("allPlaces", []) or []:
            name = p.get("name_ko") or p.get("name_original") or p.get("name_en") or p.get("display_name")
            if not name:
                continue
            cat = (p.get("category") or "").lower()
            looks_lodging = (
                "hotel" in cat or "hostel" in cat or "guest" in cat or "lodg" in cat or
                _HOTEL_NAME_RE.search(name) is not None
            )
            # 공항/역/쇼핑몰 등은 제외
            if looks_lodging and not any(k in cat for k in ["airport", "station", "subway", "mall", "market"]):
                out.append({
                    "name_original": name,
                    "name_ko": p.get("name_ko") or name,
                    "lat": p.get("lat"),
                    "lng": p.get("lng"),
                    "why": "추천 일정 반경 내 숙소 후보",
                    "price_tier": None,
                })
        out.sort(key=lambda h: (h.get("lat") is None or h.get("lng") is None, h["name_original"]))
        return out[:limit]

    def _fallback_pick_hotels(city: str, country: str | None, places_search_fn, limit: int = 2) -> list:
        """텍스트 검색으로 호텔 후보를 뽑는다. 실패/무응답이면 빈 리스트 반환."""
        if not city:
            return []
        queries = [
            f"{city} hotel",
            f"{city} accommodation",
            f"{city} ryokan",
            f"{city} hostel",
            f"{city} 호텔",
            f"{city} 숙소",
        ]
        if country:
            queries.extend([
                f"{city} {country} hotel",
                f"{city} {country} 호텔",
            ])

        for q in queries:
            try:
                items = places_search_fn(q, language="ko", max_results=limit)
            except TypeError:
                try:
                    items = places_search_fn(q, language="ko")
                except Exception:
                    items = None
            except Exception:
                items = None

            if not items:
                continue

            hotels = []
            for it in items or []:
                name = it.get("name") or it.get("name_ko") or it.get("name_en") or it.get("display_name")
                if not name:
                    continue
                hotels.append({
                    "name_original": name,
                    "name_ko": it.get("name_ko") or name,
                    "lat": it.get("lat"),
                    "lng": it.get("lng"),
                    "why": "접근성 좋은 인기 숙소 후보",
                    "price_tier": None,
                })
            if hotels:
                return hotels[:limit]
        return []

    enriched_lodging: List[Dict[str, Any]] = []
    for rec in safe_data:
        lodging = rec.get("lodging", {}) or {}
        hotels = lodging.get("hotels", []) or []
        areas = lodging.get("areas", []) or []

        city_center = (None, None)
        if rec.get("allPlaces") and isinstance(rec["allPlaces"], list) and rec["allPlaces"]:
            first = rec["allPlaces"][0]
            city_center = (first.get("lat"), first.get("lng"))

        try:
            lodging_final = decide_lodging_mode(
                city_center=city_center if all(city_center) else (0.0, 0.0),
                model_hotels=hotels,
                areas=areas,
                places_search_fn=places_text_search,
            )
        except Exception as e:
            log.error("lodging validation failed city=%s err=%s", rec.get("city"), e)
            lodging_final = {"mode": "area", "areas": areas, "hotels": hotels}

        # 1) 호텔이 비어 있으면: 텍스트 검색 폴백
        if not lodging_final.get("hotels"):
            fb = _fallback_pick_hotels(
                rec.get("city") or "",
                rec.get("country"),
                places_search_fn=places_text_search,
                limit=2,
            )
            if fb:
                lodging_final["hotels"] = fb
                lodging_final["mode"] = "hotels"

        # 2) 그래도 비어 있으면: allPlaces에서 숙소로 보이는 점을 호텔로 변환
        if not lodging_final.get("hotels"):
            fb2 = _fallback_hotels_from_allplaces(rec, limit=2)
            if fb2:
                lodging_final["hotels"] = fb2
                lodging_final["mode"] = "hotels"

        # 3) 여전히 비어 있으면 마지막 폴백: area만 유지
        if not lodging_final.get("hotels"):
            if not lodging_final.get("areas"):
                lodging_final["areas"] = [{
                    "name_original": rec.get("city"),
                    "name_ko": f"{rec.get('city')} 시내 중심",
                    "why": "교통과 접근성이 우수",
                }]
            lodging_final["mode"] = "area"

        rec["lodging"] = lodging_final
        enriched_lodging.append(rec)
    # ---------------------------------------------------------------------

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