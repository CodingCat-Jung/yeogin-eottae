# app/services/geo_enrich.py
# 목적: 일정(activity) 텍스트를 실제 지도 좌표(구글 플레이스)로 매칭해
#       allPlaces / days / placesByDay 형태로 반환한다.
#       (도시 중심/대표 호텔/공항/일반 장소 검색 + 좌표 실패 시 지터 처리)

from __future__ import annotations
from typing import Dict, Any, Optional, List, Tuple
import re, logging, os, requests, json, unicodedata
from math import radians, sin, cos, asin, sqrt
from functools import lru_cache

from app.utils.country_codes import to_region_code, languages_for

log = logging.getLogger("geo_enrich")
log.setLevel(logging.INFO)


# 문자열/라벨 유틸 (언어 감지, 로마자화, 노이즈 제거 등)


SEPS = ["→", "->", "-", "~", "에서", "로", " to ", " at ", " in ", ":"]

_RX_HANGUL     = re.compile(r"[가-힣]")
_RX_LATIN      = re.compile(r"[A-Za-z]")
_RX_HIRAGANA   = re.compile(r"[\u3040-\u309F]")
_RX_KATAKANA   = re.compile(r"[\u30A0-\u30FF\u31F0-\u31FF]")
_RX_CYRILLIC   = re.compile(r"[\u0400-\u04FF]")
_RX_GREEK      = re.compile(r"[\u0370-\u03FF]")
_RX_ARABIC     = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")
_RX_THAI       = re.compile(r"[\u0E00-\u0E7F]")

_RX_CJK = re.compile(
    r"[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF"
    r"\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF"
    r"\uAC00-\uD7A3]"
)

def _has_cjk(s: str) -> bool:
    return bool(_RX_CJK.search(s or ""))

def _is_hangul_or_latin(s: str) -> bool:
    return bool(_RX_HANGUL.search(s or "") or _RX_LATIN.search(s or ""))

_RX_LATIN_ACCENTED = re.compile(r"[À-ÖØ-öø-ÿ]")

def _has_accented_latin(s: str) -> bool:
    return bool(_RX_LATIN_ACCENTED.search(s or ""))

# ── 간단 로마자화 맵 (아랍/태국/일본/키릴/그리스) → 검색 안정성 개선용
_AR_MAP = {"ا":"a","أ":"a","إ":"i","آ":"aa","ب":"b","ت":"t","ث":"th","ج":"j","ح":"h","خ":"kh","د":"d",
"ذ":"dh","ر":"r","ز":"z","س":"s","ش":"sh","ص":"s","ض":"d","ط":"t","ظ":"z","ع":"a","غ":"gh","ف":"f","ق":"q",
"ك":"k","ل":"l","م":"m","ن":"n","ه":"h","و":"w","ي":"y","ؤ":"u","ئ":"i","ة":"h","ٓ":"","ً":"","ٌ":"","ٍ":"",
"َ":"","ُ":"","ِ":"","ّ":"","ْ":""}

def _romanize_arabic(s: str) -> str:
    out=[]
    for ch in s:
        if ch in _AR_MAP: out.append(_AR_MAP[ch])
        elif ch.isspace(): out.append(" ")
        elif ord(ch) < 128: out.append(ch)
    return re.sub(r"\s+"," ","".join(out)).strip()

_TH_MAP = {"ก":"k","ข":"kh","ค":"kh","ฆ":"kh","ง":"ng","จ":"ch","ฉ":"ch","ช":"ch","ซ":"s","ฌ":"ch","ญ":"y",
"ฎ":"d","ฏ":"t","ฐ":"th","ฑ":"th","ฒ":"th","ณ":"n","ด":"d","ต":"t","ถ":"th","ท":"th","ธ":"th","น":"n",
"บ":"b","ป":"p","ผ":"ph","พ":"ph","ภ":"ph","ม":"m","ย":"y","ร":"r","ล":"l","ว":"w","ศ":"s","ษ":"s","ส":"s","ห":"h",
"อ":"o","ฮ":"h","ะ":"a","า":"a","ิ":"i","ี":"i","ุ":"u","ู":"u","เ":"e","แ":"ae","โ":"o","ใ":"ai","ไ":"ai","ำ":"am"}

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
 "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po","ゃ":"ya","ゅ":"yu","ょ":"yo","っ":""}

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

