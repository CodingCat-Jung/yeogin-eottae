from __future__ import annotations
from typing import Dict, Any, Optional, List, Tuple
import re, logging, os, requests, json, unicodedata
from math import radians, sin, cos, asin, sqrt

from app.utils.country_codes import to_region_code, languages_for

log = logging.getLogger("geo_enrich")
log.setLevel(logging.INFO)

# ─────────────────────────────────────────────────────────────
# 문자열/라벨 유틸
# ─────────────────────────────────────────────────────────────
SEPS = ["→","->","-","~","에서","로"," to "," at "," in "," 방문"," 감상"," 체험"," 식사"," 점심"," 저녁"]

_RX_HANGUL     = re.compile(r"[가-힣]")
_RX_LATIN      = re.compile(r"[A-Za-z]")
_RX_ARABIC     = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")
_RX_THAI       = re.compile(r"[\u0E00-\u0E7F]")
_RX_HIRAGANA   = re.compile(r"[\u3040-\u309F]")
_RX_KATAKANA   = re.compile(r"[\u30A0-\u30FF\u31F0-\u31FF]")
_RX_CYRILLIC   = re.compile(r"[\u0400-\u04FF]")
_RX_GREEK      = re.compile(r"[\u0370-\u03FF]")
_RX_HEBREW     = re.compile(r"[\u0590-\u05FF]")
_RX_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_RX_BENGALI    = re.compile(r"[\u0980-\u09FF]")

def _is_hangul_or_latin(s: str) -> bool:
    return bool(_RX_HANGUL.search(s or "") or _RX_LATIN.search(s or ""))

# ✅ 라틴 악센트(베트남어 등) 감지
_RX_LATIN_ACCENTED = re.compile(r"[À-ÖØ-öø-ÿ]")
def _has_accented_latin(s: str) -> bool:
    return bool(_RX_LATIN_ACCENTED.search(s or ""))

# ─────────────────────────────────────────────────────────────
# 간이 로마자(다국어)
# ─────────────────────────────────────────────────────────────
_AR_MAP = {
    "ا":"a","أ":"a","إ":"i","آ":"aa","ب":"b","ت":"t","ث":"th","ج":"j","ح":"h","خ":"kh","د":"d",
    "ذ":"dh","ر":"r","ز":"z","س":"s","ش":"sh","ص":"s","ض":"d","ط":"t","ظ":"z","ع":"a","غ":"gh",
    "ف":"f","ق":"q","ك":"k","ل":"l","م":"m","ن":"n","ه":"h","و":"w","ي":"y","ؤ":"u","ئ":"i","ة":"h",
    "ٓ":"", "ً":"", "ٌ":"", "ٍ":"", "َ":"", "ُ":"", "ِ":"", "ّ":"", "ْ":""
}
def _romanize_arabic(s: str) -> str:
    out=[]
    for ch in s:
        if ch in _AR_MAP: out.append(_AR_MAP[ch])
        elif ch.isspace(): out.append(" ")
        elif ord(ch) < 128: out.append(ch)
    return re.sub(r"\s+"," ","".join(out)).strip()

_TH_MAP = {
    "ก":"k","ข":"kh","ค":"kh","ฆ":"kh","ง":"ng","จ":"ch","ฉ":"ch","ช":"ch","ซ":"s","ฌ":"ch","ญ":"y",
    "ฎ":"d","ฏ":"t","ฐ":"th","ฑ":"th","ฒ":"th","ณ":"n","ด":"d","ต":"t","ถ":"th","ท":"th","ธ":"th","น":"n",
    "บ":"b","ป":"p","ผ":"ph","พ":"ph","ภ":"ph","ม":"m","ย":"y","ร":"r","ล":"l","ว":"w","ศ":"s","ษ":"s","ส":"s","ห":"h",
    "อ":"o","ฮ":"h",
    "ะ":"a","า":"a","ิ":"i","ี":"i","ุ":"u","ู":"u","เ":"e","แ":"ae","โ":"o","ใ":"ai","ไ":"ai","ำ":"am"
}
def _romanize_thai(s: str) -> str:
    out=[]
    for ch in s:
        if ch in _TH_MAP: out.append(_TH_MAP[ch])
        elif ch.isspace(): out.append(" ")
        elif ord(ch) < 128: out.append(ch)
    return re.sub(r"\s+"," ","".join(out)).strip()

