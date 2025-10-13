# # app/services/prompt_builder.py
# import re
# from typing import Tuple


# def _extract_days(duration: str) -> int:
#     """
#     '2night 3days', '3 days', '3일', '1박 2일' 등에서 '일(day) 수'만 안전하게 추출.
#     실패 시 3일 기본값.
#     """
#     if not duration:
#         return 3
#     # ex) 3days, 3 day, 3-day
#     m = re.search(r'(\d+)\s*day', duration, flags=re.IGNORECASE)
#     if m:
#         try:
#             return max(1, int(m.group(1)))
#         except Exception:
#             pass
#     # ex) 1박 2일 → '2'
#     mk = re.search(r'(\d+)\s*일', duration)
#     if mk:
#         try:
#             return max(1, int(mk.group(1)))
#         except Exception:
#             pass
#     return 3


# def _window_to_bounds(
#     depart_window: str | None,
#     return_window: str | None,
# ) -> Tuple[str, str, str]:
#     """
#     출/귀국 시간대(새벽/오전/오후/저녁)에 따른 시간 제약을 텍스트로 반환.
#     - min_start: 1일차 첫 활동 '최소 시작 시각'(HH:MM)
#     - last_limit_desc: 마지막 날 종료 정책(설명형; 모델이 이해하도록 지시문)
#     - late_policy: 늦은 도착 시 1일차 처리 규칙(설명형)
#     """
#     dw = (depart_window or "").strip().lower()
#     rw = (return_window or "").strip().lower()

#     # 1일차 최소 시작 시각
#     if dw in ("dawn", "새벽"):
#         min_start = "09:00"
#     elif dw in ("morning", "오전"):
#         min_start = "13:00"
#     elif dw in ("afternoon", "오후"):
#         min_start = "17:00"
#     elif dw in ("evening", "저녁"):
#         min_start = "20:00"
#     else:
#         # 미지정이면 안전하게 오전 9시 이후
#         min_start = "09:00"

#     # 마지막 날 종료 정책(설명형)
#     if rw in ("dawn", "새벽"):
#         last_limit_desc = (
#             "마지막 날은 관광을 배치하지 않고, 전날 늦은 오후에 관광을 종료한다. "
#             "마지막 날은 공항 이동/체크인/출국 절차만 포함한다."
#         )
#     elif rw in ("morning", "오전"):
#         last_limit_desc = (
#             "마지막 날 08:00 이전 출발 준비를 완료해야 한다. "
#             "마지막 날에는 관광을 배치하지 않는다."
#         )
#     elif rw in ("afternoon", "오후"):
#         last_limit_desc = "마지막 날 12:30 이전에 모든 관광을 종료한다."
#     elif rw in ("evening", "저녁"):
#         last_limit_desc = "마지막 날 16:30 이전에 모든 관광을 종료한다."
#     else:
#         last_limit_desc = "마지막 날 16:30 이전에 모든 관광을 종료한다."

#     late_policy = (
#         "만약 1일차 최소 시작 시각이 20:00 이후라면, 본격 관광은 day_2 오전부터 시작하고 "
#         "day_1에는 '도착·체크인·근처 산책/야식'만 배치한다."
#     )
#     return min_start, last_limit_desc, late_policy


# def _pace_rule_text(density: str | None) -> str:
#     """
#     여행 템포(느긋/적당/활동적)에 따른 하루 활동 개수/블록 길이/정리 규칙.
#     """
#     d = (density or "").lower()
#     if "느긋" in d or "relax" in d:
#         return (
#             "하루 활동 2~3개, 각 블록 2~3시간, 카페/휴식 포함, "
#             "동선은 단순하게 유지한다."
#         )
#     if "활동" in d or "active" in d:
#         return (
#             "하루 활동 4~5개, 각 블록 1시간 내외, 동선 최적화로 이동 최소화, "
#             "체험/액티비티를 충분히 포함한다."
#         )
#     # default = 적당히
#     return (
#         "하루 활동 3~4개, 각 블록 1~2시간, 이동과 휴식의 균형을 유지한다."
#     )