_CY_MAP = {"А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"Yo","Ж":"Zh","З":"Z","И":"I","Й":"Y","К":"K",
"Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"Kh","Ц":"Ts",
"Ч":"Ch","Ш":"Sh","Щ":"Sch","Ъ":"","Ы":"Y","Ь":"","Э":"E","Ю":"Yu","Я":"Ya",
"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k",
"л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts",
"ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}

def _romanize_cyrillic(s:str)->str:
    return re.sub(r"\s+"," ","".join(_CY_MAP.get(ch," " if ch.isspace() else ch if ord(ch)<128 else "") for ch in s)).strip()

_GR_MAP = {"Α":"A","Β":"V","Γ":"G","Δ":"D","Ε":"E","Ζ":"Z","Η":"I","Θ":"Th","Ι":"I","Κ":"K","Λ":"L","Μ":"M","Ν":"N",
"Ξ":"X","Ο":"O","Π":"P","Ρ":"R","Σ":"S","Τ":"T","Υ":"Y","Φ":"F","Χ":"Ch","Ψ":"Ps","Ω":"O",
"α":"a","β":"v","γ":"g","δ":"d","ε":"e","ζ":"z","η":"i","θ":"th","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n",
"ξ":"x","ο":"o","π":"p","ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","φ":"f","χ":"ch","ψ":"ps","ω":"o"}

def _romanize_greek(s:str)->str:
    return re.sub(r"\s+"," ","".join(_GR_MAP.get(ch," " if ch.isspace() else ch if ord(ch)<128 else "") for ch in s)).strip()

def _strip_accents_latinlike(s: str) -> str:
    # 악센트 제거 + 안전한 문자만 남김
    s_norm = unicodedata.normalize("NFD", s)
    s_ascii = "".join(ch for ch in s_norm if unicodedata.category(ch) != "Mn")
    s_ascii = re.sub(r"[^0-9A-Za-z\s.,\-_/]", " ", s_ascii)
    return re.sub(r"\s+"," ",s_ascii).strip()

def _romanize_fallback(s: str) -> str:
    # 언어별 로마자화 → 검색 키워드 안정화
    if not s: return ""
    if _is_hangul_or_latin(s): return s
    if _has_cjk(s): return s.strip()
    if _RX_ARABIC.search(s):     return _romanize_arabic(s)
    if _RX_THAI.search(s):       return _romanize_thai(s)
    if _RX_HIRAGANA.search(s) or _RX_KATAKANA.search(s): return _romanize_kana(s)
    if _RX_CYRILLIC.search(s):   return _romanize_cyrillic(s)
    if _RX_GREEK.search(s):      return _romanize_greek(s)
    if any('\u00C0' <= ch <= '\u024F' for ch in s): return _strip_accents_latinlike(s)
    s2 = _strip_accents_latinlike(s)
    return s2 or s or "Unknown"


# 검색 전처리 (괄호 속 이동수단/별점 제거 등)

TRANSPORT_TERMS = [
    "도보","지하철","전철","기차","버스","택시","셔틀","보트","배","수상버스","트램","모노레일",
    "BTS","MRT","ARL","스카이트레인","시티링크","푸드코트",
    "on foot","by foot","walk","walking","subway","metro","train","bus","taxi","cab","tram","monorail",
    "boat","ferry","shuttle","uber","grab","ride[- ]?hailing","food court",
    "徒歩","地下鉄","電車","モノレール","バス","タクシー",
    "รถไฟฟ้า","บีทีเอส","เอ็มอาร์ที","แอร์พอร์ท เรล ลิงก์","แท็กซี่","ตุ๊กตุ๊ก",
]
_RE_PAREN_TRANSPORT = re.compile(r"\((?:\s*(?:%s)[^)]*)\)" % "|".join(TRANSPORT_TERMS), re.IGNORECASE)

_RE_MEAL_PREFIX = re.compile(r"^\s*(점심|저녁|브런치|런치|디너|식사)\s*[:：]\s*", re.I)
_RE_STARS = re.compile(r"[★⭐]+\s*\d*(?:\.\d+)?")
_RE_MENU_GENRE = re.compile(r"(현대|전통|오스트리아|일식|양식|카페|바|요리|레스토랑|restaurant|cafe|bar)\b", re.I)

def _clean_title_noise(s: str) -> str:
    # "점심: ", "★4.6" 같은 접두/별점 제거
    s = _RE_MEAL_PREFIX.sub("", s)
    s = _RE_STARS.sub("", s)
    return re.sub(r"\s{2,}", " ", s).strip()

def _strip_transport_parentheses(s: str) -> str:
    # "(도보)" 같은 괄호 이동수단 제거
    out = _RE_PAREN_TRANSPORT.sub("", s or "")
    return re.sub(r"\s{2,}", " ", out).strip()

# ── 괄호 속 고유명사 후보 추출 (정확 검색용)
_RE_PROPER_PAREN = re.compile(r"\(([^()]{3,})\)")
def _looks_proper_noun(s: str) -> bool:
    t = _strip_accents_latinlike(s)
    tokens = [w for w in re.split(r"\s+", t) if w]
    if any(re.search(r"(walk|metro|bus|tram|restaurant|cafe|food|traditional|modern|도보|전통|현대)", t, re.I)):
        return False
    return bool(sum(ch.isalpha() for ch in t) >= 3 and 1 <= len(tokens) <= 6 and any(w[0].isupper() for w in tokens))

def _extract_precise_candidate(raw: str) -> Optional[str]:
    # 따옴표/괄호 안 이름을 우선 정확 키워드로 사용
    if not raw:
        return None
    s = _strip_transport_parentheses(raw)
    m = re.search(r"[\"“”'‘’]([^\"“”'‘’]+)[\"“”'‘’]", s)
    if m:
        cand = m.group(1).strip()
        if len(cand) >= 3 and not _RE_MENU_GENRE.fullmatch(cand):
            return cand
    for pm in _RE_PROPER_PAREN.finditer(s):
        cand = pm.group(1).strip()
        if _looks_proper_noun(cand) and not _RE_MENU_GENRE.fullmatch(cand):
            return cand
    return None

# ── 뒤꼬리(행위 표현) 제거하여 장소 핵심어만 남기기
_RE_TRAILING_ACTIONS = re.compile(
    r"(?:\s*(?:방문|관람|감상|체험|산책|야경|쇼핑|포토\s*스팟|전망대|이동|구경|휴식|체크인|체크아웃|식사|점심|저녁))+$"
)
# ── 한국 지명 힌트 (타워/공원/시장 등)
_KR_PLACE_SUFFIX = re.compile(
    r"(타워|공원|박물관|미술관|시장|거리|호수|마을|한옥마을|사|절|성당|성|궁|대학|서점|도서관|분수|해변|해수욕장|전통마을)$"
)

def _pick_place_phrase(activity: str) -> str:
    # 문장에서 장소 핵심 구(phrase) 선택
    s = activity or ""
    s = _clean_title_noise(s)
    s = _strip_transport_parentheses(s)

    m = re.search(r"[\"“”'‘’]([^\"“”'‘’]+)[\"“”'‘’]", s)
    if m:
        return m.group(1).strip()

    s = re.sub(r"\(.*?\)|\[.*?\]|【.*?】", "", s)
    s = _RE_TRAILING_ACTIONS.sub("", s).strip()
    s = re.sub(r"(에서|으로|로|에)\s*$", "", s).strip()

    parts = re.split(r"\s*[,·|\-–]\s*|\s*(?:에서|로|to|in|at)\s*", s)
    parts = [p.strip() for p in parts if p.strip()]

    for p in parts:
        if _KR_PLACE_SUFFIX.search(p) or _looks_proper_noun(p):
            return p

    if parts:
        return max(parts, key=lambda x: (len(_tokens(x)), len(x)))
    return (activity or "").strip()


# 룰/패턴(호텔/공항/식사/쇼핑 등 의도 감지)

_RE_CHECK = re.compile(r"(체크\s*인|체크\s*아웃|체크인|체크아웃|check-?\s*in|check-?\s*out)", re.I)
_RE_HOTEL_RETURN = re.compile(r"(숙소|호텔)\s*(복귀|돌아가|돌아오|귀환|이동)|"
                              r"(return|back\s*to|go\s*back)\s*(the\s*)?(hotel|accommodation)", re.I)
_RE_HOTEL_CONTEXT = re.compile(r"(숙소|호텔|hotel).*(짐|정리|packing|pack|체크아웃|휴식|rest|sleep|nap|lobby|라운지|룸|객실)", re.I)

def _looks_checkinout(s: str)->bool: return bool(_RE_CHECK.search(s or ""))
def _looks_hotel_return_or_rest(s: str)->bool: return bool(_RE_HOTEL_RETURN.search(s or ""))
def _looks_hotel_context(s: str)->bool: return bool(_RE_HOTEL_CONTEXT.search(s or ""))

# ⬇ 숙소 관련 표현(짐 보관 등)도 포괄
_RE_LODGING_ACTIVITY = re.compile(
    r"(숙소|호텔|check\s*[-\s]*in|check\s*[-\s]*out|체크\s*인|체크인|체크\s*아웃|체크아웃|짐\s*(정리|보관|보관함)|luggage|baggage|storage|deposit)",
    re.I
)
def _is_lodging_activity(s: str) -> bool:
    return bool(_RE_LODGING_ACTIVITY.search(s or ""))

_RE_AIRPORT_MOVE = re.compile(r"(공항|airport|aeroport|aeropuerto|aeroporto|aéroport)\s*.*(이동|가기|transfer|to|move|go)|"
                              r"(이동|transfer|to)\s*.*(공항|airport|aeroport|aeropuerto|aeroporto|aéroport)", re.I)

def _looks_airport_move(s: str)->bool: return bool(_RE_AIRPORT_MOVE.search(s or ""))

# ── 의도(식사/카페/뷰/쇼핑/스키/온천) 플래그 → 타입 힌트에 사용
_MEAL_WORDS = r"(점심|저녁|브런치|디너|런치|식사|맛집|레스토랑|restaurant|dinner|lunch|brunch|cafe|카페|바|펍|★)"
def _looks_meal_intent(s: str) -> bool: return bool(re.search(_MEAL_WORDS, s, re.I))
def _looks_cafe(s: str) -> bool: return bool(re.search(r"(카페|cafe|coffee|espresso|bakery|빵집|베이커리)", s, re.I))
def _looks_viewpoint(s: str) -> bool: return bool(re.search(r"(전망대|뷰포인트|야경|panorama|viewpoint|observatory|스카이덱)", s, re.I))
def _looks_shopping(s: str) -> bool: return bool(re.search(r"(쇼핑|기념품|market|mall|store|상점|백화점|아울렛)", s, re.I))
def _looks_food(s: str)->bool:
    return bool(re.search(r"(라멘|라면|스시|초밥|스프카레|카레|징기스칸|양고기|식당|맛집|ramen|sushi|curry|bbq|grill|bistro|cafe|soup curry)", s, re.I))
def _looks_ski(s: str)->bool:
    return bool(re.search(r"(스키|스노보드|ski|snowboard|스키장)", s, re.I))
def _looks_onsen(s: str)->bool:
    return bool(re.search(r"(온천|온센|spa|thermal|hot spring)", s, re.I))

# ── 특정 도시(예: 삿포로) 별칭 매핑 (정확히 찍히지 않는 유명지 처리)
ALIAS_RULES: List[Tuple[re.Pattern,str,List[str]]] = [
    (re.compile(r"(tv\s*타워|television\s*tower|テレビ塔|さっぽろテレビ塔|타워\s*전망대)", re.I), "Sapporo TV Tower", ["tourist_attraction","point_of_interest"]),
    (re.compile(r"(맥주\s*박물|ビール博物館|beer\s*museum)", re.I), "Sapporo Beer Museum", ["tourist_attraction","museum"]),
    (re.compile(r"(오도리\s*공원|大通公園|odori\s*park)", re.I), "Odori Park", ["park"]),
]

# ── 비슷한 철자 혼동 방지(오탑/동음이의 처리)
_CONFUSION_PAIRS = [
    (r"\badler\b", r"\bdachl\b"),
    (r"\broof\b",  r"\badler\b"),
    (r"\bdachl\b", r"\broof\b"),
]

def _pair_confused(q: str, name: str) -> bool:
    qn, nn = _strip_accents_latinlike(_romanize_fallback(q)).lower(), _strip_accents_latinlike(_romanize_fallback(name)).lower()
    for a, b in _CONFUSION_PAIRS:
        if re.search(a, qn) and re.search(b, nn): return True
        if re.search(b, qn) and re.search(a, nn): return True
    return False


# 좌표/거리 유틸 (하버사인)

def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2): return None
    R = 6371.0
    dlat = radians(lat2 - lat1); dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlng/2)**2
    return 2 * R * asin(sqrt(a))

