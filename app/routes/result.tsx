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
  Star,
  RefreshCw,
  Shuffle,
} from "lucide-react";
import { getTravelMonthInt, monthToSeason } from "@/store/travelStore";

/* ✅ Mapbox */
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/* =========================
 * Types
 * ========================= */
type BudgetMeta = {
  ok?: boolean;
  minRequiredKRW?: number;
  recommendedKRW?: number;    // 권장 예산
  estimatedTotalKRW?: number; // 예상 예산
  perDayKRW?: number;
  breakdown?: Record<string, number>;
  notes?: string[];
  expectedKRW?: number;
  maxPlausibleKRW?: number;
};
type Activity = { time: string; activity: string };
type CitySchedule = Record<string, Activity[]>;

type Recommendation = {
  city: string;
  country: string;
  reason: string;
  lodging_area?: string;
  country_code?: string; // ✅ ISO2(선택)

  meta?: {
    budget?: BudgetMeta;
  };

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
// 영어 키 → 한글 라벨 매핑
const BREAKDOWN_KO: Record<string, string> = {
  meals: "식비", food: "식비", dining: "식비",
  transport: "교통비", transit: "교통비",
  tickets: "입장료", attractions: "입장료", sightseeing: "입장료",
  lodging: "숙박", hotel: "숙박", accommodation: "숙박",
  activities: "체험/액티비티", experience: "체험/액티비티",
  shopping: "쇼핑",
  drinks: "음료/주류", beverage: "음료/주류",
  etc: "기타", misc: "기타", other: "기타",
};
function toKoLabel(k: string) {
  const key = k.toLowerCase().trim();
  return BREAKDOWN_KO[key] || k; // 모르는 키는 원문 유지
}
function normalizeBreakdown(b?: Record<string, number>) {
  if (!b) return [] as Array<{ key: string; label: string; value: number }>;
  const arr = Object.entries(b).map(([k, v]) => ({
    key: k, label: toKoLabel(k), value: Number(v || 0),
  }));
  const order = ["숙박", "식비", "교통비", "입장료", "체험/액티비티", "쇼핑", "음료/주류", "기타"];
  arr.sort((a, b) => (order.indexOf(a.label) - order.indexOf(b.label)));
  return arr;
}

// result.tsx 상단 아무 유틸 구역에
function isBudgetInsufficient(meta?: Recommendation["meta"]): boolean {
  const ok = meta?.budget?.ok as any;
  // false, 0, "0", "false", null(명시적 실패로 간주하고 싶으면 포함)까지 허용
  if (ok === false) return true;
  if (ok === 0) return true;
  if (typeof ok === "string" && ok.toLowerCase() === "false") return true;
  // 필요 시: if (ok == null) return true;  // <- null/undefined도 “부족”으로 간주하고 싶다면
  return false;
}

function BudgetAlert({ meta }: { meta?: { budget?: BudgetMeta } }) {
  if (!isBudgetInsufficient(meta)) return null;
  const b = meta?.budget;
  const minKRW =
    typeof b?.minRequiredKRW === "number"
      ? b.minRequiredKRW
      : undefined;
  const line = b?.notes?.[0] || "예산이 부족합니다. 최소 비용 기준으로 간소한 일정을 제시해요.";
  return (
    <div className="max-w-3xl w-full mx-auto border border-amber-200 bg-amber-50 text-amber-800 rounded-xl p-3 text-sm">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5" size={18} />
        <div className="flex-1">
          <div className="font-semibold">예산 경고</div>
          <div className="mt-0.5">
            {line}
            {typeof minKRW === "number" ? <> 최소 필요 예산은 <b>₩{minKRW.toLocaleString()}</b> 정도로 보여요.</> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// 간단 KRW 포맷터
function krw(n?: number) {
  return typeof n === "number" ? `₩${n.toLocaleString()}` : undefined;
}
function parseKRWtoNumber(s?: string | null) {
  if (!s) return 0;
  const n = String(s).replace(/[^\d]/g, "");
  return n ? Number(n) : 0;
}

/** 💸 예산 요약줄: 예상/권장/최소 */
function BudgetSummary({
                         budgetMeta,
                         userBudgetKRWRaw,
                       }: {
  budgetMeta?: {
    ok?: boolean;
    minRequiredKRW?: number;
    estimatedTotalKRW?: number;
    recommendedKRW?: number;
    perDayKRW?: number;
    breakdown?: Record<string, number>;
  };
  userBudgetKRWRaw: string;
}) {
  // ── 내부 헬퍼: "₩1,000,000" → 1000000
  const parseKRWtoNumber = (s?: string | null) => {
    if (!s) return 0;
    const n = String(s).replace(/[^\d]/g, "");
    return n ? Number(n) : 0;
  };

  // ── 브레이크다운 라벨 한글화 & 정렬
  const BREAKDOWN_KO: Record<string, string> = {
    meals: "식비",
    food: "식비",
    dining: "식비",
    transport: "교통비",
    transit: "교통비",
    tickets: "입장료",
    attractions: "입장료",
    sightseeing: "입장료",
    lodging: "숙박",
    hotel: "숙박",
    accommodation: "숙박",
    activities: "체험/액티비티",
    experience: "체험/액티비티",
    shopping: "쇼핑",
    drinks: "음료/주류",
    beverage: "음료/주류",
    etc: "기타",
    misc: "기타",
    other: "기타",
  };
  const toKoLabel = (k: string) => BREAKDOWN_KO[k.toLowerCase().trim()] || k;
  const normalizeBreakdown = (b?: Record<string, number>) => {
    if (!b) return [] as Array<{ key: string; label: string; value: number }>;
    const arr = Object.entries(b).map(([k, v]) => ({
      key: k,
      label: toKoLabel(k),
      value: Number(v || 0),
    }));
    const order = ["숙박", "식비", "교통비", "입장료", "체험/액티비티", "쇼핑", "음료/주류", "기타"];
    arr.sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return arr;
  };

  if (!budgetMeta) return null;

  const user = parseKRWtoNumber(userBudgetKRWRaw);
  const min = budgetMeta.minRequiredKRW ?? 0;
  const est =
    budgetMeta.expectedKRW ??
    budgetMeta.estimatedTotalKRW ??
    budgetMeta.recommendedKRW ??
    0;
// 스케일 기준을 '상한 후보'까지 고려
  const maxRange = budgetMeta.maxPlausibleKRW ?? Math.max(est, user);
  const maxVal = Math.max(min, est, user, maxRange || 0, 1);
  const pct = (v: number) => Math.min(100, Math.round((v / maxVal) * 100));

  const ok = budgetMeta.ok !== false && (user >= min || (est > 0 ? user >= est : true));
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      {/* 상단 배지 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border
            ${ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}
        >
          <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
          {ok ? "예산 여유" : "예산 부족"}
        </span>

        {est > 0 && (
          <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1.5 text-xs">
            예상 경비 <b className="ml-1">₩{est.toLocaleString()}</b>
          </span>
        )}

        <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 text-xs">
          최소 <b className="ml-1">₩{min.toLocaleString()}</b>
        </span>

        {user > 0 && (
          <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 text-xs">
            내 예산 <b className="ml-1">₩{user.toLocaleString()}</b>
          </span>
        )}

        {budgetMeta.breakdown && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-1 text-xs px-2 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            상세 보기
          </button>
        )}
      </div>

      {/* 3줄 비교 바 (최소/예상/내 예산) */}
      <div className="mt-3 rounded-xl border border-violet-100 bg-white p-3">
        {[
          { label: "최소", value: min, cls: "bg-amber-400/80" },
          ...(est > 0 ? [{ label: "예상", value: est, cls: "bg-violet-500/80" }] : []),
          ...(user > 0 ? [{ label: "내 예산", value: user, cls: "bg-emerald-500/80" }] : []),
        ].map((row) => (
          <div key={row.label} className="mb-2 last:mb-0">
            <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
              <span>{row.label}</span>
              <span>₩{row.value.toLocaleString()}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${row.cls}`} style={{ width: `${pct(row.value)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* 브레이크다운 팝오버 (한글 라벨) */}
      {open && budgetMeta.breakdown && (
        <div className="relative">
          <div className="mt-2 w-full md:w-[360px] rounded-xl border border-violet-200 bg-white shadow-lg p-3 text-sm">
            <div className="font-semibold text-violet-700 mb-1">예상 비용 상세</div>
            <ul className="space-y-1">
              {normalizeBreakdown(budgetMeta.breakdown).map((it) => (
                <li key={it.key} className="flex items-center justify-between">
                  <span className="text-gray-600">{it.label}</span>
                  <span className="font-medium">₩{it.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 h-px bg-violet-100" />
            {(() => {
              const items = normalizeBreakdown(budgetMeta.breakdown);
              const total = items.reduce((s, x) => s + x.value, 0);
              return (
                <div className="mt-2 flex items-center justify-between text-gray-700">
                  <span>합계</span>
                  <span className="font-bold">₩{total.toLocaleString()}</span>
                </div>
              );
            })()}
            {est > 0 && (() => {
              const items = normalizeBreakdown(budgetMeta.breakdown);
              const total = items.reduce((s, x) => s + x.value, 0);
              return total && Math.abs(total - est) > 1000 ? (
                <div className="mt-1 text-[11px] text-gray-500">
                  * 합계가 ‘예상 경비’와 약간 다를 수 있어요(반올림/할인 등).
                  <p className="text-xs text-gray-500 mt-2">
                    💡 예상 경비는 숙박·항공비를 제외한 현지 체류비(식비·교통·입장료·기타) 기준입니다.
                  </p>
                </div>

              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
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
  const dayKeys = Object.keys(schedule).sort((a, b) => {
    const an = parseInt(a.match(/\d+/)?.[0] || "0", 10);
    const bn = parseInt(b.match(/\d+/)?.[0] || "0", 10);
    return an - bn || a.localeCompare(b);
  });
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
  Object.entries(rec.schedule)
    .sort(([a], [b]) => {
      const an = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const bn = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return an - bn || a.localeCompare(b);
    })
    .forEach(([day, acts]) => {
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
// ✅ pickLodging 교체(또는 상단 로직만 수정)
// ✅ 호텔 우선 pickLodging
function pickLodging(rec: Recommendation): LodgingPick | null {
  const hotels = rec.lodging?.hotels ?? [];

  // 1) 호텔이 하나라도 있으면 호텔 우선
  if (Array.isArray(hotels) && hotels.length > 0) {
    const h0 = hotels[0];
    const label = (h0?.name_ko || h0?.name_original || "").trim();
    if (label && !looksAirportName(label)) {
      return { kind: "hotel", label, lat: h0?.lat, lng: h0?.lng };
    }
  }

  // 2) allPlaces에서 (공항 제외) 숙소성 POI 찾기
  const poiHotel = (rec.allPlaces || []).find(p => isLodgingPoi(p) && !isAirportPoi(p));
  if (poiHotel) {
    const label = (poiHotel.name_ko || poiHotel.name || poiHotel.name_original || "").trim();
    if (label && !looksAirportName(label)) {
      return { kind: "hotel", label, lat: poiHotel.lat, lng: poiHotel.lng };
    }
  }

  // 3) 그래도 없으면 area
  const area =
    rec.lodging_area ||
    rec.lodging?.areas?.[0]?.name_ko ||
    rec.lodging?.areas?.[0]?.name_original ||
    lodgingHintFromSchedule(rec);
  const clean = area && cleanAreaHint(area);
  if (clean && !looksAirportName(clean)) return { kind: "area", label: clean };

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
      initial={{opacity: 0, y: -8}}
      animate={{opacity: 1, y: 0}}
      className="relative isolate overflow-hidden text-center pt-6 pb-8"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 flex justify-center">
        <div className="h-44 w-44 rounded-full bg-gradient-to-br from-violet-300/30 to-fuchsia-200/25 blur-3xl"/>
      </div>

      <div
        className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-700 backdrop-blur">
        ✨ 여행 취향 기반 추천
      </div>

      <h1 className="mt-3 text-3xl md:text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
        당신만을 위한{" "}
        <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">여행지</span>
        를 추천해요
      </h1>

      <p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-gray-600">선택하신 정보를 바탕으로 어울리는 여행지를 골라봤어요</p>
      <p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-gray-600">추천 결과의 예상 대기 시간은 1~2분입니다!</p>
      <p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-gray-600">잠시만 기다려주세요!</p>
      <div className="mt-4 flex items-center justify-center gap-2">
        {month ? <Chip>{month} 여행</Chip> : null}
        <Chip>{duration}</Chip>
        <Chip>{toKRWString(budget)}</Chip>
        <Chip>{TransportText} 기준</Chip>
      </div>

      <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-violet-400/50 via-fuchsia-400/50 to-violet-400/50"/>
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
// 기존 LodgingSection 시그니처 변경
function LodgingSection({
                          city,
                          pick,
                          variant = "full", // "full" | "compact"
                        }: {
  city: string;
  pick: LodgingPick | null;
  variant?: "full" | "compact";
}) {
  if (!pick) return null;
  const isHotel = pick.kind === "hotel";
  const title = variant === "full" ? (isHotel ? "추천 호텔" : "숙소 추천 지역") : "대표 추천";
  const sub = pick.label;

  // compact는 테두리만 얇고, 텍스트도 한 줄로
  const wrapCls =
    variant === "full"
      ? "mt-4 p-4 bg-violet-50/60 border border-violet-100 rounded-2xl"
      : "mt-4 p-3 border border-violet-100 rounded-xl bg-white";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={wrapCls}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 text-violet-700">
          <BedDouble size={20} />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-violet-700">{title}</h4>
          <p className={`text-sm text-gray-700 mt-1 ${variant === "compact" ? "truncate" : "leading-snug"}`}>
            {sub}
          </p>
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
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <Globe size={12} /> 지도
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 호텔 설명을 ‘한 문장’으로 축약 + 길이 제한 */
/** 호텔 추천 이유를 '자연스러운 한 문장'으로 1줄 요약 */
type PriceTier = "저예산" | "중간" | "상위";
type HotelItem = {
  name_original: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  why?: string;
  price_tier?: PriceTier;
  booking_query?: string;
  agoda_query?: string;
};

export function HotelCards({
                             city,
                             hotels,
                           }: {
  city: string;
  hotels?: HotelItem[] | undefined;
}) {
  const list = useMemo(() => dedupeHotels(hotels || [], { byMeters: 150 }), [hotels]);
  if (!list || list.length === 0) return null;

  // 대표 카드 크기로 통일 (높이는 필요 시 조절)
  const CARD_H = "h-[230px]";
  const cardCls =
    `w-full rounded-2xl border border-violet-200 bg-white p-4 shadow-sm ` +
    `hover:shadow-md hover:-translate-y-0.5 transition duration-200 ` +
    `flex flex-col ${CARD_H}`;

  const summarizeWhy = (why?: string, maxChars = 42) => {
    const s = (why || "").trim();
    if (!s) return s;
    const m = s.match(/[.!?]|…/);
    const first = m ? s.slice(0, (m.index ?? 0) + 1).trim() : s;
    return first.length <= maxChars ? first : s.slice(0, maxChars).trim() + "…";
  };

  function HotelWhy({ why }: { why?: string }) {
    const [open, setOpen] = useState(false);
    if (!why) return null;
    const shortText = summarizeWhy(why, 42);
    const shortened = shortText !== why;

    return (
      <div className="mt-1 text-sm text-gray-700">
        <div className="flex items-start gap-2">
          <span className={open ? "" : "line-clamp-2"}>{open ? why : shortText}</span>
          {shortened && (
            <button
              onClick={() => setOpen(v => !v)}
              className="ml-auto text-violet-600 text-xs hover:underline whitespace-nowrap"
              aria-expanded={open}
            >
              {open ? "접기" : "전체 보기"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const [featured, ...rest] = list;

  const getTierClass = (tier?: PriceTier) => {
    switch (tier) {
      case "저예산": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "상위":   return "bg-amber-50 text-amber-700 border-amber-100";
      default:       return "bg-violet-50 text-violet-700 border-violet-100";
    }
  };

  const makeKey = (h: HotelItem, i: number) =>
    `${h.name_ko || h.name_original || "hotel"}-${h.lat ?? "x"}-${h.lng ?? "x"}-${i}`;

  function CTA({
                 name, lat, lng, city, booking_query, agoda_query,
               }: {
    name: string; lat?: number; lng?: number; city: string;
    booking_query?: string; agoda_query?: string;
  }) {
    const forBooking = booking_query || name;
    const forAgoda = agoda_query || name;
    const canMap = typeof lat === "number" && typeof lng === "number";
    return (
      <div className="mt-auto flex gap-2">
        <button
          onClick={() => openBookingSearchUnified(city, forBooking, "hotel")}
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
        >
          Booking으로 예약
        </button>
        <button
          onClick={() => openAgodaSearchUnified(city, forAgoda, "hotel")}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          Agoda 검색
        </button>
        <button
          onClick={() => (canMap ? openGoogleMapHotel(city, name, lat!, lng!, "hotel") : null)}
          disabled={!canMap}
          aria-disabled={!canMap}
          className="text-xs px-2.5 py-1.5 rounded-lg border text-gray-700 border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50"
          title={!canMap ? "좌표 정보 없음" : "지도 열기"}
        >
          <Globe size={12} />
          지도
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-bold text-violet-700">추천 호텔</h4>
        <span className="text-[11px] text-gray-500">
          근접·유사명 호텔은 150m 기준으로 묶어 대표만 보여줘요. ({list.length}곳)
        </span>
      </div>

      {/* 대표 추천 (그대로) */}
      {featured && (
        <div className={cardCls}>
          {/* 상단 라벨 영역을 카드 안쪽 왼쪽 정렬로 맞춤 */}
          <div className="flex items-center gap-2 mb-2">
            <Star size={16} className="text-amber-500" fill="currentColor" />
            <span className="text-xs font-semibold text-gray-600">대표 추천</span>
          </div>

          {/* 메인 콘텐츠: 일반 카드와 완전 동일한 구조 */}
          <div className="flex items-start gap-3 flex-1">
            <div className="text-violet-700 mt-0.5">
              <BedDouble size={18} />
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-2">
                <div className="text-base font-bold text-gray-900 truncate">
                  {featured.name_ko || featured.name_original || "추천 호텔"}
                </div>
                {featured.price_tier && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getTierClass(
                      featured.price_tier
                    )}`}
                  >
              {featured.price_tier}
            </span>
                )}
              </div>

              {featured.why ? <HotelWhy why={featured.why} /> : <div className="h-1" />}

              {/* 👇 버튼 묶음: 일반 카드와 같은 위치(설명 아래로) */}
              <div className="mt-3">
                <CTA
                  city={city}
                  name={featured.name_ko || featured.name_original || ""}
                  lat={featured.lat}
                  lng={featured.lng}
                  booking_query={featured.booking_query}
                  agoda_query={featured.agoda_query}
                />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* 🔥 아래 카드도 가로폭 '완전 동일'(=전체폭). 그리드 대신 1열 리스트로 변경 */}
      <ul className="space-y-3">
        {rest.map((h, i) => {
          const title = h.name_ko || h.name_original || "추천 호텔";
          const displayName = h.name_ko || h.name_original || "";
          return (
            <li key={makeKey(h, i)} className={cardCls}>
              <div className="flex items-start gap-3">
                <div className="text-violet-700 mt-0.5">
                  <BedDouble size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-800 truncate" title={title}>
                      {title}
                    </div>
                    {h.price_tier && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getTierClass(h.price_tier)}`}>
                        {h.price_tier}
                      </span>
                    )}
                  </div>
                  {h.why ? <HotelWhy why={h.why} /> : <div className="h-1" />}
                </div>
              </div>

              <CTA
                city={city}
                name={displayName}
                lat={h.lat}
                lng={h.lng}
                booking_query={h.booking_query}
                agoda_query={h.agoda_query}
              />
            </li>
          );
        })}
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
    const useScheduleMarkers = Array.isArray(days) && days.length > 0;

    if (useScheduleMarkers) {
      const out: Array<{ id: string; name: string; lat: number; lng: number; category?: string; dayIdx?: number; idx?: number }> = [];
      const LABEL_NEAR_M = 200;   // 근처 POI 이름을 빌릴 최대 거리
      const DEDUP_M = 50;         // 스톱 중복 제거 거리

      days!.forEach((d, di) => {
        (d?.stops ?? []).forEach((s, si) => {
          const lat = Number(s.lat);
          const lng = Number(s.lng);
          if (!isFinite(lat) || !isFinite(lng)) return;

          // 가까운 allPlace를 찾아 라벨/카테고리 차용
          let label = `Day ${di + 1} 스톱 ${si + 1}`;
          let cat: string | undefined = "일정 포인트";
          let bestM = Infinity;
          let best: any = null;

          (allPlaces ?? []).forEach((p) => {
            const m = haversineKm(lat, lng, Number(p.lat), Number(p.lng)) * 1000;
            if (m < bestM) { bestM = m; best = p; }
          });

          if (best && bestM <= LABEL_NEAR_M) {
            label = placeLabel(best as any);
            cat = (best as any).category || cat;
          }

          out.push({
            id: `d${di + 1}-${si + 1}`,
            name: label,
            lat,
            lng,
            category: cat,
            dayIdx: di + 1,
          });
        });
      });

      // 50m 이내 좌표/이름 중복 제거
      const deduped = dedupePlaces(out.filter(Boolean) as any);
      deduped.forEach((p: any, i: number) => (p.idx = i + 1));
      return deduped as Array<{ id: string; name: string; lat: number; lng: number; category?: string } & { idx: number; dayIdx?: number }>;
    }

    // ⬇️ 일정 좌표가 없을 때만 fallback: 기존 allPlaces 기반
    const fromAll = (allPlaces ?? []).map((p, i) => ({
      id: p.id || `poi-${i + 1}`,
      name: placeLabel(p as any),
      lat: Number(p.lat),
      lng: Number(p.lng),
      category: p.category,
      idx: i + 1,
    }));
    return dedupePlaces(fromAll) as Array<{ id: string; name: string; lat: number; lng: number; category?: string } & { idx: number; dayIdx?: number }>;
  }, [days, allPlaces]);



  // 도시 경계/중심 기반 필터 함수
  const insideCity = useMemo(() => {
    // 여유 버퍼
    const BBOX_PAD_RATIO = 0.60;   // 60%로 완화 (기존 0.25)
    const AIRPORT_KEEP_KM = 40;    // 공항은 40km 이내면 포함
    const FALLBACK_RADIUS_KM = 120;

    // 미리 확장 박스 계산
    const expanded = cityBox ? expandBBox(cityBox, BBOX_PAD_RATIO) : null;

    // 중심 좌표 준비(없으면 basePlaces 중앙값)
    let centerLng = cityCenter?.[0];
    let centerLat = cityCenter?.[1];
    if ((centerLng == null || centerLat == null) && basePlaces.length >= 2) {
      const lats = basePlaces.map((p) => p.lat).sort((a, b) => a - b);
      const lngs = basePlaces.map((p) => p.lng).sort((a, b) => a - b);
      centerLat = lats[Math.floor(lats.length / 2)];
      centerLng = lngs[Math.floor(lngs.length / 2)];
    }

    // 실제 판별 함수: 포인트 객체를 받아 판단
    return (p: any) => {
      const lng = Number(p?.lng);
      const lat = Number(p?.lat);
      if (!isFinite(lng) || !isFinite(lat)) return false;

      // 1) 공항은 40km 이내면 무조건 포함
      if (isAirportPoi(p) && centerLng != null && centerLat != null) {
        const km = haversineKm(lat, lng, centerLat, centerLng);
        if (km <= AIRPORT_KEEP_KM) return true;
      }

      // 2) 도시 bbox가 있으면 여유를 넉넉히 준 박스 기준으로 포함
      if (expanded) return inBBox(lng, lat, expanded);

      // 3) bbox가 없으면 중심 반경 120km
      if (centerLng != null && centerLat != null) {
        return haversineKm(lat, lng, centerLat, centerLng) <= FALLBACK_RADIUS_KM;
      }

      // 4) 최후의 수단: 전부 허용
      return true;
    };
  }, [cityBox, cityCenter, basePlaces]);

// ▼ 사용부도 객체 기반으로 필터링 (기존: (lng,lat) -> boolean 이던 부분 교체)
  const places = useMemo(() => {
    const filtered = basePlaces.filter((p) => insideCity(p));
    setFilteredOutCnt(basePlaces.length - filtered.length);
    return filtered;
  }, [basePlaces, insideCity]);

  const daysFiltered = useMemo(() => {
    return (days ?? []).map((d, i) => ({
      dateOffset: d?.dateOffset ?? i,
      stops: (d?.stops ?? []).filter(
        (s) => insideCity({ lng: Number(s.lng), lat: Number(s.lat), category: "" })
      ),
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
  const [variant, setVariant] = useState<number>(0);

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
              "Accept-Language":
                (navigator.languages && navigator.languages[0]) || navigator.language || "ko",
            },
          });
          token = CSRF_COOKIE_CANDIDATES.map(getCookie).find(Boolean) ?? null;
        } catch { /* noop */ }
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
        } catch { /* fallthrough */ }
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
          !nickname || !travelWith || actType.length === 0 ||
          !schedule || !budget || !driving || !cont || !env || !pace
        ) {
          setError("입력 정보가 누락되어 추천을 불러올 수 없습니다. 처음부터 다시 시도해주세요.");
          setLoading(false);
          return;
        }

        // 🔎 URL 쿼리 파라미터 읽기 (fresh/variant/avoid/new_city)
        const fresh = params.get("fresh") || "0";
        const variant = params.get("variant") || "0";
        const avoid = params.get("avoid") || "";
        const newCity = params.get("new_city") || "0";
        const keepCity = params.get("keep_city") || "";

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

        // ✅ payload (LLM 다양화 힌트도 함께 주입)
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

            // 👇 프롬프트/캐시 키 다양화 힌트
            _variant: Number(variant) || 0,
            _force_new_city: newCity === "1",
            _avoid_cities: avoid ? avoid.split(",").map(s => s.trim()).filter(Boolean) : [],
            _keep_city: keepCity || undefined,
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

        // ✅ 서버가 Query로 받도록 fresh/variant/avoid/new_city를 URL에 붙임
        const qs = new URLSearchParams();
        if (fresh)   qs.set("fresh", fresh);
        if (variant) qs.set("variant", variant);
        if (avoid)   qs.set("avoid", avoid);
        if (newCity) qs.set("new_city", newCity);
        if (keepCity) qs.set("keep_city", keepCity);

        const url = `${API}/api/v1/survey/recommend${qs.toString() ? "?" + qs.toString() : ""}`;

        const res = await fetch(url, {
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
          if (res.status === 422) {
            try {
              const j = JSON.parse(raw);
              const min =
                j?.detail?.budget?.min_estimated_krw ??
                j?.detail?.budget?.minRequiredKRW;
              const msg =
                j?.detail?.message ||
                "예산이 부족합니다. 일정 생성을 위해 예산을 조금만 올려주세요.";
              const nice =
                `💸 ${msg}` +
                (typeof min === "number" ? `\n최소 필요 예산: ₩${min.toLocaleString()}` : "");
              throw new Error(nice);
            } catch {
              throw new Error(`예산이 부족하여 일정을 만들 수 없어요.\n(422 Unprocessable Entity)`);
            }
          }
          throw new Error(`서버 응답 오류: ${res.status} ${res.statusText}${raw ? `\n${raw}` : ""}`);
        }

        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
          console.log(
            "[DBG] parsed sample item =",
            JSON.stringify((Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || null), null, 2)
          );
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

        const normalized: Recommendation[] = (list || []).map((it) => {
          const hotelsFromVarious =
            (it?.lodging?.hotels && Array.isArray(it.lodging.hotels) ? it.lodging.hotels : null) ??
            (Array.isArray(it?.hotels) ? it.hotels : null) ??
            (Array.isArray(it?.accommodations) ? it.accommodations : null);

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
            meta: it.meta ?? undefined, // budget 메타 보존
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
    // ⬇⬇⬇ 쿼리스트링 변화에 반응하도록 search 포함
  }, [cont, env, pace, monthRaw, search]);


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
  // ✅ 같은 조건으로 새로 추천: 동일 도시 가능, 코스/호텔만 다양화
  const regenSameCity = (currentCity?: string) => {
    const p = new URLSearchParams(search);
    p.set("fresh", "1");
    p.set("variant", String(Date.now() % 100000));
    if (currentCity) p.set("keep_city", currentCity);  // 👈 현재 도시 이름 유지용
    p.delete("avoid");
    p.delete("new_city");
    nav(`/result?${p.toString()}`);
  };

  // ✅ 완전 다른 곳 추천: 현재 카드의 도시를 회피 + new_city 플래그
  const regenNewCity = (avoidCity: string) => {
    const p = new URLSearchParams(search);
    p.set("fresh", "1");
    p.set("variant", String(Date.now() % 100000));
    p.set("new_city", "1");                                      // 다른 도시 유도
    p.set("avoid", avoidCity);                                   // 백엔드에서 _avoid_cities 로 주입됨
    nav(`/result?${p.toString()}`);
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC] px-4 py-10 flex flex-col items-center">
      <ResultHero duration={durationKR} budget={budgetKR} transport={transport} month={monthKR}/>
      <div className="w-full max-w-3xl flex items-center justify-end gap-2 mb-3">
      </div>

      {loading ? (
        <motion.div animate={{rotate: 360}} transition={{repeat: Infinity, duration: 1.2}}
                    className="text-[#3F30C4] mb-8">
          <div className="w-12 h-12 border-4 border-violet-300 border-t-transparent rounded-full animate-spin"/>
        </motion.div>
      ) : error ? (
        <div className="max-w-xl w-full text-center text-red-600 flex flex-col items-center gap-3">
          <TriangleAlert size={40}/>
          <p className="whitespace-pre-wrap">{error}</p>
          <div className="flex gap-3 justify-center mt-1">
            <button onClick={retry} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
              다시 시도
            </button>
            <button onClick={() => nav("/login")}
                    className="px-4 py-2 rounded-lg border border-violet-300 text-[#6C3DF4] hover:bg-violet-50">
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
            const days = Object.entries(rec.schedule).sort(([a], [b]) => {
              const an = parseInt(a.match(/\d+/)?.[0] || "0", 10);
              const bn = parseInt(b.match(/\d+/)?.[0] || "0", 10);
              return an - bn || a.localeCompare(b);
            });
            const lodgingPick = pickLodging(rec);
            return (
              <article
                key={`${rec.city}-${rec.country}-${index}`}
                className="p-6 rounded-2xl bg-white border border-violet-100 shadow-[0_8px_30px_rgba(80,0,200,0.06)]"
              >
                {/* 💸 예산 부족 메타 경고 */}
                <div className="mb-3">
                  <BudgetAlert meta={rec.meta}/>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-[#3F30C4]">
                      {rec.city}, {rec.country}
                    </h2>
                    <p className="text-gray-700 mt-1 leading-relaxed">{rec.reason}</p>

                    {/* 최소 일정 모드 뱃지 */}
                    {rec.meta?.budget?.ok === false ? (
                      <div
                        className="inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        최소 일정 모드
                      </div>
                    ) : null}

                    <MetaChips duration={durationKR} budget={budgetKR} transport={transport} month={monthKR}/>
                    <BudgetSummary budgetMeta={rec.meta?.budget} userBudgetKRWRaw={budgetKR}/>

                    {/* 🏨 숙소 추천 블록 — 항상 상세형 우선 */}
                    {(() => {
                      const hotels = rec.lodging?.hotels ?? [];

                      // ✅ 호텔이 1개라도 있으면 상세형 카드로 고정
                      if (hotels.length > 0) {
                        return <HotelCards city={rec.city} hotels={hotels} />;
                      }

                      // ↪️ 호텔이 전혀 없을 때만 권역(간단형)으로 폴백
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
                      <PlaneTakeoff size={16}/>
                      항공권 검색
                    </button>

                    <button
                      type="button"
                      onClick={() => copyItinerary(rec)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
                      title="일정 복사"
                    >
                      <Copy size={16}/>
                      일정 복사
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  {days.map(([dayKey, acts], i) => (
                    <DaySection key={dayKey} title={dayLabel(dayKey)} activities={acts} defaultOpen={i === 0}/>
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

                <div className="flex flex-wrap gap-2 mt-6">
                  {/* 🔄 같은 조건으로 새로 추천 (도시는 유지, 코스/숙소 다양화) */}
                  <button
                    type="button"
                    onClick={() => regenSameCity(rec.city)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
                    title="동일 조건으로 다른 코스 제안"
                  >
                    <RefreshCw size={16}/>
                    다시 추천받기
                  </button>

                  {/* 🔀 완전 다른 곳 추천 (현재 도시 회피 + new_city) */}
                  <button
                    type="button"
                    onClick={() => regenNewCity(`${rec.city}`)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700"
                    title="완전 다른 도시로 추천"
                  >
                    <Shuffle size={16}/>
                    완전 다른 곳 보기
                  </button>

                  {/* 기존 내비게이션 */}
                  <button
                    onClick={() => nav('/step-time')}   // ← nav(-1) 대신 명시 경로
                    className="ml-auto text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50"
                  >
                    <CircleArrowLeft/>
                    뒤로가기
                  </button>
                  <button
                    onClick={() => nav("/")}
                    className="text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50"
                  >
                    <Home/>
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