_JP_MAP = {
 "あ":"a","い":"i","う":"u","え":"e","お":"o","か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
 "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so","た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
 "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no","は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
 "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo","や":"ya","ゆ":"yu","よ":"yo","ら":"ra","り":"ri",
 "る":"ru","れ":"re","ろ":"ro","わ":"wa","を":"o","ん":"n",
 "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go","ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
 "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do","ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
 "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po","ゃ":"ya","ゅ":"yu","ょ":"yo","っ":""
}
def _romanize_kana(s:str)->str:
    out=[]
    for ch in s:
        if ch in _JP_MAP: out.append(_JP_MAP[ch])
        else:
            code=ord(ch)
            if 0x30A0<=code<=0x30FF:
                out.append(_JP_MAP.get(chr(code-0x60),""))
            elif ch.isspace(): out.append(" ")
            elif ord(ch)<128: out.append(ch)
    return re.sub(r"\s+"," ","".join(out)).strip()

_CY_MAP = {**{k:k for k in ""}, **{
 "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"Yo","Ж":"Zh","З":"Z","И":"I","Й":"Y","К":"K",
 "Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"Kh","Ц":"Ts",
 "Ч":"Ch","Ш":"Sh","Щ":"Sch","Ъ":"","Ы":"Y","Ь":"","Э":"E","Ю":"Yu","Я":"Ya",
 "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k",
 "л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts",
 "ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"
}}
def _romanize_cyrillic(s:str)->str:
    return re.sub(r"\s+"," ","".join(_CY_MAP.get(ch," " if ch.isspace() else ch if ord(ch)<128 else "") for ch in s)).strip()

_GR_MAP = {
 "Α":"A","Β":"V","Γ":"G","Δ":"D","Ε":"E","Ζ":"Z","Η":"I","Θ":"Th","Ι":"I","Κ":"K","Λ":"L","Μ":"M","Ν":"N","Ξ":"X","Ο":"O","Π":"P",
 "Ρ":"R","Σ":"S","Τ":"T","Υ":"Y","Φ":"F","Χ":"Ch","Ψ":"Ps","Ω":"O",
 "α":"a","β":"v","γ":"g","δ":"d","ε":"e","ζ":"z","η":"i","θ":"th","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"x","ο":"o","π":"p",
 "ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","φ":"f","χ":"ch","ψ":"ps","ω":"o"
}
def _romanize_greek(s:str)->str:
    return re.sub(r"\s+"," ","".join(_GR_MAP.get(ch," " if ch.isspace() else ch if ord(ch)<128 else "") for ch in s)).strip()

def _strip_accents_latinlike(s: str) -> str:
    s_norm = unicodedata.normalize("NFD", s)
    s_ascii = "".join(ch for ch in s_norm if unicodedata.category(ch) != "Mn")
    s_ascii = re.sub(r"[^0-9A-Za-z\s.,\-_/]", " ", s_ascii)
    return re.sub(r"\s+"," ",s_ascii).strip()

def _romanize_fallback(s: str) -> str:
    if not s: return ""
    if _is_hangul_or_latin(s):  # 이미 읽힘
        return s
    if _RX_ARABIC.search(s):     return _romanize_arabic(s)
    if _RX_THAI.search(s):       return _romanize_thai(s)
    if _RX_HIRAGANA.search(s) or _RX_KATAKANA.search(s): return _romanize_kana(s)
    if _RX_CYRILLIC.search(s):   return _romanize_cyrillic(s)
    if _RX_GREEK.search(s):      return _romanize_greek(s)
    if any('\u00C0' <= ch <= '\u024F' for ch in s):  # 베트남어 포함
        return _strip_accents_latinlike(s)
    s2 = _strip_accents_latinlike(s)
    return s2 or "Unknown"