def _distance_m(a: dict | None, b: dict | None) -> float | None:
    if not a or not b or a.get("lat") is None or a.get("lng") is None or b.get("lat") is None or b.get("lng") is None:
        return None
    d = _haversine_km(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
    return None if d is None else d * 1000

# 도시 반경 제한(너무 먼 결과 제거)
_MAX_CITY_RADIUS_KM = 80.0
def _too_far(place: dict, city_anchor: Optional[dict]) -> bool:
    if not city_anchor: 
        return False
    d = _distance_m({"lat": city_anchor["lat"], "lng": city_anchor["lng"]}, place)
    return d is not None and d > _MAX_CITY_RADIUS_KM * 1000


# 라벨 보장/정규화 (display_name 생성)

def _ensure_display_name(p: dict) -> dict:
    ko = (p.get("name_ko") or "").strip()
    en = (p.get("name_en") or "").strip()
    orig = (p.get("name_original") or p.get("name") or "").strip()

    if ko and _is_hangul_or_latin(ko): disp = ko
    elif en and _RX_LATIN.search(en):  disp = en
    elif orig:
        disp = _strip_accents_latinlike(orig) if _has_accented_latin(orig) and not _has_cjk(orig) else orig
    else:
        disp = ""

    disp = re.sub(r"\s*\(\s*\)\s*$", "", disp or "").strip()
    if not disp: disp = orig or p.get("id") or "Unknown"
    p["display_name"] = disp
    return p


# 이름 정규화/유사도 (레벤슈타인 + 토큰 자카드)

def _norm_name(s: str) -> str:
    s = _romanize_fallback(s or "")
    s = _strip_accents_latinlike(s)
    s = re.sub(r"[^\w\s]", " ", s.lower())
    return re.sub(r"\s{2,}", " ", s).strip()

def _norm0(s: str) -> str:
    s = _romanize_fallback(s or "")
    s = _strip_accents_latinlike(s)
    return re.sub(r"\s+", " ", s).strip().lower()

@lru_cache(maxsize=4096)
def _lev_ratio(a: str, b: str) -> float:
    # 가벼운 레벤슈타인 유사도 (0~1)
    a, b = _norm0(a), _norm0(b)
    if not a or not b: return 0.0
    m, n = len(a), len(b)
    if m == 0 or n == 0: return 0.0
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            cost = 0 if a[i-1] == b[j-1] else 1
            prev, dp[j] = dp[j], min(dp[j] + 1, dp[j-1] + 1, prev + cost)
    dist = dp[n]
    return 1.0 - (dist / max(m, n))

_STOPWORDS_GENERIC = {
    "the","a","an","of","and","&","at","in","on","to","for",
    "restaurant","cafe","hotel","hostel","park","market","museum","gallery",
    "observatory","station","tower","mall","square","garden","street","road",
    "역","공원","시장","박물관","미술관","전망대","타워","광장","정원","가든","몰","쇼핑몰","온천","온센",
    "空港","駅","公園","市場","美術館","博物館","展望台","塔","広場","庭園","通り","モール","温泉"
}

def _tokens(s: str) -> List[str]:
    toks = [t for t in _norm_name(s).split() if t and t not in _STOPWORDS_GENERIC]
    return [t for t in toks if len(t) > 1]

def _token_sim(a: str, b: str) -> float:
    # 토큰 자카드 + 부분포함 보너스 + 한글 보너스
    A, B = set(_tokens(a)), set(_tokens(b))
    if not A or not B:
        return 0.0
    inter = len(A & B)
    jac = inter / len(A | B)
    sub = 1.0 if (_norm_name(a) in _norm_name(b) or _norm_name(b) in _norm_name(a)) else 0.0
    bonus = 0.1 if (_RX_HANGUL.search(a) or _RX_HANGUL.search(b)) else 0.0
    return jac + 0.2 * sub + bonus


# 구글 플레이스 검색 래퍼 (Places API v1)

PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"

def _map_to_schema(p: dict, lang: str | None = None) -> dict:
    # 구글 응답을 내부 통일 스키마로 변환
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
    # 검색 바디 조립 (타입/바이어스/반경)
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

def _post_multi(body, topk: int = 8) -> List[dict]:
    # API 호출(필드 마스크 최소화) + topk 자르기
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
    return places[:topk]

def _search_with_fallbacks_multi(query, *, language, region, location_bias, types, topk=8) -> List[dict]:
    # 빡빡→느슨 순서로 재시도 (정확도 우선, 실패 시 범위/타입 완화)
    trials = [
        _mk_body(query, language, region, location_bias, types, True, 25000),
        _mk_body(query, language, region, location_bias, types, False, 25000),
        _mk_body(query, language, region, location_bias, types, False, 40000),
        _mk_body(query, language, region, location_bias=None, types=types, strict=False, radius_m=40000),
        _mk_body(query, language, region, location_bias=None, types=None,  strict=False, radius_m=0),
    ]
    bag=[]
    for body in trials:
        try:
            bag += _post_multi(body, topk=topk)
            if bag: break
        except Exception:
            continue
    return bag[:topk]


# 스코어링 (텍스트 의도/타입/거리/평점 반영)

def _score_candidate(place: dict, query_label: str, *, city_anchor: Optional[dict], types_hint: Optional[List[str]]) -> float:
    name = place.get("display_name") or place.get("name_original") or ""
    base_sim = _token_sim(query_label, name)
    lev = _lev_ratio(query_label, name)
    exact = 1.0 if _norm0(query_label) == _norm0(name) else 0.0
    starts = 0.6 if _norm0(name).startswith(_norm0(query_label)) or _norm0(query_label).startswith(_norm0(name)) else 0.0
    partial = 0.4 if (_norm0(query_label) in _norm0(name) or _norm0(name) in _norm0(query_label)) else 0.0

    ptypes = " ".join((place.get("category") or "")).lower()
    bonus_type = 0.0
    if types_hint:
        for t in types_hint:
            if t and t.lower() in ptypes:
                bonus_type += 0.35
                break

    # 의도 보너스/패널티 (식당인데 여행사로 매칭되는 것 등 방지)
    intent_bonus = 0.0; intent_pen = 0.0
    if _looks_meal_intent(query_label):
        if re.search(r"(restaurant|food|cafe|bar|bistro)", ptypes): intent_bonus += 0.35
        if re.search(r"(tour|agency|museum|shop|store|market)", ptypes): intent_pen  += 0.35
    if _looks_cafe(query_label) and "cafe" in ptypes: intent_bonus += 0.2
    if _looks_shopping(query_label) and re.search(r"(store|shopping|mall|market)", ptypes): intent_bonus += 0.25
    if _looks_viewpoint(query_label) and re.search(r"(viewpoint|observatory|tower|mountain|natural_feature|tourist_attraction)", ptypes):
        intent_bonus += 0.25
    if _looks_meal_intent(query_label) and re.search(r"(tour|agency|travel)", ptypes): intent_pen += 0.45

    confusion_pen = 0.4 if _pair_confused(query_label, name) else 0.0

    # 도시 중심에서 먼 결과는 패널티
    dist_pen = 0.0
    if city_anchor:
        d = _distance_m({"lat":city_anchor["lat"], "lng":city_anchor["lng"]}, place) or 50000
        dist_pen = min(0.6, (d/1000)/70.0)

    # 평점 소폭 보너스(정확매칭일 땐 영향 줄임)
    rate = place.get("rating") or 0.0
    rate_bonus = min(0.15, (float(rate)-3.8) * 0.06) if rate else 0.0
    if exact or lev >= 0.82:
        rate_bonus *= 0.3

    s = (base_sim
         + 0.9*lev + 0.6*exact + 0.4*starts + 0.3*partial
         + bonus_type + intent_bonus + rate_bonus
         - dist_pen - intent_pen - confusion_pen)
    return s

def _choose_best_place(cands: List[dict], query_label: str, lang: str, city_anchor: Optional[dict], types_hint: Optional[List[str]]) -> Optional[dict]:
    # 후보 → 스코어 → 최고점 선택 (도시 반경 초과는 제외)
    if not cands: return None
    scored = []
    for p in cands:
        mapped = _map_to_schema(p, lang)
        if _too_far(mapped, city_anchor):
            continue
        scored.append((_score_candidate(mapped, query_label, city_anchor=city_anchor, types_hint=types_hint), mapped))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1] if scored else None