# def _evening_rule_text(density: str | None) -> str:
#     """
#     모든 템포에서 '저녁까지 구성'을 강제하는 공통 규칙 + 템포별 종료 시간 권장.
#     """
#     d = (density or "").lower()
#     if "느긋" in d or "relax" in d:
#         return (
#             "일반일(day_2~day_{N-1})에는 반드시 '저녁 식사' 또는 '가벼운 야간 산책/노을 감상' 중 최소 1개를 포함하고, "
#             "하루 일정 종료는 보통 19:30~20:00 사이가 되도록 한다."
#         )
#     if "활동" in d or "active" in d:
#         return (
#             "일반일(day_2~day_{N-1})에는 반드시 '저녁 식사'와 '야경/야시장/전망대 등 야간 하이라이트' 중 최소 1개를 포함하고, "
#             "하루 일정 종료는 보통 20:30~21:00 사이가 되도록 한다."
#         )
#     # default = 적당히
#     return (
#         "일반일(day_2~day_{N-1})에는 '저녁 식사' 또는 '야경/야시장/전망대' 중 최소 1개를 포함하고, "
#         "하루 일정 종료는 보통 20:00~20:30 사이가 되도록 한다."
#     )


# def generate_prompt_from_survey(prefs) -> str:
#     """
#     Gemini 모델에 전달할 초정밀 프롬프트.
#     - JSON만 반환(설명/문장/코드블록 금지)
#     - 정확한 JSON 문법, 쌍따옴표만 사용, 후행 쉼표 금지
#     - 한국어만 사용
#     - 시간/템포/테마 가이드라인을 하드 룰로 제시
#     - 모든 템포에서 '저녁까지 구성'을 강제
#     """
#     # 방어적 접근(getattr)로 누락 필드 대비
#     days = _extract_days(getattr(prefs, "duration", "") or "")
#     styles = getattr(prefs, "style", [])
#     if not isinstance(styles, (list, tuple)):
#         styles = [styles] if styles else []

#     depart_window = getattr(prefs, "depart_window", "") or ""
#     return_window = getattr(prefs, "return_window", "") or ""
#     min_start, last_limit_desc, late_policy = _window_to_bounds(depart_window, return_window)
#     density = getattr(prefs, "density", "")
#     pace_rule = _pace_rule_text(density)
#     evening_rule = _evening_rule_text(density).replace("{N-1}", str(max(2, days - 1)))

#     companion = getattr(prefs, "companion", "")
#     driving   = getattr(prefs, "driving", "")
#     budget    = getattr(prefs, "budget", "")
#     climate   = getattr(prefs, "climate", "")
#     continent = getattr(prefs, "continent", "")

#     return f"""
# 당신은 전 세계를 여행한 경험이 풍부한 최고의 여행 컨설턴트입니다.
# 너는 한국어만 사용해야돼
# 아래 사용자의 선호를 반영하여 {days}일 일정에 적합한 세계 도시를 2~3곳 추천하고, 각 도시에 대해 '하루 단위 상세 일정'을 생성하세요.

# [사용자 선호 요약]
# - 동행자: {companion}
# - 여행 스타일(테마): {", ".join([str(s) for s in styles if s]) or "미지정"}
# - 이동수단: {driving}
# - 예산: {budget}
# - 선호 기후: {climate}
# - 선호 대륙: {continent}
# - 여행 템포(느긋/적당/활동적): {density or "미지정"}
# - 출국 시간대: {depart_window or "미지정"}  (새벽/오전/오후/저녁 중 하나)
# - 귀국 시간대: {return_window or "미지정"}  (새벽/오전/오후/저녁 중 하나)

# [절대 시간 규칙]
# - 1일차 첫 활동은 반드시 {min_start} 이후에 시작한다.
# - {late_policy}
# - 마지막 날 일정은 다음 정책을 반드시 지킨다: {last_limit_desc}

