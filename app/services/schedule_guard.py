# app/services/schedule_guard.py
from __future__ import annotations
import re
from typing import Any, Dict, List, Tuple, Optional

Activity = Dict[str, str]
DayPlan = Dict[str, Any]  # {"day": "day_1", "activities": [Activity, ...]}


# ──────────────── 기본 유틸 ────────────────
def _day_index(key: str) -> int:
    """'day_3' -> 3 처럼 정렬용 숫자 추출 (없으면 큰 수)."""
    m = re.search(r"(\d+)", key or "")
    return int(m.group(1)) if m else 10_000


def _parse_hhmm(s: str) -> Tuple[int, int]:
    """'HH:MM' -> (H, M). 실패 시 (0,0)."""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*$", s or "")
    if not m:
        return (0, 0)
    return int(m.group(1)), int(m.group(2))


def _to_minutes(s: str) -> int:
    h, m = _parse_hhmm(s)
    return h * 60 + m


def _time_range_minutes(time_range: str) -> Tuple[int, int]:
    """'08:00-10:30' -> (480, 630). 실패 시 (0,0)."""
    if not time_range or "-" not in time_range:
        return (0, 0)
    a, b = time_range.split("-", 1)
    return _to_minutes(a), _to_minutes(b)


# ──────────────── 변환기 ────────────────
def schedule_map_to_array(
    schedule_map: Dict[str, List[Activity]],
    days: int | None = None,
) -> List[DayPlan]:
    """{ 'day_1': [...], 'day_2': [...] } -> [ {'day':'day_1','activities':[...]} , ... ]"""
    items: List[DayPlan] = []
    for k, v in schedule_map.items():
        if isinstance(v, list):
            items.append({"day": k, "activities": v})
    items.sort(key=lambda d: _day_index(d["day"]))
    if days:
        items = items[:days]
    return items


def normalize_schedule_to_array(
    schedule: Any,
    days: int | None = None,
) -> List[DayPlan]:
    """
    - 리스트 형태면 그대로(단, 활동배열만 온 경우 day_1로 감싸기)
    - 딕셔너리(맵) 형태면 배열로 변환
    - 그 외는 빈 배열
    """
    if isinstance(schedule, list):
        if schedule and isinstance(schedule[0], dict) and "day" in schedule[0] and "activities" in schedule[0]:
            arr: List[DayPlan] = schedule  # 이미 표준 형태
        else:
            # 활동 배열만 온 경우를 관대히 처리
            arr = [{"day": "day_1", "activities": schedule}]  # type: ignore[arg-type]
        return arr[:days] if days else arr

    if isinstance(schedule, dict):
        return schedule_map_to_array(schedule, days)

    return []


def schedule_array_to_map(arr: List[DayPlan]) -> Dict[str, List[Activity]]:
    """[{'day':'day_1','activities':[...]}] -> {'day_1':[...]}"""
    out: Dict[str, List[Activity]] = {}
    for d in arr:
        key = d.get("day") or ""
        acts = d.get("activities") or []
        if isinstance(acts, list):
            out[key] = acts
    return out


# ──────────────── 한글 day 키 정규화 ────────────────
_KO_DAY_RE = re.compile(r"^\s*(\d+)\s*일\s*차\s*$", re.IGNORECASE)

def _ko_to_daykey(key: str) -> str:
    """'1일차' → 'day_1', 그 외는 되도록 'day_N' 형태로."""
    if not key:
        return "day_1"
    m = _KO_DAY_RE.match(key)
    if m:
        return f"day_{int(m.group(1))}"
    low = key.strip().lower()
    if low.startswith("day_"):
        return low
    m2 = re.search(r"(\d+)", low)
    return f"day_{int(m2.group(1))}" if m2 else "day_1"


def normalize_schedule_keys_to_day(schedule_map: Dict[str, List[Activity]]) -> Dict[str, List[Activity]]:
    """{'1일차':[...], 'Day2':[...]} → {'day_1':[...], 'day_2':[...]}"""
    out: Dict[str, List[Activity]] = {}
    for k, v in (schedule_map or {}).items():
        if isinstance(v, list):
            out[_ko_to_daykey(k)] = v
    # 키 정렬 보장
    return dict(sorted(out.items(), key=lambda kv: _day_index(kv[0])))


