# app/utils/country_codes.py
from __future__ import annotations
import re, unicodedata, difflib
from typing import Optional, List, Dict
import pycountry  # pip install pycountry

# ─────────────────────────────────────────────
# 1) 한글 별칭 → ISO-3166-1 alpha-2
# ─────────────────────────────────────────────
COUNTRY_TO_REGION: Dict[str, str] = {
    # 동아시아/동남아
    "대한민국":"KR","한국":"KR","북한":"KP","일본":"JP",
    "중국":"CN","홍콩":"HK","마카오":"MO","대만":"TW","타이완":"TW",
    "베트남":"VN","태국":"TH","라오스":"LA","캄보디아":"KH",
    "말레이시아":"MY","싱가포르":"SG","인도네시아":"ID","필리핀":"PH",
    "브루나이":"BN","미얀마":"MM","동티모르":"TL",
    # 남아시아
    "인도":"IN","네팔":"NP","부탄":"BT","방글라데시":"BD",
    "스리랑카":"LK","몰디브":"MV","파키스탄":"PK",
    # 중동
    "터키":"TR","요르단":"JO","이스라엘":"IL","레바논":"LB","이란":"IR","이라크":"IQ","시리아":"SY","예멘":"YE",
    "아랍에미리트":"AE","사우디아라비아":"SA","카타르":"QA","쿠웨이트":"KW","바레인":"BH","오만":"OM",
    # 유럽(주요)
    "영국":"GB","아일랜드":"IE","프랑스":"FR","모나코":"MC","스위스":"CH","리히텐슈타인":"LI",
    "독일":"DE","오스트리아":"AT",
    "이탈리아":"IT","바티칸":"VA","산마리노":"SM","몰타":"MT",
    "스페인":"ES","포르투갈":"PT","안도라":"AD",
    "네덜란드":"NL","벨기에":"BE","룩셈부르크":"LU",
    "덴마크":"DK","노르웨이":"NO","스웨덴":"SE","핀란드":"FI","아이슬란드":"IS",
    "폴란드":"PL","체코":"CZ","슬로바키아":"SK","헝가리":"HU",
    "크로아티아":"HR","슬로베니아":"SI","보스니아":"BA","몬테네그로":"ME","세르비아":"RS",
    "북마케도니아":"MK","알바니아":"AL","그리스":"GR",
    "루마니아":"RO","불가리아":"BG",
    "에스토니아":"EE","라트비아":"LV","리투아니아":"LT",
    "우크라이나":"UA","몰도바":"MD","조지아":"GE","아르메니아":"AM","아제르바이잔":"AZ",
    # 아프리카
    "모로코":"MA","튀니지":"TN","이집트":"EG",
    "남아프리카공화국":"ZA","남아공":"ZA",
    "에티오피아":"ET","케냐":"KE","탄자니아":"TZ","마다가스카르":"MG",
    "모리셔스":"MU","세이셸":"SC","나미비아":"NA","보츠와나":"BW",
    "짐바브웨":"ZW","잠비아":"ZM","레소토":"LS","모잠비크":"MZ","가나":"GH","나이지리아":"NG",
    # 아메리카
    "미국":"US","캐나다":"CA","멕시코":"MX","쿠바":"CU","도미니카공화국":"DO","자메이카":"JM",
    "브라질":"BR","아르헨티나":"AR","칠레":"CL","페루":"PE","볼리비아":"BO","콜롬비아":"CO","에콰도르":"EC",
    "우루과이":"UY","파라과이":"PY",
    # 오세아니아/기타
    "호주":"AU","오스트레일리아":"AU","뉴질랜드":"NZ","피지":"FJ","사이판":"MP","괌":"GU","팔라우":"PW",
    "타히티":"PF","뉴칼레도니아":"NC","러시아":"RU","카자흐스탄":"KZ","우즈베키스탄":"UZ",
    "키르기스스탄":"KG","타지키스탄":"TJ","몽골":"MN",
}

# 현지 표기/불어/러시아어 등 대표 별칭 → ISO-2
ALIAS_TO_ALPHA2: Dict[str, str] = {
    # 아랍어
    "المغرب":"MA","تونس":"TN","مصر":"EG","السعودية":"SA","الإمارات":"AE","قطر":"QA",
    "الكويت":"KW","البحرين":"BH","عمان":"OM","الأردن":"JO","إسرائيل":"IL","إيران":"IR","اليمن":"YE","تركيا":"TR",
    "جنوب أفريقيا":"ZA","ليسوتو":"LS","ناميبيا":"NA","تنزانيا":"TZ","كينيا":"KE","اثيوبيا":"ET",
    # 불어/스페인어
    "maroc":"MA","tunisie":"TN","egypte":"EG","cote d’ivoire":"CI","côte d’ivoire":"CI",
    "espagne":"ES","portugal":"PT","royaume-uni":"GB","grèce":"GR","république tchèque":"CZ",
    "méxique":"MX","méxico":"MX","brésil":"BR","argentine":"AR","pérou":"PE",
    # 러시아어
    "россия":"RU","грузия":"GE","япония":"JP","южная корея":"KR",
}