# [템포(여행 스타일) 규칙]
# - "{density or "적당히"}"에 따라 다음 기준을 적용한다: {pace_rule}

# [저녁 구성 규칙(모든 템포 공통)]
# - {evening_rule}
# - 동일 일자에서 60분을 초과하는 빈 시간(공백)을 만들지 말라.
# - 출/귀국 시간대 제약이 있는 첫날과 마지막 날에는 위 규칙을 상황에 맞게 완화하되, 안전한 귀국 동선을 보장하라.

# [일정 구성 가이드]
# - 각 날은 보통 3~5개의 활동(느긋: 2~3개, 적당: 3~4개, 활동적: 4~5개)으로 구성한다.
# - 각 활동은 "time"(HH:MM-HH:MM)과 "activity"(간결한 설명) 필드를 포함한다.
# - 이동수단은 괄호로 표기한다. 예: (지하철), (버스), (도보), (택시), (렌터카)
# - 하루 1회 '포토 스팟', 1회 '지역 음식/맛집', 1회 '문화/체험' 요소를 포함한다.
# - 마지막 날은 공항 이동/체크아웃/귀국 준비를 반영하여 과도한 관광을 배치하지 않는다.
# - 활동 설명에는 과장/광고 문구를 피하고, 명확하고 실행 가능한 표현만 사용한다.
# - 가능하면 동선을 최적화하고, 불필요한 왕복/이동을 최소화한다.

# [출력 형식에 대한 매우 엄격한 요구사항]
# - 반드시 **JSON만 반환**한다. 자연어 문장, 설명, 인사말, 마크다운 코드블록(예: ```json), 주석 등을 절대 포함하지 말라.
# - **정확한 JSON 문법**을 사용한다. 모든 키/문자열은 **쌍따옴표**로 감싼다. 작은따옴표(') 사용 금지.
# - **후행 쉼표(trailing comma) 금지**. 배열/객체 마지막 요소 뒤에 쉼표를 두지 말라.
# - 개행/탭/공백은 자유이나, 값 자체에는 제어문자(예: \\t, \\n)나 불필요한 백슬래시 이스케이프를 넣지 말라.
# - 스키마 외 **추가 필드 금지**. 요구 필드가 누락되어서도 안 된다.

# [최종 JSON 스키마]
# {{
#   "data": [
#     {{
#       "city": "string(도시 이름)",
#       "country": "string(국가 이름)",
#       "reason": "string(감성적인 추천 이유; 1~2문장, 과장 금지)",
#       "schedule": [
#         {{
#           "day": "string(예: day_1)",
#           "activities": [
#             {{
#               "time": "string(HH:MM-HH:MM)",
#               "activity": "string(활동 설명; 이동수단 괄호 표기)"
#             }}
#           ]
#         }}
#       ]
#     }}
#   ]
# }}

# [JSON 예시(형식 참고용; 값은 생성하시오)]
# {{
#   "data": [
#     {{
#       "city": "Kyoto",
#       "country": "Japan",
#       "reason": "전통 정취와 계절감을 고루 느낄 수 있는 도시로, 한적한 산책과 문화 체험에 적합합니다.",
#       "schedule": [
#         {{
#           "day": "day_1",
#           "activities": [
#             {{ "time": "{min_start}-18:00", "activity": "도착 · 체크인 · 근처 산책 (도보)" }},
#             {{ "time": "18:30-20:00", "activity": "현지 식당에서 저녁 식사 (도보)" }}
#           ]
#         }},
#         {{
#           "day": "day_2",
#           "activities": [
#             {{ "time": "09:00-10:00", "activity": "사찰 방문 및 포토 스팟 촬영 (지하철)" }},
#             {{ "time": "10:30-12:00", "activity": "전통 거리 산책 (도보)" }},
#             {{ "time": "12:00-13:00", "activity": "지역 가정식 점심 (도보)" }},
#             {{ "time": "14:00-15:30", "activity": "차 체험 또는 공예 클래스 (버스)" }},
#             {{ "time": "18:30-20:00", "activity": "저녁 식사 또는 야경 스팟 감상 (도보/지하철)" }}
#           ]
#         }}
#       ]
#     }}
#   ]
# }}
# """.strip()