# ─────────────────────────────────────────────────────────────
# 교통 괄호(도보/BTS/버스 등)만 검색에서 제거
# ─────────────────────────────────────────────────────────────
TRANSPORT_TERMS = [
    # ko
    "도보","지하철","전철","기차","버스","택시","셔틀","보트","배","수상버스","트램","모노레일",
    "BTS","MRT","ARL","스카이트레인","시티링크","푸드코트",
    # en
    "on foot","by foot","walk","walking","subway","metro","train","bus","taxi","cab","tram","monorail",
    "boat","ferry","shuttle","ride[- ]?hailing","uber","grab","food court",
    # th
    "รถไฟฟ้า","บีทีเอส","เอ็มอาร์ที","แอร์พอร์ท เรล ลิงก์","แท็กซี่","มอเตอร์ไซค์","ตุ๊กตุ๊ก",
    # vi
    "xe ôm","grab bike","grabcar","xe máy","xe buyt",
    # jp
    "徒歩","地下鉄","電車","モノレール","バス","タクシー",
]
_RE_PAREN_TRANSPORT = re.compile(
    r"\((?:\s*(?:%s)[^)]*)\)" % "|".join(TRANSPORT_TERMS),
    re.IGNORECASE
)
def _strip_transport_parentheses(s: str) -> str:
    out = _RE_PAREN_TRANSPORT.sub("", s or "")
    return re.sub(r"\s{2,}", " ", out).strip()

def _pick_place_phrase(activity: str) -> str:
    s = activity or ""
    # 따옴표 우선
    m = re.search(r"[\"'“”‘’]([^\"'“”‘’]+)[\"'“”‘’]", s)
    if m: s = m.group(1)

    # ✅ 교통 괄호만 제거(표시는 유지, 검색만 정리)
    s = _strip_transport_parentheses(s)

    # 나머지 괄호류 정리
    s = re.sub(r"\(.*?\)|\[.*?\]|【.*?】", "", s)

    # 분리어 처리
    for sep in SEPS:
        if sep in s:
            parts = [p.strip() for p in s.split(sep) if p.strip()]
            if parts: s = parts[-1]

    # 불용어 정리
    s = re.sub(r"(추천|명물|맛집|현지|근처|대표|포토\s*스팟|야경\s*스팟|전망대|쇼핑|산책|휴식|박물관|미술관|시장|백화점|공원|역|정류장|도보|버스|지하철|기차|택시|렌터카|공항|체크인)", "", s)
    s = re.sub(r"(에서|으로|로|에|에게|에서\s*식사|에서\s*감상)$", "", s).strip()
    return s if len(s) >= 2 else (activity or "").strip()

def _uniq_key(p: Dict[str, Any]) -> str:
    return f"{p.get('name_original','')}|{p.get('lat')}|{p.get('lng')}"

def _looks_food(activity: str) -> bool:
    return bool(re.search(r"(라멘|스시|초밥|수프카레|카레|징기스칸|양고기|식당|맛집|ramen|sushi|curry)", activity, re.I))

def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2): return None
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlng/2)**2
    return 2 * R * asin(sqrt(a))

def _has_ko_or_en_label(p: dict) -> bool:
    s = ((p.get("name_ko") or "") + (p.get("name_en") or "") +
         (p.get("display_name") or "") + (p.get("name_original") or ""))
    return _is_hangul_or_latin(s)

# 체크인/아웃/호텔/복귀/조식 등
_RE_CHECK = re.compile(r"(체크\s*인|체크\s*아웃|체크인|체크아웃|check-?\s*in|check-?\s*out)", re.I)
_RE_HOTEL_RETURN = re.compile(
    r"(숙소|호텔)\s*(복귀|돌아가|돌아오|귀환|이동|로\s*이동|로\s*돌아|로\s*귀가)|"
    r"(return|back\s*to|go\s*back)\s*(the\s*)?(hotel|accommodation)", re.I)
