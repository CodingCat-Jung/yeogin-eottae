# app/services/prompt_builder.py
import re
import json
from typing import Tuple, Optional


# 기본 유틸

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



# 월/계절 가이드

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



# 예산 파싱 유틸 (속도 영향 0)

def _parse_budget_krw(budget: str | int | None) -> int:
    """'₩100,000', '100000', '10만', '100k' 등의 입력을 KRW 정수로 파싱."""
    if budget is None:
        return 0
    if isinstance(budget, int):
        return budget
    s = str(budget).lower().replace(",", "").replace("₩", "").replace("원", "").strip()
    if "만" in s:
        try:
            n = float(s.split("만")[0])
            return int(n * 10000)
        except Exception:
            pass
    if s.endswith("k"):
        try:
            return int(float(s[:-1]) * 1000)
        except Exception:
            pass
    digits = "".join(ch for ch in s if ch.isdigit())
    return int(digits) if digits else 0


def _days_from_duration(duration: str | None) -> int:
    if not duration:
        return 3
    d = str(duration).lower()
    for k, v in (("1박2일", 2), ("2박3일", 3), ("3박4일", 4), ("4박5일", 5)):
        if k in d:
            return v
    m = re.search(r"(\d+)\s*일", d)
    return max(1, int(m.group(1))) if m else 3



