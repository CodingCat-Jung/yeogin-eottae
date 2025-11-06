# app/services/country_matcher.py
from __future__ import annotations
import re
from typing import Dict, Iterable, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

# 선택적 퍼지 매칭(설치돼 있으면 자동 사용)
try:
    from rapidfuzz import fuzz, process  # type: ignore
    _HAS_FUZZ = True
except Exception:  # pragma: no cover
    _HAS_FUZZ = False

# emergency_contacts 테이블명 (다르면 바꾸세요)
TABLE = "emergency_contacts"

# 흔한 별칭/동의어(영/한/현지어 표기)
ALIAS: Dict[str, str] = {
    "JP": "japan;日本;일본;nihon;nippon",
    "US": "usa;united states;united states of america;미국;america;u.s.;u.s.a",
    "FR": "france;français;프랑스",
    "TH": "thailand;泰国;태국",
    "VN": "vietnam;viet nam;ベトナム;베트남",
    "DE": "germany;deutschland;독일",
    "IT": "italy;italia;이탈리아",
    "ES": "spain;españa;스페인",
    "GB": "united kingdom;uk;england;britain;great britain;영국",
    "AU": "australia;호주",
    "CA": "canada;캐나다",
    "MX": "mexico;méxico;멕시코",
    "CN": "china;中国;중국;prc",
    "TW": "taiwan;台灣;대만;taipei",
    "PH": "philippines;필리핀",
    "SG": "singapore;싱가포르",
    "TR": "turkiye;turkey;튀르키예;터키",
    "AE": "uae;united arab emirates;dubai;아랍에미리트;두바이",
    "CH": "switzerland;schweiz;svizzera;スイス;스위스",
    "BE": "belgium;belgië;belgique;벨기에",
    "IE": "ireland;아일랜드",
    "NL": "netherlands;holland;네덜란드",
    "AT": "austria;österreich;오스트리아",
    "CZ": "czech;czechia;체코",
    "PT": "portugal;포르투갈",
    "GR": "greece;ελλάδα;그리스",
    "NO": "norway;norge;노르웨이",
    "SE": "sweden;sverige;스웨덴",
    "FI": "finland;suomi;핀란드",
    "HR": "croatia;크로아티아",
    "PL": "poland;polska;폴란드",
    "HU": "hungary;magyarország;헝가리",
    "NZ": "new zealand;aotearoa;뉴질랜드",
    "FJ": "fiji;피지",
    "AR": "argentina;아르헨티나",
    "CL": "chile;칠레",
    "PE": "peru;페루",
    "BR": "brazil;brasil;브라질",
    "CU": "cuba;쿠바",
    "ZA": "south africa;남아프리카;남아공",
    "KE": "kenya;케냐",
    "EG": "egypt;이집트",
    "MA": "morocco;maroc;المغرب;모로코",
    "IN": "india;인도",
    "ID": "indonesia;인도네시아",
    "MY": "malaysia;말레이시아",
    "KH": "cambodia;캄보디아",
    "LA": "laos;라오스",
    "HK": "hong kong;香港;홍콩",
    "MO": "macau;macao;澳門;마카오",
}

_NORM_RE = re.compile(r"[^\w\s가-힣]+", re.UNICODE)
_WS_RE = re.compile(r"\s+", re.UNICODE)

def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    s = _NORM_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s)
    return s.strip()

def _is_iso2(s: str) -> bool:
    return bool(re.fullmatch(r"[a-zA-Z]{2}", s or ""))

def _fetch_contacts(db: Session):
    rows = db.execute(text(f"""
        SELECT country_code, country_name
        FROM {TABLE}
    """)).fetchall()
    return [(str(r[0]), str(r[1])) for r in rows]

def _build_index(db: Session) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    returns:
      - name_to_code: 정규화된 이름/별칭 -> ISO2
      - code_to_name: ISO2 -> DB의 country_name
    """
    name_to_code: Dict[str, str] = {}
    code_to_name: Dict[str, str] = {}

    for code, name in _fetch_contacts(db):
        code_u = code.upper()
        code_to_name[code_u] = name
        name_to_code[_norm(name)] = code_u

    for code, aliases in ALIAS.items():
        for a in aliases.split(";"):
            key = _norm(a)
            if key and key not in name_to_code:
                name_to_code[key] = code

    return name_to_code, code_to_name

def match_country_code(db: Session, raw_country: str) -> Optional[str]:
    """
    나라명(영/한/현지어/혼합)을 ISO2 코드로 매칭.
    우선순위:
      1) ISO2 그대로
      2) DB country_name 정규화 일치
      3) 별칭 사전 일치
      4) (선택) 퍼지 매칭
      5) 느슨한 부분 포함
    """
    if not raw_country:
        return None

    s = raw_country.strip()
    if _is_iso2(s):
        return s.upper()

    name_to_code, _ = _build_index(db)
    key = _norm(s)

    if key in name_to_code:
        return name_to_code[key]

    if _HAS_FUZZ and name_to_code:
        candidates = list(name_to_code.keys())
        best = process.extractOne(key, candidates, scorer=fuzz.WRatio)  # type: ignore
        if best and best[1] >= 88:
            return name_to_code[best[0]]

    cleaned = re.sub(r"\b(the|republic|of|aka|aka\.)\b", " ", key).strip()
    cleaned = _WS_RE.sub(" ", cleaned)
    if cleaned and cleaned != key:
        for k, code in name_to_code.items():
            if cleaned in k or k in cleaned:
                return code

    return None
