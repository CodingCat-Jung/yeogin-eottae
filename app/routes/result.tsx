// app/routes/result.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  TriangleAlert,
  CircleArrowLeft,
  Home,
  Clock,
  Train,
  Bus,
  Footprints,
  Car,
  ChevronDown,
  ChevronUp,
  Copy,
  PlaneTakeoff,
  BedDouble,   // ← 추가
  Globe,       // ← 추가
} from "lucide-react";
import { getTravelMonthInt, monthToSeason } from "@/store/travelStore";

/* ✅ Mapbox */
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/* =========================
 * Types
 * ========================= */
type Activity = { time: string; activity: string };
type CitySchedule = Record<string, Activity[]>;

type Recommendation = {
  city: string;
  country: string;
  reason: string;
  lodging_area?: string;

  lodging?: {
    areas?: Array<{
      name_original: string;
      name_ko?: string;
      lat?: number;
      lng?: number;
      why?: string;
      budget_hint?: "저예산" | "중간" | "상위";
    }>;
    hotels?: Array<{
      name_original: string;
      name_ko?: string;
      lat?: number;
      lng?: number;
      why?: string;
      price_tier?: "저예산" | "중간" | "상위";
      booking_query?: string;
      agoda_query?: string;
    }>;
  };

  schedule: CitySchedule;
  allPlaces?: Array<{
    id: string;
    name?: string;
    name_ko?: string;
    name_original?: string;
    lat: number;
    lng: number;
    category?: string;
  }>;
  days?: Array<{ dateOffset?: number; stops?: Array<{ lat: number; lng: number }> }>;
};



/* =========================
 * Category 변환 (영→한, 강화판)
 * ========================= */
function categoryKo(raw: unknown): string {
  if (raw == null) return "기타";
  let s = String(raw).trim();
  if (/[가-힣]/.test(s)) return s; // 이미 한글이면 그대로

  const key = s
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const dict: Record<string, string> = {
    "restaurant": "음식점",
    "japanese restaurant": "일식당",
    "ramen": "라멘",
    "sushi": "스시",
    "cafe": "카페",
    "bar": "바/술집",
    "nightlife": "나이트라이프",
    "department store": "백화점",
    "shopping mall": "쇼핑몰",
    "shopping": "쇼핑",
    "souvenir shop": "기념품점",
    "convenience store": "편의점",
    "supermarket": "슈퍼마켓",
    "market": "시장",
    "government office": "공공기관",
    "post office": "우체국",
    "police": "경찰서",
    "hospital": "병원",
    "pharmacy": "약국",
    "hotel": "호텔",
    "hostel": "호스텔",
    "guest house": "게스트하우스",
    "tourist attraction": "관광명소",
    "attraction": "명소",
    "landmark": "명소",
    "museum": "박물관",
    "art museum": "미술관",
    "gallery": "갤러리",
    "park": "공원",
    "theme park": "테마파크",
    "aquarium": "아쿠아리움",
    "zoo": "동물원",
    "temple": "사원",
    "shrine": "신사",
    "church": "교회",
    "cathedral": "대성당",
    "beach": "해변",
    "mountain": "산",
    "lake": "호수",
    "river": "강",
    "garden": "정원",
    "observation deck": "전망대",
    "station": "역",
    "airport": "공항",
    "bus terminal": "버스터미널",
  };

  if (dict[key]) return dict[key];

  // 부분 포함(contains) 규칙
  const contains: Array<[RegExp, string]> = [
    [/department\s*store/, "백화점"],
    [/shopping\s*mall|mall/, "쇼핑몰"],
    [/souvenir/, "기념품점"],
    [/convenience/, "편의점"],
    [/government|city hall|ward office|prefectural office/, "공공기관"],
    [/museum|gallery|art/, "박물관/미술관"],
    [/attraction|landmark|tourist/, "관광명소"],
    [/temple|shrine/, "사원/신사"],
    [/park|garden/, "공원/정원"],
    [/aquarium/, "아쿠아리움"],
    [/zoo/, "동물원"],
    [/ramen|noodle/, "라멘"],
    [/sushi/, "스시"],
    [/hotel|hostel|guest\s*house/, "숙소"],
    [/station/, "역"],
    [/airport/, "공항"],
  ];
  for (const [re, ko] of contains) {
    if (re.test(key)) return ko;
  }

  return "기타";
}


/* =========================
 * Small utils
 * ========================= */
const getCookie = (name: string) => {
  const v = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
  return v ? decodeURIComponent(v) : null;
};

// ===== geo utils: 도시 경계/거리 =====
type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function expandBBox(b: BBox, ratio = 0.25): BBox {
  const dw = (b.maxLng - b.minLng) * ratio;
  const dh = (b.maxLat - b.minLat) * ratio;
  return { minLng: b.minLng - dw, minLat: b.minLat - dh, maxLng: b.maxLng + dw, maxLat: b.maxLat + dh };
}

function inBBox(lng: number, lat: number, b: BBox) {
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
/** 호텔 이름 정규화(한/영, 공백/기호/대소문자) */
function normalizeHotelName(name?: string) {
  return (name || "")
    .toLowerCase()
    .replace(/[()［］\[\]{}]/g, " ")
    .replace(/hotel|hostel|inn|resort|guest\s*house|bnb|게스트하우스|호스텔|호텔|리조트/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 호텔 중복 제거: (1) 이름 유사 + (2) 150m 이내 좌표 → 하나만 유지 */
function dedupeHotels<T extends { name_ko?: string; name_original?: string; lat?: number; lng?: number }>(
  arr: T[],
  opts: { byMeters?: number } = {}
): T[] {
  if (!Array.isArray(arr) || arr.length <= 1) return arr || [];
  const MAX_M = opts.byMeters ?? 150;

  const out: T[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < arr.length; i++) {
    if (taken.has(i)) continue;

    const a = arr[i];
    const aName = normalizeHotelName(a.name_ko || a.name_original || "");
    const aHasCoord = typeof a.lat === "number" && typeof a.lng === "number";

    // 후보군 중 ‘같은 호텔 같은 곳’으로 보이는 것들 수집
    let bestIdx = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (taken.has(j)) continue;

      const b = arr[j];
      const bName = normalizeHotelName(b.name_ko || b.name_original || "");

      // 이름이 거의 동일해야만 중복 판단
      const sameName = aName && bName && (aName === bName || aName.includes(bName) || bName.includes(aName));
      if (!sameName) continue;

      // 좌표가 둘 다 있으면 거리로 검증
      const bothHave = aHasCoord && typeof b.lat === "number" && typeof b.lng === "number";
      if (bothHave) {
        const d = haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)) * 1000;
        if (d > MAX_M) continue; // 150m 초과면 다른 지점으로 간주
      }

      // 대표 선정 규칙: 좌표 있는 쪽 > name_ko 있는 쪽 > 기존
      const best = arr[bestIdx];
      const bestHasCoord = typeof (best as any).lat === "number" && typeof (best as any).lng === "number";
      const bHasKo = !!b.name_ko;

      if (!bestHasCoord && (typeof b.lat === "number" && typeof b.lng === "number")) {
        bestIdx = j;
      } else if (!best.name_ko && bHasKo) {
        bestIdx = j;
      }
      taken.add(j);
    }

    taken.add(bestIdx);
    out.push(arr[bestIdx]);
  }

  return out;
}


// Small utils 아래 아무 곳
const placeLabel = (p: any) =>
  (p.display_name && String(p.display_name).trim()) ||
  (p.name_ko && String(p.name_ko).trim()) ||
  (p.name_en && String(p.name_en).trim()) ||
  (p.name && String(p.name).trim()) ||
  (p.name_original && String(p.name_original).trim()) ||
  "Unknown POI";


