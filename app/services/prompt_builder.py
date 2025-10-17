# app/services/prompt_builder.py
import re
from typing import Tuple, Optional

# ───────────────────────────────────────────────
# 기본 유틸
# ───────────────────────────────────────────────
def _extract_days(duration: str) -> int:
    """'2night 3days', '3일', '1박 2일' 등에서 일(day) 수 추출."""
    if not duration:
        return 3
    m = re.search(r'(\d+)\s*day', duration, flags=re.IGNORECASE)
    if m:
        try:
            return max(1, int(m.group(1)))
        except Exception:
            pass
    mk = re.search(r'(\d+)\s*일', duration)
    if mk:
        try:
            return max(1, int(mk.group(1)))
        except Exception:
            pass
    return 3


def _window_to_bounds(depart_window: Optional[str], return_window: Optional[str]) -> Tuple[str, str, str]:
    """출/귀국 시간대(새벽/오전/오후/저녁)에 따른 시간 제약."""
    dw = (depart_window or "").strip().lower()
    rw = (return_window or "").strip().lower()

    # 1일차 최소 시작 시각
    if dw in ("dawn", "새벽"):
        min_start = "09:00"
    elif dw in ("morning", "오전"):
        min_start = "13:00"
    elif dw in ("afternoon", "오후"):
        min_start = "17:00"
    elif dw in ("evening", "저녁"):
        min_start = "20:00"
    else:
        min_start = "09:00"

    # 마지막 날 종료 정책
    if rw in ("dawn", "새벽"):
        last_limit_desc = (
            "마지막 날은 관광을 배치하지 않고, 전날 늦은 오후에 관광을 종료한다. "
            "마지막 날은 공항 이동/체크인/출국 절차만 포함한다."
        )
    elif rw in ("morning", "오전"):
        last_limit_desc = (
            "마지막 날 08:00 이전 출발 준비를 완료해야 한다. "
            "마지막 날에는 관광을 배치하지 않는다."
        )
    elif rw in ("afternoon", "오후"):
        last_limit_desc = "마지막 날 12:30 이전에 모든 관광을 종료한다."
    elif rw in ("evening", "저녁"):
        last_limit_desc = "마지막 날 16:30 이전에 모든 관광을 종료한다."
    else:
        last_limit_desc = "마지막 날 16:30 이전에 모든 관광을 종료한다."

    late_policy = (
        "만약 1일차 최소 시작 시각이 20:00 이후라면, 본격 관광은 day_2 오전부터 시작하고 "
        "day_1에는 '도착·체크인·근처 산책/야식'만 배치한다."
    )
    return min_start, last_limit_desc, late_policy


def _pace_rule_text(density: Optional[str]) -> str:
    """여행 템포(느긋/적당/활동적)에 따른 하루 활동 개수/블록 길이."""
    d = (density or "").lower()
    if "느긋" in d or "relax" in d:
        return "하루 활동 2~3개, 각 블록 2~3시간, 카페/휴식 포함, 동선은 단순하게 유지한다."
    if "활동" in d or "active" in d:
        return "하루 활동 4~5개, 각 블록 1시간 내외, 동선 최적화로 이동 최소화, 체험/액티비티를 충분히 포함한다."
    return "하루 활동 3~4개, 각 블록 1~2시간, 이동과 휴식의 균형을 유지한다."


def _evening_rule_text(density: Optional[str]) -> str:
    """모든 템포에서 저녁까지 구성."""
    d = (density or "").lower()
    if "느긋" in d or "relax" in d:
        return "일반일(day_2~day_{N-1})에는 '저녁 식사' 또는 '야간 산책/노을 감상' 중 1개를 포함하고, 종료는 19:30~20:00."
    if "활동" in d or "active" in d:
        return "일반일(day_2~day_{N-1})에는 '저녁 식사'와 '야경/야시장/전망대' 중 최소 1개를 포함하고, 종료는 20:30~21:00."
    return "일반일(day_2~day_{N-1})에는 '저녁 식사' 또는 '야경/전망대' 중 1개를 포함하고, 종료는 20:00~20:30."


# ───────────────────────────────────────────────
# 월/계절 가이드
# ───────────────────────────────────────────────
def _month_to_season(m: Optional[int]) -> Optional[str]:
    if not m:
        return None
    if m in (3, 4, 5):
        return "SPRING"
    if m in (6, 7, 8):
        return "SUMMER"
    if m in (9, 10, 11):
        return "FALL"
    return "WINTER"


def _season_rule_text(season: Optional[str]) -> str:
    """계절별 행동 가이드."""
    if season == "SPRING":
        return "봄: 벚꽃/공원 산책, 야외 포토 스팟, 우천 시 실내 전시/카페로 대체."
    if season == "SUMMER":
        return "여름: 정오~16시 실내/그늘 동선, 저녁 야간 하이라이트, 수변 활동 포함."
    if season == "FALL":
        return "가을: 단풍/전망 포인트, 산책·미술관 조합, 선선한 워킹 투어."
    if season == "WINTER":
        return "겨울: 실내 비중 확장, 야경·온천·카페 중심, 설경 포토 스팟."
    return "계절 정보 미지정: 일반 가이드를 적용한다."


