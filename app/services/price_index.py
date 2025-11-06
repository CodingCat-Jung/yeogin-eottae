# app/services/price_index.py
from __future__ import annotations
from typing import Optional

# 맨 위 근처에 추가
ISO3_TO_ISO2 = {
    "USA":"US","CAN":"CA","MEX":"MX",
    "FRA":"FR","DEU":"DE","GBR":"GB","ESP":"ES","ITA":"IT","CHE":"CH","CZE":"CZ","POL":"PL","HUN":"HU","PRT":"PT","GRC":"GR",
    "AUS":"AU","NZL":"NZ",
    "KOR":"KR","JPN":"JP","TWN":"TW","CHN":"CN","HKG":"HK","SGP":"SG","THA":"TH","VNM":"VN","MYS":"MY","IDN":"ID","PHL":"PH","IND":"IN",
    # 필요하면 계속 보강
}

def _norm_cc(cc: Optional[str]) -> Optional[str]:
    if not cc:
        return None
    s = cc.strip().upper()
    if len(s) == 3 and s in ISO3_TO_ISO2:
        return ISO3_TO_ISO2[s]
    if len(s) == 2:
        return s
    return None

def get_price_index(*, city: str | None, country_code: str | None, continent: str | None) -> float:
    # 1) 도시 오버라이드
    if city:
        key = city.strip().lower()
        if key in CITY_OVERRIDES:
            return CITY_OVERRIDES[key]
    # 2) 국가 코드(ISO2/ISO3 모두 허용)
    cc2 = _norm_cc(country_code)
    if cc2 and cc2 in PRICE_INDEX_BY_CC:
        return float(PRICE_INDEX_BY_CC[cc2])
    # 3) 대륙 평균
    if continent and continent in CONTINENT_DEFAULTS:
        return float(CONTINENT_DEFAULTS[continent])
    # 4) 폴백
    return 1.0

# 대륙 평균 (체류비 상대지수; 항공/비자/보험 제외)
CONTINENT_DEFAULTS = {
    "AS": 0.95,  # 아시아
    "EU": 1.35,  # 유럽
    "NA": 1.50,  # 북미
    "SA": 0.85,  # 남미
    "OC": 1.40,  # 오세아니아
    "AF": 0.70,  # 아프리카
}

# 초고가 도시 오버라이드
CITY_OVERRIDES = {
    "zurich": 2.00, "geneva": 1.95, "reykjavik": 1.80,
    "london": 1.60, "paris": 1.55,
    "singapore": 1.60, "hong kong": 1.50,
}

# 국가 코드별 상대지수 (한국=1.00 대비)
PRICE_INDEX_BY_CC = {
    # ── ASIA
    "KR": 1.00, "JP": 1.10, "TW": 0.95, "CN": 0.95,
    "HK": 1.50, "SG": 1.60,
    "TH": 0.70, "VN": 0.65, "MY": 0.75, "ID": 0.65, "PH": 0.70,
    "KH": 0.60, "LA": 0.55, "IN": 0.50, "NP": 0.45, "LK": 0.60,
    # ── EUROPE
    "CH": 1.90, "NO": 1.70, "IS": 1.80, "DK": 1.55, "SE": 1.45, "FI": 1.35,
    "GB": 1.55, "IE": 1.55, "FR": 1.50, "DE": 1.40, "NL": 1.45, "BE": 1.40,
    "AT": 1.45, "IT": 1.35, "ES": 1.20, "PT": 1.15, "GR": 1.15,
    "CZ": 1.20, "PL": 1.05, "HU": 0.95, "RO": 0.90, "BG": 0.85, "HR": 1.15,
    # ── AMERICAS
    "US": 1.60, "CA": 1.40, "MX": 0.75,
    "BR": 0.75, "AR": 0.70, "CL": 0.95, "PE": 0.65, "CO": 0.60,
    # ── OCEANIA
    "AU": 1.45, "NZ": 1.35, "FJ": 0.90,
    # ── AFRICA
    "ZA": 0.65, "MA": 0.60, "EG": 0.45, "KE": 0.55, "TZ": 0.55, "TN": 0.55,
}