/** 간단 문자열 정규화 */
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[()［］\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 스케줄(day별) 텍스트를 합친 배열을 만든다. (0=1일차, 1=2일차, ...) */
function makeDayTexts(schedule: CitySchedule): string[] {
  const dayKeys = Object.keys(schedule).sort((a, b) => a.localeCompare(b));
  return dayKeys.map((k) => norm((schedule[k] || []).map(a => a.activity).join(" ")));
}

/** 포인트 이름이 day 텍스트에 등장하는지(느슨한 포함) */
function isMentionedInDay(p: any, dayText: string): boolean {
  const candidates = [
    p.name_ko, p.name, p.name_original
  ].map((x: any) => norm(String(x || ""))).filter(Boolean);

  return candidates.some((nm) => nm.length >= 2 && dayText.includes(nm));
}

/** 좌표/이름 기준 중복 제거 */
function dedupePlaces<T extends { lat: number; lng: number }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const key = `${it.lat.toFixed(6)}|${it.lng.toFixed(6)}|${norm(placeLabel(it as any))}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/** ====== 공항/숙소 판별 & 강제 재배치 유틸 ====== */
function looksAirportName(name?: string) {
  if (!name) return false;
  const s = String(name).toLowerCase();

  // 다양한 표기: 공항/에어포트/airport/intl./international/유럽어…
  if (
    /(airport|air\s*port|intl\.?|international|공항|에어포트|aéroport|aeroport|aeropuerto|aeroporto|aerodrom)/i.test(s)
  ) {
    return true;
  }

  // 이름에 IATA 코드 패턴 (예: (DEN), (YUL))
  if (/[（(]\s*[A-Z]{3}\s*[)）]/.test(String(name))) return true;

  return false;
}

function isAirportPoi(p: any) {
  const cat = String(p?.category || "").toLowerCase();
  const name = (p?.name_ko || p?.name || p?.name_original || "") as string;
  // category가 애매(기타)여도 이름으로 확정
  return cat === "airport" || looksAirportName(name);
}

function isLodgingPoi(p: any) {
  const cat = String(p?.category || "").toLowerCase();
  const name = (p?.name_ko || p?.name || p?.name_original || "") as string;
  return (
    /lodging|accommodation|hotel|hostel|guest\s*house|inn|resort/i.test(cat) ||
    /(호텔|호스텔|게스트하우스|료칸|여관)/.test(name) ||
    /(hotel|hostel|guest\s*house|inn|resort|ryokan|bnb)/i.test(name)
  );
}

/** 대표 숙소 하나 뽑기: 1) lodging.hotels[0] → 2) allPlaces 중 숙소성 → 3) null */
function pickRepresentativeLodgingHard(rec: Recommendation) {
  const h = rec.lodging?.hotels?.[0];
  if (h && !isAirportPoi(h)) {
    const label = (h.name_ko || h.name_original || "").trim();
    if (label) return { label, lat: h.lat, lng: h.lng };
  }
  const fromPlaces = (rec.allPlaces || []).find((p) => isLodgingPoi(p) && !isAirportPoi(p));
  if (fromPlaces) {
    const label =
      (fromPlaces.name_ko || fromPlaces.name || fromPlaces.name_original || "").trim();
    if (label) return { label, lat: fromPlaces.lat, lng: fromPlaces.lng };
  }
  return null;
}

/**
 * allPlaces를 강제로 정리:
 *   [공항(dep?)] → [대표 숙소(1개)] → [기타(숙소/공항 제외)] → [공항(arr?)]
 *   + 숙소 중복 제거(대표 1개만 유지)
 */
function enforceLodgingSecondFrontend(rec: Recommendation) {
  const aps = [...(rec.allPlaces || [])];

  // dep/arr 식별(백엔드가 id를 안줄 수도 있어서 보완)
  const airports = aps.filter((p) => isAirportPoi(p));
  const dep = airports.find((p) => (p.id === "airport_dep") ) || airports[0];
  const arr = airports.find((p) => (p.id === "airport_arr") ) || (airports.length > 1 ? airports[1] : undefined);

  const rep = pickRepresentativeLodgingHard(rec); // 대표 숙소(라벨/좌표)

  // 기타: 공항/숙소성 제거
  const others = aps.filter((p) => !isAirportPoi(p) && !isLodgingPoi(p));

  const newAps: any[] = [];
  if (dep) newAps.push(dep);
  if (rep) {
    newAps.push({
      id: "lodging_main",
      name_ko: rep.label,
      name_original: rep.label,
      category: "lodging",
      role: "lodging_representative",
      lat: rep.lat,
      lng: rep.lng,
    });
  }
  newAps.push(...others);
  if (arr) newAps.push(arr);

  // 좌표/이름 기준 중복 정리
  rec.allPlaces = dedupePlaces(newAps);

  // pickLodging 이 없을 때를 대비해서 lodging.hotels가 비어있으면 대표를 1개 꽂아줌
  if (rep && (!rec.lodging || !(rec.lodging.hotels && rec.lodging.hotels.length))) {
    rec.lodging = {
      ...(rec.lodging || {}),
      hotels: [
        {
          name_original: rep.label,
          name_ko: rep.label,
          lat: rep.lat,
          lng: rep.lng,
        },
      ],
    };
  }

  return rec;
}


const CSRF_COOKIE_CANDIDATES = ["csrf_access_token", "csrftoken", "csrf_token", "XSRF-TOKEN"];

function parseMode(text: string): "train" | "bus" | "walk" | "car" | undefined {
  if (/(전철|지하철|기차|train)/i.test(text)) return "train";
  if (/(버스|bus)/i.test(text)) return "bus";
  if (/(도보|walk)/i.test(text)) return "walk";
  if (/(자가|차|택시|car)/i.test(text)) return "car";
  return undefined;
}

function ModeIcon({ mode }: { mode?: "train" | "bus" | "walk" | "car" }) {
  const cls = mode ? "text-violet-600" : "text-gray-400";
  if (mode === "train") return <Train size={16} className={cls} />;
  if (mode === "bus") return <Bus size={16} className={cls} />;
  if (mode === "walk") return <Footprints size={16} className={cls} />;
  if (mode === "car") return <Car size={16} className={cls} />;
  return <Clock size={16} className="text-gray-400" />;
}

function dayLabel(key: string) {
  const m = key.match(/day[_\s-]*(\d+)/i);
  if (m) return `${m[1]}일차`;
  if (/night.*days/i.test(key)) return "요약";
  return key.replace(/_/g, " ");
}

function toKRWString(budget: string) {
  const num = budget.replace(/[^\d]/g, "");
  if (!num) return budget;
  return `₩${Number(num).toLocaleString()}`;
}

/** 월 문자열 통일 (예: "2025-11" | "11" | "11월" | "Nov" | "flexible") → "11월" / "시기 유연" */
function toMonthKR(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "flexible") return "시기 유연";
  const s = raw.trim();
  const mY = s.match(/^(\d{4})[-/](\d{1,2})$/);
  const mOnly = s.match(/^(\d{1,2})$/);
  const mKor = s.match(/^(\d{1,2})\s*월$/);
  if (mY) return `${Number(mY[2])}월`;
  if (mOnly) return `${Number(mOnly[1])}월`;
  if (mKor) return `${Number(mKor[1])}월`;
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const key = s.slice(0, 3).toLowerCase();
  return map[key] ? `${map[key]}월` : s;
}

function scheduleToText(rec: Recommendation) {
  const lines: string[] = [];
  lines.push(`${rec.city}, ${rec.country}`);
  lines.push(rec.reason);
  Object.entries(rec.schedule).forEach(([day, acts]) => {
    lines.push(`\n[${dayLabel(day)}]`);
    acts.forEach((a) => lines.push(`${a.time} - ${a.activity}`));
  });
  return lines.join("\n");
}

/** schedule 응답이 배열([{day, activities}]) 또는 객체일 때 모두 안전하게 CitySchedule로 정규화 */
function normalizeSchedule(s: any): CitySchedule {
  if (Array.isArray(s)) {
    return s.reduce((acc: CitySchedule, d: any, idx: number) => {
      const key = d?.day ? String(d.day) : `day_${idx + 1}`;
      const acts = Array.isArray(d?.activities) ? d.activities : [];
      acc[key] = acts.map((a: any) => ({
        time: String(a?.time ?? ""),
        activity: String(a?.activity ?? ""),
      }));
      return acc;
    }, {});
  }
  return s && typeof s === "object" ? (s as CitySchedule) : {};
}

/** 호텔/지역 이름을 메타서치용으로 정제 */
function normalizeHotelQuery(q: string) {
  return (q || "")
    // 대괄호/원형 괄호 내용 제거
    .replace(/[［\[][^］\]]+[］\]]/g, "")
    .replace(/[()（）]/g, " ")
    // 메타서치에 쓸모없는 단어 제거
    .replace(/\b(예약|특가|할인|최저가)\b/gi, " ")
    .replace(/\b(체크인|체크아웃|체크 인|체크 아웃)\b/gi, " ")
    .replace(/\b(숙소|추천|지역|검색|보기)\b/gi, " ")
    // 다중 공백 정리
    .replace(/\s+/g, " ")
    .trim();
}
// === 새로 추가 ===
type SearchKind = "hotel" | "area";

/** 통일된 검색 키워드 생성 */
function buildLodgingKeyword(city: string, name: string, kind: SearchKind = "hotel") {
  const base = normalizeHotelQuery(name || "");
  // 호텔은 정확히 맞추기 위해 따옴표로 감싸고, 권역은 일반 키워드
  return kind === "hotel" ? `${city} "${base}"` : `${city} ${base}`;
}


/** Booking 일반 검색 (호텔명/지역명 모두 지원) */
function openBookingSearch(query: string, opts?: { checkin?: string; checkout?: string; adults?: string }) {
  const checkin = (opts?.checkin || localStorage.getItem("departDate") || "").trim();
  const checkout = (opts?.checkout || localStorage.getItem("returnDate") || "").trim();
  const adults = (opts?.adults || localStorage.getItem("adults") || "2").trim();

  const params = new URLSearchParams({
    ss: normalizeHotelQuery(query),
    lang: "ko",
    selected_currency: "KRW",
    group_adults: adults || "2",
    no_rooms: "1",
    group_children: "0",
  });
  // 날짜가 없으면 붙이지 않아야 404 회피
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkin) && /^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    params.set("checkin", checkin);
    params.set("checkout", checkout);
  }
  window.open(`https://www.booking.com/searchresults.html?${params.toString()}`, "_blank", "noopener,noreferrer");
}