# 공항 탐색 (도시명+Airport 패턴으로 빠르게 찾기)

def _is_airport_place(p: dict) -> bool:
    namebag = f"{p.get('display_name','')} {p.get('name_original','')}".lower()
    cat = (p.get('category') or '').lower()
    return ("airport" in namebag) or ("공항" in namebag) or ("airport" in cat) or ("空港" in namebag)

def _find_airport_place(city: str, country: str, langs: List[str], region_code: Optional[str], loc_bias: Optional[dict]) -> Optional[dict]:
    queries = [
        f"{city} International Airport",
        f"{city} Airport",
        f"{city} {country} Airport",
        f"{city} 공항",
        f"{city} aeropuerto", f"{city} aeroporto", f"{city} aéroport"
    ]
    for lang in langs + ["en"]:
        for q in queries:
            try:
                hits = _search_with_fallbacks_multi(q, language=lang, region=region_code, location_bias=loc_bias, types=["airport"], topk=5)
                if hits:
                    best = _choose_best_place(hits, q, lang, None, ["airport"])
                    if best: return best
            except Exception:
                continue
    return None


# 호텔 좌표 보정 (hotel name → Places 검색으로 lat/lng 채우기)

def _resolve_hotel_latlng(h: dict, city, country, langs, region_code, loc_bias):
    q_candidates = [
        h.get("booking_query"), h.get("agoda_query"),
        h.get("name_ko"), h.get("name_original"), h.get("display_name")
    ]
    q_candidates = [q for q in q_candidates if q and q.strip()]
    for q in q_candidates:
        for lang in langs + ["en"]:
            try:
                hits = _search_with_fallbacks_multi(
                    f"{q}, {city}, {country}",
                    language=lang, region=region_code, location_bias=loc_bias,
                    types=["lodging"], topk=8
                )
                best = _choose_best_place(hits, q, lang, None, ["lodging"])
                if best and best.get("lat") and best.get("lng"):
                    h["lat"], h["lng"] = best["lat"], best["lng"]
                    return h
            except Exception:
                continue
    return h


