import os, requests, json, re

PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"

_RX_HANGUL = re.compile(r"[가-힣]")
_RX_LATIN  = re.compile(r"[A-Za-z]")

def _is_hangul_or_latin(s: str) -> bool:
    return bool(_RX_HANGUL.search(s) or _RX_LATIN.search(s))

def _map_to_schema(p: dict) -> dict:
    name = p.get("displayName", {}).get("text") or ""
    loc = p.get("location", {}) or {}
    return {
        "id": p.get("id") or name,
        "name_original": name,   # 요청 언어 기준 이름
        "name_ko": name,         # ko로 요청했을 때는 ko가 들어오고, 그 외 언어면 원문이 들어옴
        "name_en": None,         # ← 영어명 보강용 필드 (후처리에서 채움)
        "category": (p.get("types") or [None])[0],
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "rating": p.get("rating"),
        "address": p.get("formattedAddress"),
    }

def _mk_body(query, language, region, location_bias, types, strict, radius_m=25000):
    body: dict = {
        "textQuery": query,
        "languageCode": language or "ko",
    }
    if region:
        body["regionCode"] = region
    if location_bias and all(k in location_bias for k in ("latitude","longitude")):
        # 반경은 1km~50km 사이로 클램프
        r = max(1000, min(int(radius_m), 50000))
        body["locationBias"] = {
            "circle": {"center": {"latitude": float(location_bias["latitude"]),
                                  "longitude": float(location_bias["longitude"])},
                       "radius": r}
        }
    if types:
        body["includedTypes"] = list(types)
        if strict:
            body["strictTypeFiltering"] = True
    return body

def _post(body):
    headers = {
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating",
        "Content-Type": "application/json",
    }
    r = requests.post(PLACES_URL, headers=headers, json=body, timeout=6)
    # 4xx일 때 디버깅용 메시지 출력
    if r.status_code >= 400:
        try:
            err = r.json()
        except Exception:
            err = r.text
        raise requests.HTTPError(f"{r.status_code} {r.reason} – body={json.dumps(body, ensure_ascii=False)} / resp={err}", response=r)
    js = r.json()
    places = js.get("places") or []
    return places[0] if places else None

def _search_with_fallbacks(query, *, language, region, location_bias, types):
    """
    언어별로 동일한 완화 단계(trials)를 적용해 1개 결과를 찾는다.
    """
    trials = [
        _mk_body(query, language, region, location_bias, types, True, 25000),   # strict + bias 25km
        _mk_body(query, language, region, location_bias, types, False, 25000),  # strict 해제
        _mk_body(query, language, region, location_bias, types, False, 40000),  # 반경 40km
        _mk_body(query, language, region, location_bias, None,  False, 40000),  # types 제거
        _mk_body(query, language, region, None,        None,  False, 0),        # bias 제거(전역)
    ]
    last_err = None
    for body in trials:
        try:
            hit = _post(body)
            if hit:
                return hit
        except requests.HTTPError as e:
            last_err = e
            continue
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    return None

def search_text_top1(
    query: str,
    language: str = "ko",
    region: str | None = None,
    location_bias: dict | None = None,
    types: list[str] | None = None,
    strict: bool = True,  # NOTE: 개별 trial 생성 시 사용되므로 서명만 유지
):
    """
    Google Places v1 Text Search → 상위 1개 결과 반환.
    1) ko로 검색(완화 단계 적용)
    2) 결과명이 한글/영문이 아니면 en으로 재조회하여 name_en 보강
    """
    # 1) ko(또는 요청 언어)로 검색
    hit_ko = _search_with_fallbacks(
        query,
        language=language or "ko",
        region=region,
        location_bias=location_bias,
        types=types,
    )
    if not hit_ko:
        return None

    data = _map_to_schema(hit_ko)

    # 2) 한국어/영문이 아닌 스크립트(키릴/아랍 등)로만 나온 경우 영어명 보강 시도
    if not _is_hangul_or_latin(data.get("name_original") or ""):
        try:
            hit_en = _search_with_fallbacks(
                query,
                language="en",
                region=region,
                location_bias=location_bias,
                types=types,
            )
            if hit_en:
                name_en = (hit_en.get("displayName") or {}).get("text") or ""
                if name_en and _RX_LATIN.search(name_en):
                    data["name_en"] = name_en
        except Exception:
            # 영어 조회 실패해도 ko 결과는 그대로 반환
            pass

    return data