/** Agoda 일반 검색 (키워드 기반; 도시 ID 없이도 강제 검색) */
/** Agoda 일반 검색(키워드 강제 검색; 여러 키 동시 세팅) */
function openAgodaSearch(
  query: string,
  opts?: { checkin?: string; checkout?: string; adults?: string }
) {
  const checkIn = (opts?.checkin || localStorage.getItem("departDate") || "").trim();
  const checkOut = (opts?.checkout || localStorage.getItem("returnDate") || "").trim();
  const adults = (opts?.adults || localStorage.getItem("adults") || "2").trim();

  const q = normalizeHotelQuery(query);

  // los(숙박일수) 계산: 유효한 날짜면 실제 차이, 아니면 1박 기본
  let los = 1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    try {
      const d1 = new Date(checkIn);
      const d2 = new Date(checkOut);
      const diff = Math.round((+d2 - +d1) / (1000 * 60 * 60 * 24));
      if (diff > 0) los = diff;
    } catch {/* noop */}
  }

  const params = new URLSearchParams({
    // ▶ 검색 키워드 관련: 일부 세션에서 특정 키만 인식하는 문제가 있어 여러 개 동시 세팅
    text: q,            // 신버전에서 주로 인식
    query: q,           // 일부 케이스 fallback
    q,                  // 또 다른 fallback
    SearchText: q,      // 매우 옛날 케이스 fallback

    // ▶ 강제 검색 플래그 & 도시 미지정
    searchrequest: "true",
    city: "-1",

    // ▶ 날짜/인원
    locale: "ko-kr",
    currencyCode: "KRW",
    numberOfRooms: "1",
    rooms: "1",
    numberOfAdults: adults || "2",
    adults: adults || "2",

    // ▶ los(숙박일수) – checkOut 대신 일부 환경에서 더 잘 먹음
    los: String(los),
  });

  // 날짜가 유효하면 checkIn/checkOut도 함께 전달(지원되는 세션에서 사용)
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) params.set("checkIn", checkIn);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) params.set("checkOut", checkOut);

  const url = `https://www.agoda.com/ko-kr/search?${params.toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
}



/** “숙소 예약하기” (권역만 있을 때) */
function openHotels(city: string, areaHint?: string | null) {
  const base = areaHint && areaHint.trim() ? `${city} ${areaHint.trim()}` : city;
  openBookingSearch(base);
}

function openHotelBook(
  city: string,
  hotelName: string,
  opts?: { bookingQuery?: string; agodaQuery?: string }
) {
  // 우선순위: booking_query > agoda_query > 호텔명
  const raw = opts?.bookingQuery || opts?.agodaQuery || hotelName || "";
  let query = normalizeHotelQuery(raw);

  // 정제 후 비었거나 너무 짧거나 불용어만 남았으면 호텔명으로 폴백
  if (
    !query ||
    query.length < 2 ||
    /^(체크인|체크아웃|예약|숙소|지역)$/i.test(query)
  ) {
    query = normalizeHotelQuery(hotelName);
  }

  const full = `${city} ${query}`.trim();

  // 1) Booking
  openBookingSearch(full);
  // 2) Agoda 보조
  openAgodaSearch(full);
}

/** 호텔/지역 쿼리 정제(공통) */
function normalizePlaceQuery(city: string, name: string, kind: "hotel" | "area") {
  const base = normalizeHotelQuery(name || "").trim();
  if (!base) return city; // 폴백
  if (kind === "hotel") return `${city} ${base}`;
  // area일 때는 "호텔" 키워드를 살짝 넣어 검색 성능↑
  return `${city} ${base} 호텔`;
}

/** Booking 통합 */
function openBookingSearchUnified(city: string, name: string, kind: "hotel" | "area") {
  const checkin = (localStorage.getItem("departDate") || "").trim();
  const checkout = (localStorage.getItem("returnDate") || "").trim();
  const adults = (localStorage.getItem("adults") || "2").trim();

  const ss = normalizePlaceQuery(city, name, kind);
  const params = new URLSearchParams({
    ss,
    lang: "ko",
    selected_currency: "KRW",
    group_adults: adults || "2",
    no_rooms: "1",
    group_children: "0",
  });
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkin) && /^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    params.set("checkin", checkin);
    params.set("checkout", checkout);
  }
  window.open(`https://www.booking.com/searchresults.html?${params.toString()}`, "_blank", "noopener,noreferrer");
}

/** Agoda 통합 */
function openAgodaSearchUnified(city: string, name: string, kind: "hotel" | "area") {
  const checkIn = (localStorage.getItem("departDate") || "").trim();
  const checkOut = (localStorage.getItem("returnDate") || "").trim();
  const adults = (localStorage.getItem("adults") || "2").trim();

  // Agoda는 text만 전달되면 지역일 때 종종 폼만 열려요. area에는 'hotel near' 힌트를 추가.
  const text = kind === "hotel"
    ? normalizePlaceQuery(city, name, "hotel")
    : `${city} ${normalizeHotelQuery(name)} 호텔 근처`;

  const params = new URLSearchParams({
    text: text.trim(),
    locale: "ko-kr",
    currencyCode: "KRW",
    numberOfAdults: adults || "2",
    numberOfRooms: "1",
  });
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
  }
  window.open(`https://www.agoda.com/ko-kr/search?${params.toString()}`, "_blank", "noopener,noreferrer");
}