# 메인 로직 (일정 → 장소 매칭, hotel/airport/도시중심 활용)

def _act_label(idx_day:int, idx_act:int)->str:
    return f"act_d{idx_day+1}_a{idx_act+1}"

def _jitter(lat: float, lng: float, k: int) -> tuple[float, float]:
    # 좌표 실패 시 겹치지 않게 살짝 흩뿌리기
    dx = ((k * 37) % 7 - 3) * 0.00012
    dy = ((k * 53) % 7 - 3) * 0.00012
    return (lat + dy, lng + dx)

def _anchor_coord(primary_hotel: Optional[dict], city_center: Optional[dict]) -> tuple[float,float] | None:
    # 지터 기준점: 호텔 > 도시중심
    if primary_hotel and primary_hotel.get("lat") and primary_hotel.get("lng"):
        return float(primary_hotel["lat"]), float(primary_hotel["lng"])
    if city_center and city_center.get("lat") and city_center.get("lng"):
        return float(city_center["lat"]), float(city_center["lng"])
    return None

def _place_for_alias(activity: str, city: str, country: str, continent: Optional[str]=None):
    # 도시/국가 힌트로 별칭 매핑 (현재: 삿포로 특정 규칙)
    if not country:
        return None, None
    is_japan = (country or "").strip().lower() in {"japan","jp","日本","日本国"}
    has_sapporo_hint = re.search(r"(sapporo|삿포로|札幌)", f"{activity or ''} {city or ''}", re.I)
    if not (is_japan and has_sapporo_hint):
        return None, None
    for pat, alias, hints in ALIAS_RULES:
        if pat.search(activity or ""):
            return alias, hints
    return None, None