_RE_HOTEL_REST = re.compile(r"(숙소|호텔).*(휴식|수면|쉼|rest|sleep|nap|break)", re.I)

# ✅ 호텔 문맥(조식/짐정리/로비/스파/수영장 등) → 전부 대표 호텔로 스냅
_RE_HOTEL_CONTEXT = re.compile(
    r"(숙소|호텔|hotel).*(조식|아침|브렉퍼스트|breakfast|뷔페|짐|정리|packing|pack|로비|reception|lobby|"
    r"체크아웃\s*준비|수영장|pool|스파|spa|사우나|sauna|라운지|lounge|객실|room|휴식|rest|sleep|nap)",
    re.I
)

def _looks_hotel_return_or_rest(s: str) -> bool:
    s = s or ""
    return bool(_RE_HOTEL_RETURN.search(s) or _RE_HOTEL_REST.search(s))

def _looks_checkinout(s: str) -> bool:
    return bool(_RE_CHECK.search(s or ""))

def _looks_hotel_context(s: str) -> bool:
    return bool(_RE_HOTEL_CONTEXT.search(s or ""))

# 공항 이동 감지
_RE_AIRPORT_MOVE = re.compile(r"(공항|airport)\s*.*(이동|가기|transfer|to)|(이동|transfer)\s*.*(공항|airport)", re.I)
def _looks_airport_move(s: str) -> bool:
    return bool(_RE_AIRPORT_MOVE.search(s or ""))