/** Google Maps 통합 */
function openGoogleMapHotel(city: string, name: string, lat?: number, lng?: number, kind: "hotel" | "area" = "hotel") {
  const query = normalizeHotelQuery(name || "");
  if (typeof lat === "number" && typeof lng === "number") {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || city)}&center=${lat},${lng}&zoom=17`,
      "_blank", "noopener,noreferrer"
    );
    return;
  }
  const q = kind === "hotel"
    ? `${city} "${query}"`
    : `${city} ${query} 호텔`;
  window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
}

/* ✈️ 항공권 CTA */
function openFlights(dstCity: string, dstIataHint?: string) {
  const origin = (localStorage.getItem("originAirport") || "ICN").toUpperCase();
  const dep = localStorage.getItem("departDate") || "";
  const ret = localStorage.getItem("returnDate") || "";
  const dst = (dstIataHint || dstCity).toUpperCase();
  const url =
    dep && ret && /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(dst)
      ? `https://www.google.com/travel/flights?hl=ko#flt=${origin}.${dst}.${dep}*${dst}.${origin}.${ret}`
      : `https://www.google.com/travel/flights?hl=ko&curr=KRW&q=flights%20from%20${origin}%20to%20${encodeURIComponent(
        dstCity
      )}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function lodgingHintFromSchedule(rec: Recommendation): string | undefined {
  if (rec.lodging_area && rec.lodging_area.trim()) {
    return cleanAreaHint(rec.lodging_area) || undefined;
  }

  const keys = Object.keys(rec.schedule).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    for (const a of rec.schedule[k] ?? []) {
      if (!a?.activity) continue;
      const m =
        a.activity.match(/추천\s*숙소\s*지역[:\-\s]*([^\(\)]+?)(?:\(|$)/) ||
        a.activity.match(/숙소\s*(?:체크인|배정)[:\-\s]*([^\(\)]+?)(?:\(|$)/) ||
        a.activity.match(/(?:호텔|호스텔|게스트하우스)\s*[:\-\s]*([^\(\)]+?)(?:\(|$)/);
      if (m && m[1]) {
        const cleaned = cleanAreaHint(m[1]);
        if (cleaned) return cleaned;
      }
    }
  }
  return undefined;
}
/** 이름에 '호텔/inn/hostel/ryokan' 등 들어가면 호텔로 간주 */
function looksLikeHotelName(name?: string) {
  if (!name) return false;
  const k = name.toLowerCase();
  return /(hotel|inn|hostel|resort|ryokan|bnb|guest\s*house)/i.test(k) || /호텔|호스텔|인|료칸|게스트하우스/.test(name);
}

type LodgingPick =
  | { kind: "hotel"; label: string; lat?: number; lng?: number }
  | { kind: "area"; label: string };

/** 추천 응답에서 '대표 숙소(호텔/지역)' 추출 */
// ✅ REPLACE 기존 pickLodging 전체를 아래 코드로 교체
function pickLodging(rec: Recommendation): LodgingPick | null {
  // mode 힌트 우선
  const mode: "hotels" | "area" | undefined = (rec.lodging as any)?.mode;

  // area 지시가 있으면 area 우선
  if (mode === "area") {
    const label =
      rec.lodging?.areas?.[0]?.name_ko ||
      rec.lodging?.areas?.[0]?.name_original ||
      rec.lodging_area ||
      "";
    const clean = cleanAreaHint(label || "");
    if (clean && !looksAirportName(clean)) return { kind: "area", label: clean };
  }

  // 호텔 우선(있으면)
  const hotels = rec.lodging?.hotels ?? [];
  if (Array.isArray(hotels) && hotels.length > 0) {
    const h0 = hotels[0];
    const label = (h0?.name_ko || h0?.name_original || "").trim();
    if (label && !looksAirportName(label)) {
      return { kind: "hotel", label, lat: h0?.lat, lng: h0?.lng };
    }
  }

  // POI에서 호텔처럼 보이는 것 (공항 제외)
  const poiHotel = (rec.allPlaces || []).find(
    (p) => isLodgingPoi(p) && !isAirportPoi(p)
  );
  if (poiHotel) {
    const label =
      (poiHotel.name_ko || poiHotel.name || poiHotel.name_original || "").trim();
    if (label && !looksAirportName(label)) {
      return { kind: "hotel", label, lat: poiHotel.lat, lng: poiHotel.lng };
    }
  }

  // 스케줄 텍스트에서 지역 추출(공항 같은 단어면 버림)
  const area = lodgingHintFromSchedule(rec);
  if (area && !looksAirportName(area)) return { kind: "area", label: area };

  return null;
}




/** 일정/문구에서 숙소 '지역'만 안전하게 추출 */
function cleanAreaHint(input: string): string | undefined {
  const raw = input.trim();

  // 1) 흔한 불용어/교통어구 제거
  const junkPatterns = [
    /JR\s*열차\s*이용/ig,
    /공항\s*열차/ig,
    /쾌속\s*에어포트/ig,
    /이용\s*권|이동\s*권/ig,
    /체크인|체크\-?아웃/ig,
    /숙소\s*추천\s*지역/ig,
    /숙소\s*배정/ig,
    /권역\s*추천/ig,
  ];
  let s = raw;
  junkPatterns.forEach((re) => { s = s.replace(re, ""); });

  // 2) 괄호 안 텍스트가 있으면 우선
  const paren = s.match(/[（(]([^()（）]+)[)）]/);
  if (paren?.[1]) s = paren[1].trim();

  // 3) 불필요 토큰 제거 및 공백 정리
  s = s
    .replace(/\b추천\b/g, "")
    .replace(/\b근처\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[·\-:\s]+|[·\-:\s]+$/g, "");

  // 4) 너무 짧거나 비의미적이면 버림
  if (!s || s.length < 2) return undefined;
  if (/^(JR|지하철|공항|역|중심|도심|센터|이용)$/i.test(s)) return undefined;

  return s;
}

function isProbablyHotelName(name: string): boolean {
  const k = name.toLowerCase();
  return /(hotel|hostel|inn|resort|ryokan|ryokan|bnb|guest\s*house)/i.test(k)
    || /호텔|호스텔|인|료칸|게스트하우스/i.test(name);
}


/* =========================
 * Pretty UI bits
 * ========================= */
function ResultHero({
                      duration,
                      budget,
                      transport,
                      month,
                    }: {
  duration: string;
  budget: string;
  transport: string;
  month?: string | null;
}) {
  const TransportText = transport === "public" ? "대중교통" : "자가용";

  const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-violet-700 backdrop-blur">
      {children}
    </span>
  );

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate overflow-hidden text-center pt-6 pb-8"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 flex justify-center">
        <div className="h-44 w-44 rounded-full bg-gradient-to-br from-violet-300/30 to-fuchsia-200/25 blur-3xl" />
      </div>

      <div className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-700 backdrop-blur">
        ✨ 여행 취향 기반 추천
      </div>

      <h1 className="mt-3 text-3xl md:text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
        당신만을 위한{" "}
        <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">여행지</span>
        를 추천해요
      </h1>

      <p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-gray-600">선택하신 정보를 바탕으로 어울리는 여행지를 골라봤어요</p>

      <div className="mt-4 flex items-center justify-center gap-2">
        {month ? <Chip>{month} 여행</Chip> : null}
        <Chip>{duration}</Chip>
        <Chip>{toKRWString(budget)}</Chip>
        <Chip>{TransportText} 기준</Chip>
      </div>

      <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-violet-400/50 via-fuchsia-400/50 to-violet-400/50" />
    </motion.header>
  );
}

function MetaChips({
                     duration,
                     budget,
                     transport,
                     month,
                   }: {
  duration: string;
  budget: string;
  transport: string;
  month?: string | null;
}) {
  const Tag = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-100">
      {children}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {month ? <Tag>{month} 여행</Tag> : null}
      <Tag>{duration}</Tag>
      <Tag>{toKRWString(budget)}</Tag>
      <Tag>{transport === "public" ? "대중교통" : "자가용"}</Tag>
    </div>
  );
}

function TimelineItem({ time, activity }: Activity) {
  const mode = parseMode(activity);
  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-1.5">
        <ModeIcon mode={mode} />
      </span>
      <span className="font-mono text-sm text-gray-600 mr-2">{time}</span>
      <span className="text-gray-800">{activity}</span>
    </li>
  );
}

function DaySection({
                      title,
                      activities,
                      defaultOpen = true,
                    }: {
  title: string;
  activities: Activity[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-left">
        <h3 className="font-semibold text-violet-700">{title}</h3>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <ul className="space-y-1 mt-2">
          {activities.map((a, i) => (
            <TimelineItem key={i} {...a} />
          ))}
        </ul>
      )}
      <div className="h-px bg-violet-100 mt-4" />
    </section>
  );
}
/* 🏨 숙소 추천 블록 (호텔/지역 자동 구분) */
function LodgingSection({ city, pick }: { city: string; pick: LodgingPick | null }) {
  if (!pick) return null;
  const isHotel = pick.kind === "hotel";
  const title = isHotel ? "추천 호텔" : "숙소 추천 지역";
  const sub = pick.label;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-4 bg-violet-50/60 border border-violet-100 rounded-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 text-violet-700">
          <BedDouble size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-violet-700">{title}</h4>
          <p className="text-sm text-gray-700 mt-1 leading-snug">{sub}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() =>
                isHotel
                  ? openBookingSearchUnified(city, sub, "hotel")
                  : openBookingSearchUnified(city, sub, "area")
              }
              className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
            >
              Booking.com 예약
            </button>
            <button
              onClick={() =>
                isHotel
                  ? openAgodaSearchUnified(city, sub, "hotel")
                  : openAgodaSearchUnified(city, sub, "area")
              }
              className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              Agoda 검색
            </button>
            <button
              onClick={() =>
                isHotel
                  ? openGoogleMapHotel(city, sub, (pick as any).lat, (pick as any).lng, "hotel")
                  : openGoogleMapHotel(city, sub, undefined, undefined, "area")
              }
              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition flex items-center gap-1"
            >
              <Globe size={12} /> 지도 보기
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}



function HotelCards({
                      city,
                      hotels,
                    }: {
  city: string;
  hotels?: Array<{
    name_original: string;
    name_ko?: string;
    lat?: number;
    lng?: number;
    why?: string;
    price_tier?: "저예산" | "중간" | "상위";
    booking_query?: string;
    agoda_query?: string;
  }> | undefined;
}) {
  // ✅ 안전망: 프론트에서 한 번 더 호텔 중복 제거(이름 유사 + 150m 이내)
  const list = useMemo(
    () => dedupeHotels(hotels || [], { byMeters: 150 }),
    [hotels]
  );

  if (!list || list.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <h4 className="text-sm font-bold text-violet-700">추천 호텔</h4>
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((h, i) => (
          <li key={i} className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-violet-700 mt-0.5">
                <BedDouble size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 truncate">
                  {h.name_ko || h.name_original}
                </div>
                <div className="text-[11px] text-gray-500">
                  {h.price_tier ? `가격대: ${h.price_tier}` : null}
                </div>
                {h.why ? (
                  <p className="text-sm text-gray-700 mt-1 line-clamp-3">{h.why}</p>
                ) : null}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const name = h.name_ko || h.name_original || "";
                      openBookingSearchUnified(city, name, "hotel"); // Booking
                      openAgodaSearchUnified(city, name, "hotel");   // Agoda
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border text-violet-700 border-violet-200 hover:bg-violet-50"
                  >
                    Booking으로 예약
                  </button>
                  <button
                    onClick={() =>
                      openGoogleMapHotel(
                        city,
                        h.name_ko || h.name_original || "",
                        h.lat,
                        h.lng,
                        "hotel"
                      )
                    }
                    className="text-xs px-2.5 py-1.5 rounded-lg border text-gray-700 border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
                  >
                    <Globe size={12} /> 지도
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}



/* =========================
 * ✅ MapView — 일자 필터 + 안정화(튀김 방지) + 마커 리디자인
 * ========================= */
function MapView({
                   city,
                   country,
                   schedule, // (UI 유지용)
                   allPlaces,
                   days,
                 }: {
  city: string;
  country: string;
  schedule: CitySchedule;
  allPlaces?: Recommendation["allPlaces"];
  days?: Recommendation["days"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  function getRootEl(): HTMLElement | null {
    return (mapRef.current?.getContainer() as HTMLElement) || null;
  }

  const DAY_COLORS = ["#6C3DF4", "#3B82F6", "#06B6D4", "#10B981", "#F59E0B"];
  const [activeDay, setActiveDay] = useState<number | "all">("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // ▼ 도시 경계/중심
  const [cityBox, setCityBox] = useState<BBox | null>(null);
  const [cityCenter, setCityCenter] = useState<[number, number] | null>(null); // [lng, lat]
  const [filteredOutCnt, setFilteredOutCnt] = useState(0);

  // 도시 경계(또는 중심) 가져오기 – Mapbox Geocoding
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const token = import.meta.env.VITE_MAPBOX_TOKEN as string;
        if (!token) return;
        const q = encodeURIComponent(`${city}${country ? ", " + country : ""}`);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=place&language=ko&limit=1&access_token=${token}`;
        const res = await fetch(url);
        const js = await res.json();
        const feat = (js?.features && js.features[0]) || null;
        if (aborted || !feat) return;

        if (Array.isArray(feat?.bbox) && feat.bbox.length === 4) {
          const [minLng, minLat, maxLng, maxLat] = feat.bbox;
          setCityBox({ minLng, minLat, maxLng, maxLat });
        }
        if (Array.isArray(feat?.center) && feat.center.length === 2) {
          const [lng, lat] = feat.center;
          setCityCenter([lng, lat]);
        }
      } catch {
        /* noop */
      }
    })();
    return () => {
      aborted = true;
    };
  }, [city, country]);

  // base places: dayIdx/idx 보강
  // ── [교체] basePlaces: allPlaces에 dayIdx를 "가까운 정지점" 기준으로 부여 + 중복 제거
  const basePlaces = useMemo(() => {
    const list = (allPlaces ?? []).map((p, i) => ({ ...p, idx: i + 1 })) || [];

    // day별 정지점 좌표 목록
    const dayStops: Array<{ day: number; pts: Array<[number, number]> }> =
      (days ?? []).map((d, di) => ({
        day: di + 1,
        pts: (d.stops ?? []).map((s) => [Number(s.lng), Number(s.lat)] as [number, number]),
      }));

    // 가까운 정지점 찾기 (허용 반경 m)
    const NEAR_M = 250; // 250m 이내면 같은 날로 본다
    function nearestDay(lng: number, lat: number): number | undefined {
      let bestDay: number | undefined;
      let best = Infinity;
      for (const d of dayStops) {
        for (const [slng, slat] of d.pts) {
          const km = haversineKm(lat, lng, slat, slng);
          const m = km * 1000;
          if (m < best) {
            best = m;
            bestDay = d.day;
          }
        }
      }
      return best <= NEAR_M ? bestDay : undefined;
    }

    // dayIdx 부여
    list.forEach((p) => {
      (p as any).dayIdx = nearestDay(Number(p.lng), Number(p.lat));
    });

    // 동일 좌표(반경 50m) 중복 제거
    const seen = new Map<string, true>();
    const DEDUP_M = 50;
    const deduped: typeof list = [];
    for (const p of list) {
      const key = `${Math.round(Number(p.lat) * 1e5)}:${Math.round(Number(p.lng) * 1e5)}`;
      // 근사 라운딩 키로 빠른 중복 제거, 혹 중복이면 거리 체크
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.push(p);
        continue;
      }
      // 같은 키라도 실제로 50m 넘게 떨어지면 다른 포인트로 유지
      const dup = deduped.find(
        (q) => haversineKm(Number(p.lat), Number(p.lng), Number(q.lat), Number(q.lng)) * 1000 <= DEDUP_M
      );
      if (!dup) deduped.push(p);
    }

    // idx 다시 부여(중복 제거 후)
    deduped.forEach((p, i) => ((p as any).idx = i + 1));
    return deduped as Array<
      { id: string; name: string; lat: number; lng: number; category?: string } & { idx: number; dayIdx?: number }
    >;
  }, [allPlaces, days]);


  // 도시 경계/중심 기반 필터 함수
  const insideCity = useMemo(() => {
    // 1) BBox가 있으면 BBox(확장 25%) 기준
    if (cityBox) {
      const b = expandBBox(cityBox, 0.25);
      return (lng: number, lat: number) => inBBox(lng, lat, b);
    }
    // 2) 중심만 있으면 반경 120km 기준
    if (cityCenter) {
      return (lng: number, lat: number) => haversineKm(lat, lng, cityCenter[1], cityCenter[0]) <= 120;
    }
    // 3) 아무것도 없으면 basePlaces의 중앙값으로 대략 중심 잡고 120km
    if (basePlaces.length >= 2) {
      const lats = basePlaces.map((p) => p.lat).sort((a, b) => a - b);
      const lngs = basePlaces.map((p) => p.lng).sort((a, b) => a - b);
      const lat = lats[Math.floor(lats.length / 2)];
      const lng = lngs[Math.floor(lngs.length / 2)];
      return (x: number, y: number) => haversineKm(y, x, lat, lng) <= 120;
    }
    return (_lng: number, _lat: number) => true;
  }, [cityBox, cityCenter, basePlaces]);

  // 필터 적용
  const places = useMemo(() => {
    const filtered = basePlaces.filter((p) => insideCity(p.lng, p.lat));
    setFilteredOutCnt(basePlaces.length - filtered.length);
    return filtered;
  }, [basePlaces, insideCity]);

  const daysFiltered = useMemo(() => {
    return (days ?? []).map((d, i) => ({
      dateOffset: d?.dateOffset ?? i,
      stops: (d?.stops ?? []).filter((s) => insideCity(Number(s.lng), Number(s.lat))),
    }));
  }, [days, insideCity]);

  // 지도 초기화 & 마커/라인 렌더
  useEffect(() => {
    let disposed = false;
    async function init() {
      const token = import.meta.env.VITE_MAPBOX_TOKEN as string;
      if (!token || !ref.current) return;

      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [127, 37],
        zoom: 4,
      });
      mapRef.current = map;

      await new Promise<void>((res) => (map.loaded() ? res() : map.once("load", () => res())));
      if (disposed) return;

      // ▽ 마커
      places.forEach((p) => {
        const el = document.createElement("div");
        el.className = "marker-dot";
        el.style.cssText = `width:0;height:0;`;
        (el as any).__dayIdx = p.dayIdx ?? 0;
        (el as any).__idx = p.idx;

        const base = DAY_COLORS[((p.dayIdx ?? 1) - 1) % DAY_COLORS.length];

        const inner = document.createElement("div");
        inner.className = "marker-core";
        inner.style.cssText = `
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; color: white; font-size: 13px; cursor: pointer; position: relative;
          box-shadow: 0 3px 8px rgba(0,0,0,0.25); border: 2px solid white; transition: all 0.2s ease;
          background: radial-gradient(circle at 30% 30%, ${base} 0%, ${base} 70%); will-change: transform;
        `;
        inner.textContent = String(p.idx);
        el.appendChild(inner);

        inner.addEventListener("mouseenter", () => {
          inner.style.transform = "scale(1.15)";
          inner.style.boxShadow = "0 6px 15px rgba(0,0,0,0.35)";
        });
        inner.addEventListener("mouseleave", () => {
          inner.style.transform = "scale(1.0)";
          inner.style.boxShadow = "0 3px 8px rgba(0,0,0,0.25)";
        });
        inner.addEventListener("click", () => {
          setSelectedIdx(p.idx);
          new mapboxgl.Popup({ offset: 12 })
            .setLngLat([p.lng, p.lat])
            .setHTML(`<strong>${p.idx}. ${placeLabel(p)}</strong>`)
            .addTo(map);
          map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13) });
        });

        new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map);

      });
      // △ 마커 끝

      // ▽ 일자별 경로
      (daysFiltered ?? []).forEach((d, i) => {
        const coords = (d.stops ?? []).map((s) => [s.lng, s.lat]) as [number, number][];
        if (coords.length < 2) return;
        const srcId = `route-${i}`;
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
        });
        map.addLayer({
          id: `${srcId}-line`,
          type: "line",
          source: srcId,
          paint: { "line-width": 4, "line-color": DAY_COLORS[i % DAY_COLORS.length], "line-opacity": 0.9 },
          layout: { "line-join": "round", "line-cap": "round" },
        });
      });

      // 화면 맞추기
      const b = new mapboxgl.LngLatBounds();
      let has = false;
      places.forEach((p) => { b.extend([p.lng, p.lat]); has = true; });
      (daysFiltered ?? []).forEach((d) => (d.stops ?? []).forEach((s) => { b.extend([s.lng, s.lat]); has = true; }));
      if (has) map.fitBounds(b, { padding: 60 });
    }

    init();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [city, country, places, daysFiltered]);

  // 필터: 마커/라인 가시성
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ✅ 이 지도 컨테이너 안에서만 마커를 찾는다
    const root = getRootEl();
    if (!root) return;

    const els = root.querySelectorAll<HTMLDivElement>(".marker-dot");
    els.forEach((el) => {
      const dayIdx = (el as any).__dayIdx as number;
      const visible = activeDay === "all" || dayIdx === activeDay;
      el.style.display = visible ? "" : "none";
    });

    // 라인(경로)도 이 지도 인스턴스의 레이어만 토글
    (daysFiltered ?? []).forEach((_, i) => {
      const id = `route-${i}-line`;
      if (map.getLayer(id)) {
        const visible = activeDay === "all" || i + 1 === activeDay ? "visible" : "none";
        map.setLayoutProperty(id, "visibility", visible);
      }
    });
  }, [activeDay, daysFiltered]);


  // 선택 강조
  useEffect(() => {
    // ✅ 이 지도 컨테이너 안에서만 마커를 찾는다
    const root = getRootEl();
    if (!root) return;

    const els = root.querySelectorAll<HTMLDivElement>(".marker-dot");
    els.forEach((el) => {
      const idx = (el as any).__idx as number;
      const core = el.querySelector<HTMLDivElement>(".marker-core");
      if (!core) return;
      core.style.transform = idx === selectedIdx ? "scale(1.18)" : "scale(1.0)";
      (core.style as any).zIndex = idx === selectedIdx ? "2" : "1";
    });
  }, [selectedIdx]);


  // 보이는 리스트(필터 반영)