async def enrich_one_recommendation(rec: dict, collect_debug: bool = False):
    # 입력: {"city","country","schedule", "lodging":{hotels:[]...}}
    # 출력: rec에 allPlaces/days/placesByDay 추가
    city = (rec.get("city") or "").strip()
    country = (rec.get("country") or "").strip()
    region_code = to_region_code(country)
    schedule: dict = rec.get("schedule") or {}

    langs = languages_for(region_code)
    city_query = f"{city}, {country}".strip(", ")

    # 1) 도시 중심 찾기 (도시명 검색 → 첫 결과)
    city_center = None
    try:
        for lang in langs + ["en"]:
            hits = _search_with_fallbacks_multi(
                city_query, language=lang, region=region_code,
                location_bias=None, types=None, topk=3
            )
            if hits:
                city_center = _map_to_schema(hits[0], lang)
                break
    except Exception:
        city_center = None

    loc_bias = {"latitude": city_center["lat"], "longitude": city_center["lng"]} if city_center else None

    # 2) 대표 호텔(첫 호텔) 확보 + 좌표 보정 시도
    primary_hotel: Optional[dict] = None
    lodg = rec.get("lodging") or {}
    hotels = lodg.get("hotels") or []
    if isinstance(hotels, list) and hotels:
        primary_hotel = dict(hotels[0])
        # 좌표가 없으면 Places로 보정
        if primary_hotel.get("lat") is None or primary_hotel.get("lng") is None:
            q = (primary_hotel.get("name_ko")
                 or primary_hotel.get("name_original")
                 or primary_hotel.get("display_name") or "").strip()
            if q:
                try:
                    hits = _search_with_fallbacks_multi(
                        f"{q}, {city}, {country}",
                        language=(langs[0] if langs else "en"),
                        region=region_code, location_bias=loc_bias,
                        types=["lodging"], topk=8
                    )
                    best = _choose_best_place(hits, q, (langs[0] if langs else "en"), city_center, ["lodging"])
                    if best:
                        primary_hotel["lat"], primary_hotel["lng"] = best["lat"], best["lng"]
                except Exception:
                    pass
        # 그래도 없으면 도시중심 기준으로 살짝 지터
        if (primary_hotel.get("lat") is None or primary_hotel.get("lng") is None) and city_center:
            jl, jg = _jitter(float(city_center["lat"]), float(city_center["lng"]), 1)
            primary_hotel["lat"], primary_hotel["lng"] = jl, jg
        _ensure_display_name(primary_hotel)

    # 3) 공항 후보 찾기
    airport_place = _find_airport_place(city, country, langs, region_code, loc_bias)

    # 4) 출력 컨테이너 준비
    all_places: list[dict] = []
    days: list[dict] = []
    places_by_day: list[list[dict]] = []

    def _stamp(place: dict, seq: int) -> dict:
        # place_key/order_index 부여 → 렌더/디버그 용이
        name = place.get("display_name") or place.get("name_ko") or place.get("name_original") or ""
        base_key = re.sub(r"[()\s]", "", (name or "").lower())
        place["place_key"] = f"{base_key}-{seq:02d}"
        place["order_index"] = seq
        return place

    def day_order(k: str) -> int:
        m = re.search(r"(\d+)", k or "")
        return int(m.group(1)) if m else 9999

    items = sorted(schedule.items(), key=lambda kv: day_order(kv[0]))

    seq = 0
    hotel_seen = False  # 액티비티 중 숙소가 한 번이라도 등장했는지

    # 5) 각 날짜/액티비티를 장소로 매핑
    for d_idx, (_day_key, acts) in enumerate(items):
        if not isinstance(acts, list):
            places_by_day.append([])
            days.append({"dateOffset": d_idx, "stops": []})
            continue

        day_stops: list[dict] = []
        visible_list_for_day: list[dict] = []

        for a_idx, a in enumerate(acts):
            raw = str(a.get("activity", "")).strip()
            place: Optional[dict] = None

            # (a) 체크인/숙소 맥락 → 대표 호텔로 고정
            if primary_hotel and (_looks_checkinout(raw) or _looks_hotel_return_or_rest(raw) or _looks_hotel_context(raw)):
                place = dict(primary_hotel)
                hotel_seen = True

            # (b) 공항 이동/출도착 → 공항(없으면 도시중심)
            if place is None and _looks_airport_move(raw):
                place = airport_place or city_center

            # (c) 도시 특화 별칭
            alias, alias_types = _place_for_alias(raw)

            # (d) 일반 장소 검색 (정밀어→일반어 순서, 타입 힌트 활용)
            if place is None:
                precise = _extract_precise_candidate(raw)
                base_phrase = _pick_place_phrase(raw)
                base_query = f"{base_phrase}, {city}, {country}".strip(", ")
                precise_query = f"{precise}, {city}, {country}".strip(", ") if precise else None

                types_hint: Optional[List[str]] = alias_types or (
                    ["restaurant","cafe","bar"] if _looks_meal_intent(raw) else
                    ["cafe","bakery"] if _looks_cafe(raw) else
                    ["viewpoint","tourist_attraction","observatory","natural_feature"] if _looks_viewpoint(raw) else
                    ["shopping_mall","store","market"] if _looks_shopping(raw) else
                    ["ski_resort"] if _looks_ski(raw) else
                    ["spa"] if _looks_onsen(raw) else None
                )

                # 정밀 키워드 우선 탐색
                if precise:
                    for lang in langs + ["en"]:
                        try:
                            hits = _search_with_fallbacks_multi(
                                f"{precise}, {city}, {country}",
                                language=lang, region=region_code,
                                location_bias=loc_bias, types=types_hint, topk=8
                            )
                            phit = _choose_best_place(hits, precise, lang, city_center, types_hint)
                            if phit and _lev_ratio(precise, phit.get("display_name") or phit.get("name_original") or "") >= 0.80:
                                place = phit
                                break
                        except Exception:
                            continue

                # 일반 탐색(별칭/정밀/기본쿼리 순서로 시도)
                if place is None:
                    q_list = []
                    if alias: q_list.append(f"{alias}, {city}, {country}")
                    if precise_query: q_list.append(precise_query)
                    q_list.extend([base_query, base_phrase, raw])

                    for lang in langs + ["en"]:
                        for q in q_list:
                            if not q: continue
                            try:
                                hits = _search_with_fallbacks_multi(
                                    q, language=lang, region=region_code,
                                    location_bias=loc_bias, types=types_hint, topk=8
                                )
                                phit = _choose_best_place(hits, (alias or precise or base_phrase or raw), lang, city_center, types_hint)
                                if phit:
                                    place = phit
                                    break
                            except Exception:
                                continue
                        if place: break

            # (e) 좌표 실패 시 앵커 기준 지터 + 임시 포인트
            lat, lng = None, None
            if place and place.get("lat") and place.get("lng"):
                lat, lng = float(place["lat"]), float(place["lng"])
            else:
                anchor = _anchor_coord(primary_hotel, city_center)
                if anchor:
                    lat, lng = _jitter(anchor[0], anchor[1], a_idx + 1)
                label = _pick_place_phrase(raw) or raw[:40]
                place = {
                    "id": _act_label(d_idx, a_idx),
                    "name_original": label,
                    "lat": lat, "lng": lng,
                    "category": "itinerary_point"
                }
                _ensure_display_name(place)

            # (f) 스탬프/추가 메타 부착
            seq += 1
            place = _ensure_display_name(place)
            place = _stamp(dict(place), seq)
            place.setdefault("meta", {})["activity_ref"] = _act_label(d_idx, a_idx)

            # (g) 호텔이 액티비티 중 자연스럽게 포함됐는지 체크
            if not hotel_seen and primary_hotel:
                pname = (primary_hotel.get("display_name") or primary_hotel.get("name_original") or "").strip()
                if place.get("category") == "lodging" or _lev_ratio(pname, place.get("display_name","")) >= 0.9:
                    hotel_seen = True

            all_places.append(place)
            day_stops.append({"lat": lat, "lng": lng})
            visible_list_for_day.append(place)

        places_by_day.append(visible_list_for_day)
        days.append({"dateOffset": d_idx, "stops": day_stops})

    # 6) 호텔 마커 보장: 일정 중 한 번도 안나오면 Day0에 추가
    if primary_hotel and not hotel_seen:
        # Day0 보장
        if not days:
            days.append({"dateOffset": 0, "stops": []})
            places_by_day.append([])

        pin = {
            "id": "lodg_hotel_primary",
            "name_original": primary_hotel.get("display_name") or primary_hotel.get("name_original"),
            "name_ko": primary_hotel.get("name_ko"),
            "category": "lodging",
            "lat": primary_hotel.get("lat"),
            "lng": primary_hotel.get("lng"),
        }
        _ensure_display_name(pin)

        seq += 1
        pin = _stamp(pin, seq)
        all_places.append(pin)

        if pin.get("lat") is not None and pin.get("lng") is not None:
            days[0]["stops"].append({"lat": float(pin["lat"]), "lng": float(pin["lng"])})
            places_by_day[0].append(pin)

    # ==== 숙소 100% 마커 보장 (렌더러가 placesByDay만 볼 때 대비) ====
    def _norm_label(x: str) -> str:
        return re.sub(r"\s+", " ", (_strip_accents_latinlike(_romanize_fallback(x or "")) or "").lower()).strip()

    if primary_hotel:
        # 이미 들어갔는지 최종 점검 (카테고리/이름 유사)
        pname = (primary_hotel.get("display_name") or primary_hotel.get("name_original") or "").strip()
        pname_n = _norm_label(pname)
        hotel_already_in = False
        for p in all_places:
            if (p.get("category") == "lodging") or (_lev_ratio(pname, p.get("display_name","")) >= 0.90) \
               or (_norm_label(p.get("display_name","")) == pname_n):
                hotel_already_in = True
                break

        if not hotel_already_in:
            # 좌표 재보정 시도 → 그래도 없으면 도시중심 지터
            if not (primary_hotel.get("lat") and primary_hotel.get("lng")):
                try:
                    q = (primary_hotel.get("name_ko") or primary_hotel.get("name_original") \
                         or primary_hotel.get("display_name") or "").strip()
                    if q:
                        hits = _search_with_fallbacks_multi(
                            f"{q}, {city}, {country}",
                            language=(langs[0] if langs else "en"),
                            region=region_code, location_bias=loc_bias,
                            types=["lodging"], topk=8
                        )
                        best = _choose_best_place(hits, q, (langs[0] if langs else "en"), city_center, ["lodging"])
                        if best and best.get("lat") and best.get("lng"):
                            primary_hotel["lat"], primary_hotel["lng"] = best["lat"], best["lng"]
                except Exception:
                    pass
            if not (primary_hotel.get("lat") and primary_hotel.get("lng")) and city_center:
                jl, jg = _jitter(float(city_center["lat"]), float(city_center["lng"]), 1)
                primary_hotel["lat"], primary_hotel["lng"] = jl, jg

            _ensure_display_name(primary_hotel)
            pin = {
                "id": "lodg_hotel_primary",
                "name_original": primary_hotel.get("display_name") or primary_hotel.get("name_original"),
                "name_ko": primary_hotel.get("name_ko"),
                "category": "lodging",
                "lat": primary_hotel.get("lat"),
                "lng": primary_hotel.get("lng"),
            }
            _ensure_display_name(pin)

            # 스탬프/시퀀스
            seq += 1
            pin = _stamp(pin, seq)
            all_places.append(pin)

            # Day0 컨테이너 보장 후, 맨 뒤에 append (순서 영향 최소)
            if not days:
                days.append({"dateOffset": 0, "stops": []})
                places_by_day.append([])
            if pin.get("lat") is not None and pin.get("lng") is not None:
                days[0]["stops"].append({"lat": float(pin["lat"]), "lng": float(pin["lng"])})
                places_by_day[0].append(pin)

    # ─────────────────────────────────────────────────────────
    # 최종 결과를 rec에 반영
    # ─────────────────────────────────────────────────────────
    rec["allPlaces"] = all_places
    rec["days"] = days
    rec["placesByDay"] = places_by_day
    return rec