# ──────────────── 아주 기본적인 가드(시간) ────────────────
def guard_schedule(
    schedule: Any,
    *,
    days: int,
    depart_window: str | None = None,
    return_window: str | None = None,
    density: str | None = None,
) -> List[DayPlan]:
    """
    - 입력이 맵/리스트 상관없이 배열로 정규화
    - 1일차 최소 시작시간/마지막 날 종료시간 정도만 라이트하게 체크
    (상세한 보정 로직은 필요 시 확장)
    """
    arr = normalize_schedule_to_array(schedule, days)

    # 1일차 최소 시작 시각(출국 시간대 힌트 기반)
    dw = (depart_window or "").lower()
    if dw in ("dawn", "새벽"):
        min_start = 9 * 60
    elif dw in ("morning", "오전"):
        min_start = 13 * 60
    elif dw in ("afternoon", "오후"):
        min_start = 17 * 60
    elif dw in ("evening", "저녁"):
        min_start = 20 * 60
    else:
        min_start = 9 * 60

    # 마지막 날 종료 상한
    rw = (return_window or "").lower()
    if rw in ("dawn", "새벽"):
        last_limit = 0  # 사실상 관광 없음
    elif rw in ("morning", "오전"):
        last_limit = 8 * 60
    elif rw in ("afternoon", "오후"):
        last_limit = 12 * 60 + 30
    elif rw in ("evening", "저녁"):
        last_limit = 16 * 60 + 30
    else:
        last_limit = 16 * 60 + 30

    # 1일차 필터링: 시작이 너무 이르면 컷
    if arr:
        acts = arr[0].get("activities") or []
        fixed: List[Activity] = []
        for a in acts:
            t = a.get("time") or ""
            start, end = _time_range_minutes(t)
            if end == 0 and start == 0:
                fixed.append(a)
                continue
            if end <= min_start:
                # 최소 시작 이전 활동이면 제거
                continue
            if start < min_start:
                # 시작시각을 살짝 보정(문자열만 교체)
                new_time = f"{min_start//60:02d}:{min_start%60:02d}-{end//60:02d}:{end%60:02d}"
                fixed.append({**a, "time": new_time})
            else:
                fixed.append(a)
        arr[0]["activities"] = fixed

    # 마지막 날 필터링: 종료 상한 넘는 활동 제거
    if arr:
        acts = arr[-1].get("activities") or []
        fixed: List[Activity] = []
        for a in acts:
            t = a.get("time") or ""
            start, end = _time_range_minutes(t)
            if end == 0 and start == 0:
                fixed.append(a)
                continue
            if start >= last_limit:
                # 너무 늦게 시작하는 활동 제거
                continue
            if end > last_limit:
                # 끝나는 시간을 상한으로 컷
                new_time = f"{start//60:02d}:{start%60:02d}-{last_limit//60:02d}:{last_limit%60:02d}"
                fixed.append({**a, "time": new_time})
            else:
                fixed.append(a)
        arr[-1]["activities"] = fixed

    return arr


# ──────────────── 외부에서 쓰기 편한 래퍼 ────────────────
def guard_and_normalize_map(
    schedule: Any,
    *,
    days: int,
    depart_window: str | None = None,
    return_window: str | None = None,
    density: str | None = None,
) -> Dict[str, List[Activity]]:
    """
    guard_schedule → {'day_1':[...]} 맵으로 정규화해 반환.
    한글 day 키/혼합 포맷을 'day_N' 포맷으로 통일.
    """
    arr = guard_schedule(
        schedule,
        days=days,
        depart_window=depart_window,
        return_window=return_window,
        density=density,
    )
    m = schedule_array_to_map(arr)
    return normalize_schedule_keys_to_day(m)


# ──────────────── 활동 텍스트 → 장소 매칭 빌더 ────────────────
def _norm_text(s: str) -> str:
    return re.sub(r"[()\s]", "", (s or "").lower())


def _best_match_place(activity: str, places: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    activity 문장과 places의 이름(display_name/name_ko/name_original) 부분일치로 매칭.
    가장 긴 일치 길이를 선택(오탐 감소).
    """
    a = _norm_text(activity)
    best = None
    best_len = 0
    for p in places or []:
        for key in ("display_name", "name_ko", "name_original"):
            name = _norm_text(p.get(key) or "")
            if name and name in a and len(name) > best_len:
                best, best_len = p, len(name)
    return best


def build_days_from_schedule(
    schedule_map: Dict[str, List[Activity]],
    all_places: List[Dict[str, Any]] | None,
    lodging_anchor: Dict[str, Any] | None = None,
    days_count: int | None = None,
) -> List[Dict[str, Any]]:
    """
    schedule_map(day_1→activities) 기반으로 days[*].stops 좌표 재구성.
    매칭 실패 시 lodging_anchor(호텔/에어리어 첫 항목)로 폴백.
    """
    smap = normalize_schedule_keys_to_day(schedule_map or {})
    if days_count:
        smap = dict(list(smap.items())[:days_count])

    anchor = lodging_anchor or {}
    out: List[Dict[str, Any]] = []
    idx = 0
    for _, acts in smap.items():
        coords = []
        for it in acts or []:
            p = _best_match_place(it.get("activity", ""), all_places or [])
            if p and "lat" in p and "lng" in p:
                coords.append({"lat": p["lat"], "lng": p["lng"]})
            elif anchor and "lat" in anchor and "lng" in anchor:
                coords.append({"lat": anchor["lat"], "lng": anchor["lng"]})
        out.append({"dateOffset": idx, "stops": coords})
        idx += 1
    return out


# ──────────────── 무결성 검사(선택 사용) ────────────────
def validate_consistency(
    schedule_map: Dict[str, List[Activity]],
    days_struct: List[Dict[str, Any]],
    *,
    ratio_threshold: float = 0.6,
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    schedule vs days 정합성 검증.
    - day별로 (stops 수 / activities 수) 비율이 ratio_threshold 이상인지 확인.
    - 실패 항목은 warnings에 누적.
    반환: (ok, warnings)
    """
    smap = normalize_schedule_keys_to_day(schedule_map or {})
    # 키 순서대로 배열화
    arr = [{"day": k, "activities": v} for k, v in smap.items()]
    warnings: List[Dict[str, Any]] = []
    ok = True

    for i, d in enumerate(arr):
        acts = d.get("activities") or []
        stops = days_struct[i]["stops"] if i < len(days_struct) else []
        act_cnt = len(acts)
        stop_cnt = len(stops or [])
        ratio = (stop_cnt / act_cnt) if act_cnt else 0.0
        if act_cnt == 0 or ratio < ratio_threshold:
            ok = False
            warnings.append({
                "day": d.get("day"),
                "code": "LOW_MATCH_RATIO" if act_cnt else "EMPTY_ACTIVITIES",
                "activities": act_cnt,
                "stops": stop_cnt,
                "ratio": round(ratio, 3),
                "threshold": ratio_threshold,
            })
    return ok, warnings