// 기존 visibleList useMemo 블록 교체
  const visibleList = useMemo(() => {
    if (activeDay === "all") return places;

    const idx = Number(activeDay) - 1;
    const targetStops = (daysFiltered?.[idx]?.stops ?? [])
      .map((s) => [Number(s.lng), Number(s.lat)] as [number, number]);

    if (targetStops.length === 0) return [];

    const NEAR_M = 300; // 선택: 200~300m 권장

    return places.filter((p) => {
      const di = (p as any).dayIdx;
      // 1) dayIdx가 있는 포인트는 일치하는 날에만 노출
      if (typeof di === "number") return di === activeDay;

      // 2) dayIdx가 없는(미분류) 포인트만 근접 허용으로 보조 포함
      return targetStops.some(
        ([slng, slat]) => haversineKm(Number(p.lat), Number(p.lng), slat, slng) * 1000 <= NEAR_M
      );
    });
  }, [places, activeDay, daysFiltered]);


  const fitVisible = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = new mapboxgl.LngLatBounds();
    let has = false;
    visibleList.forEach((p) => { b.extend([p.lng, p.lat]); has = true; });
    if (has) map.fitBounds(b, { padding: 60 });
  };

  return (
    <div className="mt-5 w-full">
      {/* 필터 & 액션 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">
          {city}{country ? `, ${country}` : ""}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveDay("all")}
            className={`px-2.5 py-1 text-xs rounded-full border ${
              activeDay === "all" ? "bg-violet-600 text-white border-violet-600" : "text-violet-700 border-violet-300"
            }`}
          >
            전체
          </button>
          {(daysFiltered ?? []).map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i + 1)}
              className="px-2.5 py-1 text-xs rounded-full border"
              style={{
                background: activeDay === i + 1 ? DAY_COLORS[i % DAY_COLORS.length] : "white",
                color: activeDay === i + 1 ? "#fff" : "#4c1d95",
                borderColor: "#d6bcfa",
              }}
            >
              {i + 1}일차
            </button>
          ))}
        </div>
        <button onClick={fitVisible} className="ml-auto px-2.5 py-1 text-xs rounded-md border border-violet-300 text-violet-700">
          전체보기
        </button>
      </div>

      {/* 제외 안내 */}
      {filteredOutCnt > 0 && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-2">
          목적지에서 멀리 떨어진 포인트 {filteredOutCnt}곳을 자동 제외했어요.
        </div>
      )}

      {/* 지도 + 리스트 */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
        <div className="h-72 w-full rounded-2xl overflow-hidden shadow-inner border border-violet-100">
          <div ref={ref} className="h-full w-full" />
        </div>

        <div className="h-72 overflow-auto rounded-2xl border border-violet-100 bg-white p-3">
          <div className="text-xs text-gray-500 mb-2">지도 포인트</div>
          <ol className="space-y-1">
            {visibleList.map((p) => (
              <li
                key={p.id || p.idx}
                className={`flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-violet-50 ${
                  selectedIdx === p.idx ? "bg-violet-50" : ""
                }`}
                onMouseEnter={() => setSelectedIdx(p.idx)}
                onMouseLeave={() => setSelectedIdx(null)}
                onClick={() => {
                  setSelectedIdx(p.idx);
                  mapRef.current?.easeTo({ center: [p.lng, p.lat], zoom: 14 });
                }}
              >
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ background: DAY_COLORS[((Math.max(1, p.dayIdx ?? 1) - 1) % DAY_COLORS.length)] }}
                >
                  {p.idx}
                </span>
                <div className="text-sm leading-snug">
                  <div className="font-medium text-gray-800">{placeLabel(p)}</div>
                  {p.category ? <div className="text-[11px] text-gray-500">{categoryKo(String(p.category))}</div> : null}
                </div>
              </li>
            ))}
            {visibleList.length === 0 && <div className="text-xs text-gray-500">표시할 포인트가 없습니다.</div>}
          </ol>
        </div>
      </div>
    </div>
  );
}