# ───────────────────────────────────────────────
# 메인 프롬프트 생성 (개수 중립)
# ───────────────────────────────────────────────
def generate_prompt_from_survey(prefs) -> str:
    """
    Gemini에 전달할 초정밀 프롬프트 (최상위 배열만).
    - 개수(도시 수) 규정은 rag_service에서만 통제(중립 문구 유지)
    """
    days = _extract_days(getattr(prefs, "duration", "") or "")
    styles = getattr(prefs, "style", [])
    if not isinstance(styles, (list, tuple)):
        styles = [styles] if styles else []

    depart_window = getattr(prefs, "depart_window", "")
    return_window = getattr(prefs, "return_window", "")
    min_start, last_limit_desc, late_policy = _window_to_bounds(depart_window, return_window)

    density = getattr(prefs, "density", "")
    pace_rule = _pace_rule_text(density)
    evening_rule = _evening_rule_text(density).replace("{N-1}", str(max(2, days - 1)))

    companion = getattr(prefs, "companion", "")
    driving   = getattr(prefs, "driving", "")
    budget    = getattr(prefs, "budget", "")
    climate   = getattr(prefs, "climate", "")
    continent = getattr(prefs, "continent", "")

    travel_month = getattr(prefs, "travel_month", None)
    try:
        tm_int = int(travel_month)
        if 1 <= tm_int <= 12:
            travel_month = tm_int
        else:
            travel_month = None
    except Exception:
        travel_month = None

    season = getattr(prefs, "season", None) or _month_to_season(travel_month)
    season_line = f"- 여행 시기: {str(travel_month)+'월' if travel_month else '미지정'} / 계절: {season or '미지정'}"
    season_rules = _season_rule_text(season)

    return f"""
당신은 전 세계를 여행한 경험이 풍부한 최고의 여행 컨설턴트입니다.
**너는 한국어만 사용해야돼.**
아래 사용자의 선호를 반영하여 {days}일 일정에 적합한 세계 도시를 한국어로 추천하고,
각 도시에 대해 '하루 단위 상세 일정'과 '숙박 권역/호텔 추천'을 생성하세요.

[사용자 선호 요약]
- 동행자: {companion}
- 여행 스타일(테마): {", ".join([str(s) for s in styles if s]) or "미지정"}
- 이동수단: {driving}
- 예산: {budget}
- 선호 기후: {climate}
- 선호 대륙: {continent}
- 여행 템포: {density or "미지정"}
- 출국 시간대: {depart_window or "미지정"}
- 귀국 시간대: {return_window or "미지정"}
{season_line}

[계절/월 가이드]
- {season_rules}
- 월/계절 부적합 야외 활동은 실내 대안으로 대체한다.

[절대 시간 규칙]
- 1일차 첫 활동은 {min_start} 이후에 시작한다.
- {late_policy}
- 마지막 날 일정은 반드시 {last_limit_desc}

[템포 규칙]
- "{density or "적당히"}" 기준: {pace_rule}

[저녁 구성 규칙]
- {evening_rule}
- 동일 일자에서 60분 이상 공백 금지.

[일정 구성 가이드]
- 각 날 3~5개 활동(느긋 2~3개, 활동적 4~5개).
- 활동 필드: "time"(HH:MM-HH:MM), "activity"(설명)
- 이동수단 괄호 표기 예: (도보), (지하철), (버스), (택시), (렌터카)
- 하루 1회 포토 스팟 / 1회 음식점 / 1회 문화 체험 포함.
- 식사 일정은 가능하면 실제 존재하는 식당 이름 포함 (자신 없으면 일반 범주로).
- 마지막 날은 공항 이동/체크아웃/귀국 준비 반영.

[숙소 권역/호텔 추천 규칙]
- 각 도시에 'lodging.areas' 배열과 'lodging.hotels' 배열을 생성한다.
- 'lodging.hotels'에는 실제 검색 가능한 '정확한 호텔명'을 1개 이상 포함하라. 자신 없으면 비워둔다(모호 표현 금지).
- areas: name_original, name_ko, lat, lng, why, budget_hint("저예산/중간/상위").
- hotels: name_original(필수), name_ko(가능), why(200자 이내), price_tier("저예산/중간/상위"), lat/lng(가능), booking_query·agoda_query(선택).

[지도/경로 정보]
- allPlaces: 장소 배열(id, name_original, name_ko, category, lat, lng)
- days: 이동 경로(dateOffset, stops[{{lat, lng}}])
- name_ko는 반드시 채운다.

[출력 형식 — 매우 중요]
- **최상위에 JSON 배열만** 반환한다. (객체 래퍼 금지, 예: {{"data": ...}} 금지)
- 자연어/코드블록/주석 절대 금지. 쌍따옴표만 사용. 후행 쉼표 금지.

[최종 JSON 스키마 — 배열]
[
  {{
    "city": "string",
    "country": "string",
    "reason": "string",
    "schedule": [
      {{
        "day": "string",
        "activities": [{{"time":"string","activity":"string"}}]
      }}
    ],
    "lodging": {{
      "areas": [
        {{
          "name_original": "string",
          "name_ko": "string",
          "lat": 0.0,
          "lng": 0.0,
          "why": "string",
          "budget_hint": "저예산|중간|상위"
        }}
      ],
      "hotels": [
        {{
          "name_original": "string",
          "name_ko": "string",
          "lat": 0.0,
          "lng": 0.0,
          "why": "string",
          "price_tier": "저예산|중간|상위",
          "booking_query": "string",
          "agoda_query": "string"
        }}
      ]
    }},
    "allPlaces": [
      {{"id":"string","name_original":"string","name_ko":"string","category":"string","lat":0.0,"lng":0.0}}
    ],
    "days": [
      {{"dateOffset":0,"stops":[{{"lat":0.0,"lng":0.0}}]}}
    ]
  }}
]
""".strip()