def _distance_m(a: dict | None, b: dict | None) -> float | None:
    if not a or not b or a.get("lat") is None or a.get("lng") is None or b.get("lat") is None or b.get("lng") is None:
        return None
    d = _haversine_km(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
    return None if d is None else d * 1000

# 표시 라벨
def _ensure_display_name(p: dict) -> dict:
    ko = (p.get("name_ko") or "").strip()
    en = (p.get("name_en") or "").strip()
    orig = (p.get("name_original") or p.get("name") or "").strip()
    disp = None
    if ko and _is_hangul_or_latin(ko):
        disp = ko
    elif en and _RX_LATIN.search(en):
        disp = en
    elif orig and _is_hangul_or_latin(orig):
        # ✅ 원문에 라틴 악센트가 있으면 악센트 제거본으로 표시
        disp = _strip_accents_latinlike(orig) if _has_accented_latin(orig) else orig
    elif orig and _RX_ARABIC.search(orig):
        disp = _romanize_arabic(orig)
    else:
        disp = _romanize_fallback(orig)
    p["display_name"] = (disp or "").strip() or (orig or p.get("id") or "Unknown POI")
    return p

# 공항 중복 허용 + 추가 유틸
def _is_airport_place(p: dict) -> bool:
    namebag = f"{p.get('display_name','')} {p.get('name_original','')}".lower()
    cat = (p.get('category') or '').lower()
    return ("airport" in namebag) or ("공항" in namebag) or ("airport" in cat)

def _append_place(all_places: list[dict], seen: set[str], place: dict, *, front: bool = False) -> None:
    key = _uniq_key(place)
    if _is_airport_place(place):
        if key in seen:
            place = dict(place)
            place["lat"] = float(place["lat"]) + 0.00018
            place["lng"] = float(place["lng"]) + 0.00018
        if front: all_places.insert(0, place)
        else:     all_places.append(place)
        return
    if key not in seen:
        seen.add(key)
        if front: all_places.insert(0, place)
        else:     all_places.append(place)

# Places
PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"

def _map_to_schema(p: dict, lang: str | None = None) -> dict:
    name = p.get("displayName", {}).get("text") or ""
    loc = p.get("location", {}) or {}
    out = {
        "id": p.get("id") or name,
        "name_original": name,
        "name_ko": None,
        "name_en": None,
        "category": (p.get("types") or [None])[0],
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "rating": p.get("rating"),
        "address": p.get("formattedAddress"),
    }
    lang = (lang or "").lower()
    if lang.startswith("ko"): out["name_ko"] = name
    elif lang.startswith("en"): out["name_en"] = name
    return _ensure_display_name(out)

def _mk_body(query, language, region, location_bias, types, strict, radius_m=25000):
    body: dict = {"textQuery": query, "languageCode": language or "ko"}
    if region: body["regionCode"] = region
    if location_bias and all(k in location_bias for k in ("latitude","longitude")):
        r = max(1000, min(int(radius_m), 50000))
        body["locationBias"] = {"circle": {"center": {"latitude": float(location_bias["latitude"]),
                                                      "longitude": float(location_bias["longitude"])},
                                           "radius": r}}
    if types:
        body["includedType"] = types[0]
        if strict: body["strictTypeFiltering"] = True
    return body

def _post(body):
    headers = {
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating",
        "Content-Type": "application/json",
    }
    r = requests.post(PLACES_URL, headers=headers, json=body, timeout=6)
    if r.status_code >= 400:
        try: err = r.json()
        except Exception: err = r.text
        raise requests.HTTPError(f"{r.status_code} {r.reason} – body={json.dumps(body, ensure_ascii=False)} / resp={err}", response=r)
    js = r.json()
    places = js.get("places") or []
    return places[0] if places else None

def _search_with_fallbacks(query, *, language, region, location_bias, types):
    trials = [
        _mk_body(query, language, region, location_bias, types, True, 25000),
        _mk_body(query, language, region, location_bias, types, False, 25000),
        _mk_body(query, language, region, location_bias, types, False, 40000),
        _mk_body(query, language, region, location_bias, None,  False, 40000),
        _mk_body(query, language, region, None,        None,  False, 0),
    ]
    last_err = None
    for body in trials:
        try:
            hit = _post(body)
            if hit: return hit
        except requests.HTTPError as e:
            last_err = e; continue
        except Exception as e:
            last_err = e; continue
    if last_err: raise last_err
    return None

def _search_top1_multilang(query: str, languages: List[str], region: Optional[str], location_bias: Optional[dict], types: Optional[List[str]]) -> Tuple[Optional[dict], Optional[str]]:
    for lang in languages:
        hit = _search_with_fallbacks(query, language=lang, region=region, location_bias=location_bias, types=types)
        if hit: return hit, lang
    return None, None

def search_text_top1(query: str, language: str = "ko", region: str | None = None, location_bias: dict | None = None, types: list[str] | None = None, strict: bool = True):
    hit_ko = _search_with_fallbacks(query, language=language or "ko", region=region, location_bias=location_bias, types=types)
    if not hit_ko: return None
    data = _map_to_schema(hit_ko, language)

    # ✅ 영어 라벨 재조회 조건에 '라틴 악센트' 포함
    orig = data.get("name_original") or ""
    needs_en = (not _is_hangul_or_latin(orig)) or _RX_ARABIC.search(orig) or _has_accented_latin(orig)

    if needs_en:
        try:
            hit_en = _search_with_fallbacks(query, language="en", region=region, location_bias=location_bias, types=types)
            if hit_en:
                data_en = _map_to_schema(hit_en, "en")
                if data_en.get("name_en"):
                    data["name_en"] = data_en["name_en"]
                    if not data.get("name_ko") or not _is_hangul_or_latin(data["name_ko"]):
                        data["display_name"] = data_en["name_en"]
        except Exception:
            pass
    return _ensure_display_name(data)

# 공항 찾기
def _find_airport_place(city: str, country: str, langs: List[str], region_code: Optional[str], loc_bias: Optional[dict]) -> Optional[dict]:
    queries = [f"{city} International Airport", f"{city} Airport", f"{city} 공항", f"{city}, {country} Airport"]
    for lang in langs:
        for q in queries:
            try:
                hit = _search_with_fallbacks(q, language=lang, region=region_code, location_bias=loc_bias, types=["airport"])
                if hit: return _map_to_schema(hit, lang)
            except Exception:
                continue
    try:
        hit = _search_with_fallbacks(f"{city} Airport", language="en", region=region_code, location_bias=loc_bias, types=["airport"])
        if hit: return _map_to_schema(hit, "en")
    except Exception:
        pass
    return None

# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────
async def enrich_one_recommendation(rec: dict, collect_debug: bool = False):
    city = (rec.get("city") or "").strip()
    country = (rec.get("country") or "").strip()
    region_code = to_region_code(country)
    schedule: dict = rec.get("schedule") or {}

    all_places: list[dict] = []
    seen: set[str] = set()
    days: list[dict] = []

    # 도시 중심
    city_query = f"{city}, {country}".strip(", ")
    langs = languages_for(region_code)
    city_center = None

    hit, lang_used = _search_top1_multilang(city_query, langs, region_code, None, None)
    if hit: city_center = _map_to_schema(hit, lang_used)
    else:
        hit2, lang_used2 = _search_top1_multilang(city_query, langs, None, None, None)
        if hit2: city_center = _map_to_schema(hit2, lang_used2)

    loc_bias = {"latitude": city_center["lat"], "longitude": city_center["lng"]} if city_center else None

    # 대표 호텔
    primary_hotel: Optional[dict] = None
    lodg = rec.get("lodging") or {}
    hotels = lodg.get("hotels") or []
    if isinstance(hotels, list) and hotels:
        primary_hotel = dict(hotels[0])
        if primary_hotel.get("lat") is None or primary_hotel.get("lng") is None:
            q = (primary_hotel.get("name_ko") or primary_hotel.get("name_original") or primary_hotel.get("display_name") or "").strip()
            if q:
                try:
                    hit_h = _search_with_fallbacks(f"{q}, {city}, {country}", language=(langs[0] if langs else "en"),
                                                   region=region_code, location_bias=loc_bias, types=["lodging"])
                    if hit_h:
                        mapped = _map_to_schema(hit_h, "en")
                        primary_hotel["lat"], primary_hotel["lng"] = mapped["lat"], mapped["lng"]
                except Exception:
                    pass
        _ensure_display_name(primary_hotel)

    # 1일차 공항
    airport_place = _find_airport_place(city, country, langs, region_code, loc_bias)

    # 일정 정렬
    def day_order(k: str) -> int:
        m = re.search(r"(\d+)", k or "")
        return int(m.group(1)) if m else 9999
    items = sorted(schedule.items(), key=lambda kv: day_order(kv[0]))

    DIST_STEPS = [60, 100, 200]  # km
    used_dist_limit = DIST_STEPS[0]

    for idx, (_day_key, acts) in enumerate(items):
        if not isinstance(acts, list): continue
        day_stops: list[dict] = []

        # 1일차: 공항을 항상 첫 좌표로
        if idx == 0 and airport_place and airport_place.get("lat") and airport_place.get("lng"):
            _append_place(all_places, seen, _ensure_display_name(dict(airport_place)), front=True)
            day_stops.append({"lat": airport_place["lat"], "lng": airport_place["lng"]})

        for a in acts:
            raw = str(a.get("activity", ""))

            if _looks_airport_move(raw):
                place = airport_place or city_center
                if not place: continue
                place = _ensure_display_name(place)

            elif primary_hotel and (_looks_checkinout(raw) or _looks_hotel_return_or_rest(raw) or _looks_hotel_context(raw)):
                # ✅ 어떤 호텔 관련 문구도 전부 대표 호텔로 스냅
                place = _ensure_display_name(dict(primary_hotel))

            else:
                # 일반 POI
                m = re.search(r"[\"'“”‘’(（]([^\"'“”‘’()（）]+)[\"'”’)）]", raw)
                precise = m.group(1).strip() if m else None
                base_phrase = _pick_place_phrase(raw)
                base_query = f"{base_phrase}, {city}, {country}".strip(", ")
                precise_query = f"{precise}, {city}, {country}".strip(", ") if precise else None
                types = ["restaurant"] if _looks_food(raw) else None
                place = None
                for lang in langs:
                    if precise_query and not place:
                        phit = _search_with_fallbacks(precise_query, language=lang, region=region_code, location_bias=loc_bias, types=types)
                        if phit: place = _map_to_schema(phit, lang)
                    if not place:
                        phit = _search_with_fallbacks(base_query, language=lang, region=region_code, location_bias=loc_bias, types=types)
                        if phit: place = _map_to_schema(phit, lang)
                    if place: break
                if not place:
                    for lang in langs:
                        if precise_query and not place:
                            phit = _search_with_fallbacks(precise_query, language=lang, region=None, location_bias=loc_bias, types=types)
                            if phit: place = _map_to_schema(phit, lang)
                        if not place:
                            phit = _search_with_fallbacks(base_query, language=lang, region=None, location_bias=loc_bias, types=types)
                            if phit: place = _map_to_schema(phit, lang)
                        if place: break
                if not place and city_center: place = dict(city_center)

            if not place or place.get("lat") is None or place.get("lng") is None:
                continue

            if city_center:
                dist = _haversine_km(city_center["lat"], city_center["lng"], place["lat"], place["lng"])
                if dist is not None and dist > used_dist_limit:
                    continue

            if not _has_ko_or_en_label(place):
                try:
                    phit_en = _search_with_fallbacks(f"{place.get('name_original') or ''}, {city}, {country}", language="en",
                                                     region=region_code, location_bias=loc_bias, types=None)
                    if phit_en:
                        p_en = _map_to_schema(phit_en, "en")
                        if p_en.get("name_en"):
                            place["name_en"] = p_en["name_en"]
                            if not place.get("name_ko") or not _is_hangul_or_latin(place["name_ko"]):
                                place["display_name"] = p_en["name_en"]
                except Exception:
                    pass

            place = _ensure_display_name(place)
            _append_place(all_places, seen, place)
            day_stops.append({"lat": place["lat"], "lng": place["lng"]})

        if day_stops:
            days.append({"dateOffset": idx, "stops": day_stops})

    # 대표 호텔 보장 + 다른 호텔 강력 제거
    if primary_hotel:
        _ensure_display_name(primary_hotel)
        if primary_hotel.get("lat") and primary_hotel.get("lng"):
            _append_place(all_places, seen, dict(primary_hotel), front=True)

        cleaned: list[dict] = []
        for p in all_places:
            cat = (p.get("category") or "").lower()
            namebag = (p.get("name_original") or "") + (p.get("display_name") or "")
            looks_hotel = "hotel" in cat or re.search(r"(hotel|hostel|inn|resort|게스트하우스|호텔)", namebag, re.I)
            if looks_hotel:
                # ✅ 대표 호텔과 60m 이내가 아니면 전부 제거,
                #    60m 이내라도 대표 호텔이 아닌 것은 버린다(대표만 유지)
                dm = _distance_m(p, primary_hotel)
                if dm is None or dm > 60:
                    continue
                if (p.get("lat") != primary_hotel.get("lat")) or (p.get("lng") != primary_hotel.get("lng")):
                    continue
            cleaned.append(p)
        all_places = cleaned

    # 호텔 카드 라벨 보강
    hotels = (rec.get("lodging") or {}).get("hotels") or []
    if isinstance(hotels, list) and hotels:
        for h in hotels:
            if isinstance(h, dict):
                h.setdefault("name_original", h.get("name_ko") or h.get("name") or "")
                _ensure_display_name(h)

    rec["allPlaces"] = all_places
    rec["days"] = days
    return rec