/* =========================
 * Page
 * ========================= */
export default function Result() {
  const nav = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const cont = params.get("cont");
  const env = params.get("env");
  const pace = params.get("pace");

  const [loading, setLoading] = useState(true);
  const [resultData, setResultData] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 중복 호출 방지 + 취소
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const durationKR = useMemo(() => {
    const s = (localStorage.getItem("schedule") || "").toLowerCase();
    const m = s.match(/(\d+)\s*night.*?(\d+)\s*days/);
    if (m) return `${m[1]}박 ${m[2]}일`;
    return s || "여행 기간";
  }, []);

  const budgetKR = localStorage.getItem("budget") || "";
  const transport = localStorage.getItem("transport") || "public";

  // ✅ 월 값
  const monthRaw = localStorage.getItem("month") || null;
  const monthKR = useMemo(() => toMonthKR(monthRaw), [monthRaw]);

  useEffect(() => {
    let unmounted = false;

    async function ensureCsrf(API: string) {
      let token = CSRF_COOKIE_CANDIDATES.map(getCookie).find(Boolean) ?? null;
      if (!token) {
        const csrfPath = import.meta.env.VITE_CSRF_ENDPOINT ?? "/api/auth/csrf";
        try {
          await fetch(`${API}${csrfPath}`, {
            method: "GET",
            credentials: "include",
            headers: {
              "Accept-Language": (navigator.languages && navigator.languages[0]) || navigator.language || "ko",
            },
          });
          token = CSRF_COOKIE_CANDIDATES.map(getCookie).find(Boolean) ?? null;
        } catch {
          /* noop */
        }
      }
      return token;
    }

    function parseActTypeSafe(raw: string | null): string[] {
      if (!raw) return [];
      const trimmed = raw.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const arr = JSON.parse(trimmed);
          return Array.isArray(arr) ? arr.map((s: any) => String(s).trim()).filter(Boolean) : [];
        } catch {
          /* fallthrough */
        }
      }
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }

    function normalizeCompanion(raw: string | null): string | null {
      const allow = new Set(["혼자", "친구", "연인", "가족"]);
      if (!raw) return null;
      if (allow.has(raw)) return raw;
      const map: Record<string, string> = {
        solo: "혼자",
        friend: "친구",
        friends: "친구",
        couple: "연인",
        family: "가족",
      };
      // @ts-ignore
      return map[raw.toLowerCase()] ?? null;
    }

    function dedupeRecs(list: Recommendation[]): Recommendation[] {
      const seen = new Set<string>();
      const out: Recommendation[] = [];
      for (const r of list) {
        const firstDayKey = Object.keys(r.schedule).sort((a, b) => a.localeCompare(b))[0] || "";
        const firstLen = firstDayKey ? r.schedule[firstDayKey]?.length || 0 : 0;
        const key = `${r.city}|${r.country}|${firstLen}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(r);
        }
      }
      return out;
    }

    async function fetchResultOnce() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const nickname = localStorage.getItem("nickname") || "";
        const travelWith = normalizeCompanion(localStorage.getItem("travelWith"));
        const actType = parseActTypeSafe(localStorage.getItem("actType"));
        const schedule = localStorage.getItem("schedule") || "";
        const budget = localStorage.getItem("budget") || "";
        const driving = localStorage.getItem("transport") || "";

        // step-time 호환 키
        const departWindow = localStorage.getItem("departWindow") || localStorage.getItem("departSlot") || "";
        const returnWindow = localStorage.getItem("returnWindow") || localStorage.getItem("returnSlot") || "";

        if (
          !nickname ||
          !travelWith ||
          actType.length === 0 ||
          !schedule ||
          !budget ||
          !driving ||
          !cont ||
          !env ||
          !pace
        ) {
          setError("입력 정보가 누락되어 추천을 불러올 수 없습니다. 처음부터 다시 시도해주세요.");
          setLoading(false);
          return;
        }

        const API = "";
        const token =
          localStorage.getItem("access_token") ||
          localStorage.getItem("token") ||
          sessionStorage.getItem("access_token") ||
          sessionStorage.getItem("token") ||
          "";

        const useCookieAuth = !token;
        let csrfToken: string | null = null;
        if (useCookieAuth) csrfToken = await ensureCsrf(API);

        // ✅ month 파생값
        const travelMonth = getTravelMonthInt(monthRaw);
        const season = monthToSeason(travelMonth);

        const payload = {
          nickname,
          preferences: {
            companion: travelWith,
            style: actType,
            duration: schedule,
            budget,
            climate: env,
            continent: cont,
            density: pace,
            driving,
            travel_month: travelMonth,
            season,
            depart_window: departWindow || null,
            return_window: returnWindow || null,
          },
          lang: "ko",
        };

        const acceptLang = (navigator.languages && navigator.languages[0]) || navigator.language || "ko";
        const langHeader = acceptLang.toLowerCase().startsWith("ko") ? acceptLang : "ko";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Language": langHeader,
        };
        if (!useCookieAuth) headers.Authorization = `Bearer ${token}`;
        else if (csrfToken) {
          const hdr = import.meta.env.VITE_CSRF_HEADER ?? "X-CSRF-Token";
          headers[hdr] = csrfToken;
          headers["X-CSRFToken"] = csrfToken;
          headers["X-XSRF-TOKEN"] = csrfToken;
        }

        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        console.time("recommend");
        console.log("[REQ] /api/v1/survey/recommend payload =", payload);

        const res = await fetch(`${API}/api/v1/survey/recommend`, {
          method: "POST",
          headers,
          credentials: useCookieAuth ? "include" : "same-origin",
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });

        console.log("[RES] status =", res.status, res.statusText);

        if (res.status === 403) {
          const msg = (await res.text().catch(() => "")) || "Forbidden";
          throw new Error(`CSRF 검증에 실패했습니다. 새로고침 후 다시 시도하거나 로그인해 주세요.\n${msg}`);
        }
        if (res.status === 401) {
          const msg = (await res.text().catch(() => "")) || "Unauthorized";
          throw new Error(`세션이 만료되었거나 로그인 정보가 없습니다. (${msg})`);
        }
        const raw = await res.text();
        console.log("[RES] raw length =", raw.length);
        console.log("[RES] raw head =", raw.slice(0, 300));

        if (!res.ok) {
          throw new Error(`서버 응답 오류: ${res.status} ${res.statusText}${raw ? `\n${raw}` : ""}`);
        }

        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (e) {
          console.error("❌ JSON 파싱 실패:", e);
          throw new Error("응답을 JSON으로 파싱하지 못했습니다.");
        }

        let list: any[] = [];
        if (Array.isArray(parsed)) list = parsed;
        else if (parsed?.data && Array.isArray(parsed.data)) list = parsed.data;
        else if (parsed?.results && Array.isArray(parsed.results)) list = parsed.results;
        else if (parsed && typeof parsed === "object") {
          const firstArrayKey = Object.keys(parsed).find((k) => Array.isArray((parsed as any)[k]));
          if (firstArrayKey) list = (parsed as any)[firstArrayKey];
        }

        // ⬇️ Result 컴포넌트의 normalized 만들던 부분 교체/보강
        const normalized: Recommendation[] = (list || []).map((it) => {
          const hotelsFromVarious =
            (it?.lodging?.hotels && Array.isArray(it.lodging.hotels) ? it.lodging.hotels : null) ??
            (Array.isArray(it?.hotels) ? it.hotels : null) ??
            (Array.isArray(it?.accommodations) ? it.accommodations : null);

          // 🔽 여기에서 먼저 중복 제거
          const hotelsDeduped = hotelsFromVarious ? dedupeHotels(hotelsFromVarious, { byMeters: 150 }) : undefined;

          const lodgingArea =
            it.lodging_area ??
            it.lodgingArea ??
            it?.lodging?.area ??
            it?.lodging?.areas?.[0]?.name_ko ??
            it?.lodging?.areas?.[0]?.name_original ??
            "";

          return {
            city: it.city ?? it.destination ?? "",
            country: it.country ?? it.nation ?? "",
            reason: it.reason ?? it.explain ?? "",
            lodging_area: lodgingArea || "",
            lodging: hotelsDeduped
              ? { hotels: hotelsDeduped, areas: it?.lodging?.areas ?? [] }
              : (it?.lodging ?? undefined),
            schedule: normalizeSchedule(it.schedule ?? it.plan ?? []),
            allPlaces: it.allPlaces ?? it.places ?? undefined,
            days: it.days ?? undefined,
          };
        });
        const normalizedFixed = normalized.map(enforceLodgingSecondFrontend);
        const deduped = dedupeRecs(normalizedFixed);

        console.timeEnd("recommend");
        console.log("[PARSED] items =", deduped.length);

        if (!unmounted) setResultData(deduped);
      } catch (e: any) {
        if (!unmounted) setError(e?.message || "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        console.error("❌ 추천 조회 실패:", e);
      } finally {
        if (!unmounted) setLoading(false);
        inFlightRef.current = false;
      }
    }

    fetchResultOnce();
    return () => {
      unmounted = true;
      abortRef.current?.abort();
    };
  }, [cont, env, pace, monthRaw]);

  const copyItinerary = async (rec: Recommendation) => {
    try {
      await navigator.clipboard.writeText(scheduleToText(rec));
      alert("일정이 복사되었습니다. 메모장/카톡 등에 붙여넣기 하세요!");
    } catch {
      alert("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC] px-4 py-10 flex flex-col items-center">
      <ResultHero duration={durationKR} budget={budgetKR} transport={transport} month={monthKR} />

      {loading ? (
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2 }} className="text-[#3F30C4] mb-8">
          <div className="w-12 h-12 border-4 border-violet-300 border-t-transparent rounded-full animate-spin" />
        </motion.div>
      ) : error ? (
        <div className="max-w-xl w-full text-center text-red-600 flex flex-col items-center gap-3">
          <TriangleAlert size={40} />
          <p className="whitespace-pre-wrap">{error}</p>
          <div className="flex gap-3 justify-center mt-1">
            <button onClick={retry} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
              다시 시도
            </button>
            <button onClick={() => nav("/login")} className="px-4 py-2 rounded-lg border border-violet-300 text-[#6C3DF4] hover:bg-violet-50">
              로그인으로
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-6">
          {(!resultData || resultData.length === 0) && (
            <div className="text-center text-gray-600">추천 결과가 비어있어요. 조건을 바꿔 다시 시도해보세요.</div>
          )}

          {resultData?.map((rec, index) => {
            const days = Object.entries(rec.schedule);
            const lodgingPick = pickLodging(rec);
            return (
              <article
                key={`${rec.city}-${rec.country}-${index}`}
                className="p-6 rounded-2xl bg-white border border-violet-100 shadow-[0_8px_30px_rgba(80,0,200,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-[#3F30C4]">
                      {rec.city}, {rec.country}
                    </h2>
                    <p className="text-gray-700 mt-1 leading-relaxed">{rec.reason}</p>
                    <MetaChips duration={durationKR} budget={budgetKR} transport={transport} month={monthKR} />
                    {/* 🏨 숙소 추천 블록 */}
                    {(() => {
                      // 백엔드가 mode 주면 우선 사용, 없으면 호텔 2개 이상 여부로 추론
                      const hotelsLen = rec.lodging?.hotels?.length ?? 0;
                      const mode: "hotels" | "area" =
                        (rec.lodging as any)?.mode ?? (hotelsLen >= 2 ? "hotels" : "area");

                      if (mode === "hotels" && hotelsLen > 0) {
                        // 호텔 카드(2~3개) + (선택) 대표 한 줄 CTA
                        return (
                          <>
                            <HotelCards city={rec.city} hotels={rec.lodging?.hotels} />
                            <LodgingSection city={rec.city} pick={lodgingPick} />
                          </>
                        );
                      }
                      // 권역(시내 중심 등) 한 줄 폴백
                      return <LodgingSection city={rec.city} pick={lodgingPick} />;
                    })()}

                  </div>

                  <div className="shrink-0 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openFlights(rec.city)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
                      title="항공권 검색"
                    >
                      <PlaneTakeoff size={16} />
                      항공권 검색
                    </button>

                    <button
                      type="button"
                      onClick={() => copyItinerary(rec)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
                      title="일정 복사"
                    >
                      <Copy size={16} />
                      일정 복사
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  {days.map(([dayKey, acts], i) => (
                    <DaySection key={dayKey} title={dayLabel(dayKey)} activities={acts} defaultOpen={i === 0} />
                  ))}
                </div>

                {/* ✅ 지도 (서버가 준 좌표만 표시) */}
                <MapView
                  city={rec.city}
                  country={rec.country}
                  schedule={rec.schedule}
                  allPlaces={rec.allPlaces}
                  days={
                    rec.days
                      ? rec.days.map((d, i) => ({
                        dateOffset: d?.dateOffset ?? i,
                        stops: (d?.stops ?? []).map((s) => ({
                          lat: Number(s.lat),
                          lng: Number(s.lng),
                        })),
                      }))
                      : undefined
                  }
                />

                <div className="flex gap-3 mt-6">
                  <button onClick={() => nav(-1)} className="text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50">
                    <CircleArrowLeft />
                    뒤로가기
                  </button>
                  <button onClick={() => nav("/")} className="text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50">
                    <Home />
                    처음으로
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