# app/services/prompt_builder.py
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


def _window_to_bounds(depart_window: str | None, return_window: str | None) -> Tuple[str, str, str]:
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
        last_limit_desc = "마지막 날은 관광을 배치하지 않고, 전날 늦은 오후에 관광을 종료한다. 마지막 날은 공항 이동/체크인/출국 절차만 포함한다."
    elif rw in ("morning", "오전"):
        last_limit_desc = "마지막 날 08:00 이전 출발 준비를 완료해야 한다. 마지막 날에는 관광을 배치하지 않는다."
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


def _pace_rule_text(density: str | None) -> str:
    """여행 템포(느긋/적당/활동적)에 따른 하루 활동 개수/블록 길이."""
    d = (density or "").lower()
    if "느긋" in d or "relax" in d:
        return "하루 활동 2~3개, 각 블록 2~3시간, 카페/휴식 포함, 동선은 단순하게 유지한다."
    if "활동" in d or "active" in d:
        return "하루 활동 4~5개, 각 블록 1시간 내외, 동선 최적화로 이동 최소화, 체험/액티비티를 충분히 포함한다."
    return "하루 활동 3~4개, 각 블록 1~2시간, 이동과 휴식의 균형을 유지한다."


def _evening_rule_text(density: str | None) -> str:
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
# 메인 프롬프트 생성
# ───────────────────────────────────────────────
def generate_prompt_from_survey(prefs) -> str:
    """Gemini에 전달할 초정밀 프롬프트."""
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
    season = getattr(prefs, "season", None) or _month_to_season(travel_month)
    season_line = f"- 여행 시기: {str(travel_month)+'월' if travel_month else '미지정'} / 계절: {season or '미지정'}"
    season_rules = _season_rule_text(season)

    return f"""
당신은 전 세계를 여행한 경험이 풍부한 최고의 여행 컨설턴트입니다.
너는 한국어만 사용해야돼.
아래 사용자의 선호를 반영하여 {days}일 일정에 적합한 세계 도시를 2~3곳 추천하고, 각 도시에 대해 '하루 단위 상세 일정'과 '숙박 권역/호텔 추천'을 생성하세요.

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
- 식사 일정은 실제 존재하는 식당 이름 포함 (구글 평점 4.3↑).
- 출력 activity에는 반드시 `"저녁: Ramiro ★4.6 (해산물 레스토랑, 도보)"` 같은 형식을 사용한다.
- 마지막 날은 공항 이동/체크아웃/귀국 준비 반영.
- 동선을 최적화하고 불필요한 이동을 최소화한다.

[숙소 권역/호텔 추천 규칙]
- 각 도시에 'lodging.areas' 배열과 'lodging.hotels' 배열을 생성한다.
- areas: name_original, name_ko, lat, lng, why, budget_hint("저예산/중간/상위").
- hotels: 정확한 호텔명(name_original 필수, name_ko 가능), why(200자 이내), price_tier("저예산/중간/상위"), lat/lng(가능하면), booking_query 및 agoda_query(선택; 검색 친화 문자열).
- 교통/야간동선/식당 접근성/치안 고려. 과장 문구 금지, 사실 기반 간결 설명.

[지도/경로 정보]
- allPlaces: 장소 배열(id, name_original, name_ko, category, lat, lng)
- days: 이동 경로(dateOffset, stops[{{lat, lng}}])
- name_ko는 반드시 채운다.

[출력 형식]
- 반드시 JSON만 반환. 자연어/코드블록 금지. 쌍따옴표 사용, 후행 쉼표 금지.

[최종 JSON 스키마]
{{
  "data": [
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
}}
""".strip()