# 국가별 언어 우선순위(Places Text Search languageCode 힌트)
COUNTRY_LANG_HINT: Dict[str, List[str]] = {
    "MA": ["fr", "ar", "en", "ko"],  # 모로코
    "TN": ["fr", "ar", "en", "ko"],
    "DZ": ["fr", "ar", "en", "ko"],
    "EG": ["ar", "en", "fr", "ko"],
    "AE": ["ar", "en", "ko"], "SA": ["ar", "en", "ko"], "QA": ["ar", "en", "ko"],
    "OM": ["ar", "en", "ko"], "JO": ["ar", "en", "ko"], "IL": ["he", "en", "ko"], "TR": ["tr", "en", "ko"],
    "JP": ["ja", "en", "ko"], "CN": ["zh-CN", "en", "ko"], "TW": ["zh-TW", "en", "ko"], "HK": ["zh-HK", "en", "ko"], "KR": ["ko", "en"],
    "FR": ["fr", "en", "ko"], "ES": ["es", "en", "ko"], "PT": ["pt", "en", "ko"], "IT": ["it", "en", "ko"],
    "DE": ["de", "en", "ko"], "CZ": ["cs", "en", "ko"], "PL": ["pl", "en", "ko"],
    "RU": ["ru", "en", "ko"], "ZA": ["en", "af", "ko"],
}

# ─────────────────────────────────────────────
# 헬퍼들
# ─────────────────────────────────────────────
_COUNTRY_CLEAN_PATTERNS = [
    r"\s*(공화국|왕국|연방|연합|인민|민주주의|아랍|합중국|사회주의|성|주)$",
    r"\s*(민주주의\s*인민\s*공화국)$",
    r"\s*(연방\s*공화국)$",
]

def clean_country_ko(name: str) -> str:
    s = (name or "").strip()
    for pat in _COUNTRY_CLEAN_PATTERNS:
        s = re.sub(pat, "", s)
    s = re.sub(r"[().·,]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))

def _lookup_iso_alpha2(name: str) -> Optional[str]:
    try:
        return pycountry.countries.lookup(name).alpha_2
    except Exception:
        return None

def to_region_code(country: Optional[str]) -> Optional[str]:
    """임의 문자열 → ISO-2 (다국어/별칭/퍼지 매칭 포함). 실패 시 None."""
    if not country:
        return None
    raw = country.strip()

    # 이미 ISO-2
    if re.fullmatch(r"[A-Za-z]{2}", raw):
        return raw.upper()

    # 한글 별칭
    if raw in COUNTRY_TO_REGION:
        return COUNTRY_TO_REGION[raw]
    cleaned = clean_country_ko(raw)
    if cleaned in COUNTRY_TO_REGION:
        return COUNTRY_TO_REGION[cleaned]

    # 현지어 별칭
    key = strip_diacritics(raw.lower())
    if key in ALIAS_TO_ALPHA2:
        return ALIAS_TO_ALPHA2[key]

    # pycountry
    iso = _lookup_iso_alpha2(raw) or _lookup_iso_alpha2(cleaned) or _lookup_iso_alpha2(key)
    if iso:
        return iso

    # 퍼지 매칭
    try:
        names = []
        for c in pycountry.countries:
            names.extend([c.name, getattr(c, "common_name", ""), getattr(c, "official_name", "")])
        names = [n for n in set(names) if n]
        cand = difflib.get_close_matches(raw, names, n=1, cutoff=0.82)
        if cand:
            iso = _lookup_iso_alpha2(cand[0])
            if iso:
                return iso
    except Exception:
        pass

    return None

def languages_for(region_code: Optional[str]) -> List[str]:
    """해당 국가에서 우선 시도할 언어 목록."""
    if region_code and region_code in COUNTRY_LANG_HINT:
        # 중복 제거 + 영어/한국어 보장
        base = COUNTRY_LANG_HINT[region_code] + ["en", "ko"]
        seen, out = set(), []
        for x in base:
            if x not in seen:
                out.append(x); seen.add(x)
        return out
    return ["ko", "en", "ja", "zh-CN", "fr", "es", "ar", "ru"]