# 메인 프롬프트 생성 (개수 중립)

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

    city = getattr(prefs, "city", "")
    country = getattr(prefs, "country", "")

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

    # ── 예산 제약 블록 ─────────────────────────
    budget_krw = _parse_budget_krw(budget)
    days_hint = _days_from_duration(getattr(prefs, "duration", None))
    per_day_hint = (budget_krw // max(1, days_hint)) if budget_krw > 0 else 0

    budget_block = f"""
[예산 제약 — 매우 중요, 위반 금지]
- 총 여행 예산(항공권/비자/보험 제외; 현지 숙박/식비/교통/입장료 중심): **{budget_krw} KRW**.
- 가능하면 1일 기준 예산 가이드(참고치): **~{per_day_hint} KRW/일**을 넘기지 않는다.
- 예산을 초과할 것 같으면 우선순위로 다음을 적용한다:
  1) 무료/저가 명소 위주로 재구성(공원/시장/거리 산책/전망 포인트 등)
  2) 유료 체험·고가 레스토랑 제외 또는 동일 카테고리의 저가 대안으로 교체
  3) 도보/대중교통 위주 이동
  4) 숙소는 게스트하우스/호스텔/예산형 구역 제안(구역명만 제시해도 됨)
- 💡 **예산이 터무니없이 부족한 경우**:
  - "예산이 부족합니다. 최소 비용 기준으로 구성합니다." 라는 안내 문장을 포함하고,
  - 가능한 한 최소 일정(대표 명소 1~2곳 + 간단한 식사/숙소)만 제시한다.
  - 이 경우 meta.budget.ok=false 와 meta.budget.minRequiredKRW를 반드시 포함한다.
""".strip()

    # (선택) 가성비 모드 힌트 (_frugal_mode가 서버에서 넘어올 수 있음)
    if getattr(prefs, "_frugal_mode", False):
        budget_block += """
- [가성비 모드] 유료 입장 최소화, 무료 명소/산책/전통 시장/전망 포인트 위주. 식사는 현지 저가/캐주얼 위주.
""".rstrip()

    # ── 본문 프롬프트(기존) ────────────────────────────────
    base_prompt = f"""
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
- **1일차 맨 앞에는 무조건** `"공항 도착 → 시내 이동 → 숙소 체크인/짐 풀기"` 블록을 포함한다.
- 활동 필드: "time"(HH:MM-HH:MM), "activity"(설명)
- 이동수단 괄호 표기 예: (도보), (지하철), (버스), (택시), (렌터카)
- 하루 1회 포토 스팟 / 1회 음식점 / 1회 문화 체험 포함.
- 식사 일정은 실제 존재하는 식당 이름 포함 (구글 평점 4.3↑) 자신 없으면 '카테고리형'으로 표기해도 된다.
- 출력 activity에는 반드시 `"저녁: Ramiro ★4.6 (해산물 레스토랑, 도보)"` 같은 형식을 사용한다.
- 동선을 최적화하고 불필요한 이동을 최소화한다.

[공항 포함 규칙 — 매우 중요]
- "공항 도착", "공항 이동", "출국", "귀국" 등 공항 관련 문장이 일정에 포함되어 있다면,
  **반드시 allPlaces 배열에 해당 공항 정보를 포함해야 한다.**
- 공항 이름 지정 우선순위:
  1) "{city} International Airport"
  2) "{country} 주요 공항"
  3) 일반 표현: "지역 공항" (좌표 생략 가능)
- category는 반드시 "airport"로 설정하고, name_original, name_ko 모두 포함해야 한다.
- **반드시 공항은 항상 1일차의 stops[0], 마지막 날의 stops[-1]에 위치해야 한다**.
- 예시:
  {{"id":"vienna_airport","name_original":"Vienna International Airport","name_ko":"비엔나 국제공항","category":"airport","lat":48.1159,"lng":16.5697}}



[숙소 권역/호텔 추천 규칙]
- 각 도시에 'lodging.areas' 배열과 'lodging.hotels' 배열을 생성한다.
- 'lodging.hotels'에는 실제 검색 가능한 '정확한 호텔명'을 1개 이상 포함하라. 자신 없으면 비워둔다(모호 표현 금지).
- areas: name_original, name_ko, lat, lng, why, budget_hint("저예산/중간/상위").
- hotels: name_original(필수, 실제 검색 가능한 정확한 호텔명), name_ko(가능), why(200자 이내),
  price_tier("저예산/중간/상위"), lat(가능), lng(가능), booking_query·agoda_query(선택).
  좌표는 **가능하면 포함**하되, 불확실하면 생략해도 된다. (좌표는 후처리에서 보완됨)
- 카테고리 표준: 숙박 구역은 "숙박", 개별 호텔은 "호텔".


[지도/경로 정보]
- allPlaces: 장소 배열(id, name_original, name_ko, category, lat, lng)
- days: 이동 경로(dateOffset, stops[{{lat, lng}}])
- name_ko는 반드시 채운다.
""".strip()

    # ── 출력 형식 보강: meta.budget 선택적 포함 ──────────
    output_block = f"""
[출력 형식 — 매우 중요]
- **최상위에 JSON 배열만** 반환한다. (객체 래퍼 금지, 예: {{"data": ...}} 금지)
- 자연어/코드블록/주석 절대 금지. 쌍따옴표만 사용. 후행 쉼표 금지.
- 각 추천 객체는 기존 스키마를 유지하되, **선택적으로** "meta.budget"을 포함해도 된다.
- "meta.budget" 예시:
{{
  "meta": {{
    "budget": {{
      "ok": true,
      "estimatedTotalKRW": {max(0, budget_krw - 15000)},
      "perDayKRW": {per_day_hint if per_day_hint else 0},
      "breakdown": {{"lodging": 45000, "meals": 30000, "transport": 8000, "activities": 15000}},
      "notes": ["무료 명소 위주 구성", "저가 식사 중심"]
    }}
  }}
}}
- 숫자는 대략치여도 되며, **총합이 {budget_krw} KRW를 넘지 않도록** 조정한다.
""".strip()

    # ── 최종 JSON 스키마(기존) ───────────────────────────────
    schema_block = """
[최종 JSON 스키마 — 배열]
[
  {
    "city": "string",
    "country": "string",
    "reason": "string",
    "schedule": [
      {
        "day": "string",
        "activities": [{"time":"string","activity":"string"}]
      }
    ],
    "lodging": {
      "areas": [
        {
          "name_original": "string",
          "name_ko": "string",
          "lat": 0.0,
          "lng": 0.0,
          "why": "string",
          "budget_hint": "저예산|중간|상위"
        }
      ],
      "hotels": [
        {
          "name_original": "string",
          "name_ko": "string",
          "lat": 0.0,
          "lng": 0.0,
          "why": "string",
          "price_tier": "저예산|중간|상위",
          "booking_query": "string",
          "agoda_query": "string"
        }
      ]
    },
    "allPlaces": [
      {"id":"string","name_original":"string","name_ko":"string","category":"string","lat":0.0,"lng":0.0}
    ],
    "days": [
      {"dateOffset":0,"stops":[{"lat":0.0,"lng":0.0}]}
    ]
  }
]
""".strip()

    # 사용자 선호 JSON(모델 참고용)
    user_json = json.dumps(getattr(prefs, "__dict__", {}), ensure_ascii=False)

    # ── 최종 프롬프트 조립 ────────────────────────────────────
    return (
        f"{base_prompt}\n\n"
        f"{budget_block}\n\n"
        f"{output_block}\n\n"
        f"{schema_block}\n\n"
        f"[사용자 선호(원본 JSON)] {user_json}"
    )
