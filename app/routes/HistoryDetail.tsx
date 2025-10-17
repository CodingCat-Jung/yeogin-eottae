import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TriangleAlert, Copy } from "lucide-react";

import { HistorySection } from "@/components/HistorySection";
import { ResultData } from "@/components/ResultData";
import { useAuthStore } from "@/store/authStore";

const API_BASE = "";
// import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

type DetailResp = {
  preferences?: any;
  recommendation?: any[]; // 결과 배열
  result?: any[];
  data?: any[];
};

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* ---- 인덱스 탐색 ---- */
function findIndexByRecId(arr: any[], recId: number | null) {
  if (!Array.isArray(arr) || recId == null) return -1;
  const keys = ["id", "rec_id", "recommendation_id", "result_id"];
  return arr.findIndex((r) => keys.some((k) => r?.[k] === recId));
}
function findIndexByCityCountry(arr: any[], city?: string | null, country?: string | null) {
  if (!Array.isArray(arr) || (!city && !country)) return -1;
  const ci = (city ?? "").trim().toLowerCase();
  const co = (country ?? "").trim().toLowerCase();
  let idx = arr.findIndex(
    (r) =>
      (r?.city ?? r?.destination ?? r?.place ?? "").toLowerCase() === ci &&
      (r?.country ?? "").toLowerCase() === co
  );
  if (idx >= 0) return idx;
  if (ci) {
    idx = arr.findIndex((r) => (r?.city ?? r?.destination ?? r?.place ?? "").toLowerCase() === ci);
    if (idx >= 0) return idx;
  }
  if (co) {
    idx = arr.findIndex((r) => (r?.country ?? "").toLowerCase() === co);
    if (idx >= 0) return idx;
  }
  return -1;
}

/* ---------- 표시 맵/유틸 (값 매핑은 그대로 유지) ---------- */
const styleMap: Record<string, string> = {
  foodie: "먹방 여행", healing: "힐링 여행", adventure: "액티비티", shopping: "쇼핑", culture: "문화/역사",
  nature: "자연", luxury: "럭셔리", budget: "가성비", photo: "사진", festival: "축제",
};
const drivingMap: Record<string, { icon: string; value: string }> = {
  public: { icon: "🚌", value: "대중교통" }, car: { icon: "🚗", value: "자가용 운전" }, walk: { icon: "🚶", value: "도보 중심" },
};
const climateMap: Record<string, { icon: string; value: string }> = {
  hot: { icon: "🔥", value: "더운 지역" },
  warm: { icon: "🌤️", value: "따뜻한 지역" },
  mild: { icon: "🌤️", value: "온화한 지역" },
  fresh: { icon: "🍃", value: "선선한 지역" },
  cold: { icon: "❄️", value: "추운 지역" },
  snowy: { icon: "🌨️", value: "눈 내리는 지역" },
};
const densityMap: Record<string, { icon: string; value: string }> = {
  relaxed: { icon: "🌿", value: "느긋하게" },
  calm: { icon: "🌿", value: "느긋하게" },
  normal: { icon: "🙂", value: "적당히" },
  moderate: { icon: "🙂", value: "적당히" },
  active: { icon: "⚡", value: "활동적으로" },
  fast: { icon: "⚡", value: "활동적으로" },
};
const continentMap: Record<string, { icon: string; value: string }> = {
  asia: { icon: "🌏", value: "아시아" }, europe: { icon: "🌍", value: "유럽" }, africa: { icon: "🌍", value: "아프리카" }, oceania: { icon: "🌏", value: "오세아니아" },
  north_america: { icon: "🌎", value: "북미" }, south_america: { icon: "🌎", value: "남미" }, middle_east: { icon: "🌍", value: "중동" }, etc: { icon: "🗺️", value: "기타" },
};
const slotMap: Record<string, { icon: string; value: string }> = {
  dawn: { icon: "🌙", value: "새벽" },
  morning: { icon: "🌅", value: "오전" },
  afternoon: { icon: "☀️", value: "오후" },
  evening: { icon: "🌇", value: "저녁" },
  새벽: { icon: "🌙", value: "새벽" },
  오전: { icon: "🌅", value: "오전" },
  오후: { icon: "☀️", value: "오후" },
  저녁: { icon: "🌇", value: "저녁" },
};

function pick<T>(map: Record<string, T>, v: unknown): T | undefined {
  if (v == null) return undefined;
  const raw = String(v);
  const lower = raw.toLowerCase();
  return map[lower] ?? (map[raw] as T | undefined);
}
function formatBudget(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v.toLocaleString("ko-KR") + " KRW";
  if (typeof v === "string") {
    const digits = v.replace(/\D/g, "");
    if (digits) {
      const n = Number(digits);
      if (!Number.isNaN(n)) return n.toLocaleString("ko-KR") + " KRW";
    }
    return v;
  }
  return String(v);
}
function formatDuration(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/(\d+)\s*night[s]?\s*(\d+)\s*day[s]?/i);
  if (m) return `${m[1]}박 ${m[2]}일`;
  return v;
}

/** 추천 응답에서 대표 숙소명 1개만 뽑기 */
function getPrimaryHotelName(rec: any): string | null {
  if (!rec || typeof rec !== "object") return null;

  // 1) 서버가 준 호텔 카드 최우선
  const h = rec?.lodging?.hotels?.[0];
  const hotelFromCard =
    h?.name_ko || h?.name_original || h?.name || null;
  if (hotelFromCard && String(hotelFromCard).trim()) return String(hotelFromCard).trim();

  // 2) 흔한 필드 폴백
  const candidates = [
    rec?.hotel_name,
    rec?.hotel,
    rec?.accommodation,
    rec?.stay_name,
  ].filter(Boolean);
  if (candidates.length) return String(candidates[0]).trim() || null;

  // 3) allPlaces에서 호텔처럼 보이는 이름 1개
  const looksLikeHotel = (s: string) =>
    /(hotel|hostel|inn|resort|ryokan|bnb|guest\s*house)/i.test(s) ||
    /호텔|호스텔|인|료칸|게스트하우스/.test(s);
  const p = (rec?.allPlaces || []).find((p: any) => {
    const nm = p?.name_ko || p?.name || p?.name_original || "";
    return nm && looksLikeHotel(String(nm));
  });
  if (p) return String(p.name_ko || p.name || p.name_original).trim();

  // 4) 일정 텍스트에서 “호텔/호스텔/료칸 …” 패턴 대충 1개
  try {
    const schedule = rec?.schedule || {};
    const days = Object.keys(schedule).sort();
    for (const k of days) {
      for (const a of schedule[k] || []) {
        const t = String(a?.activity || "");
        const m =
          t.match(/(?:호텔|호스텔|게스트하우스|료칸)\s*[:\-\s]*([^\(\)]+?)(?:\(|$)/) ||
          t.match(/(?:Hotel|Hostel|Inn|Resort|Ryokan)\s*[:\-\s]*([^\(\)]+?)(?:\(|$)/i);
        if (m && m[1]) {
          const name = m[1].replace(/\b(추천|배정|근처)\b/g, "").trim();
          if (name) return name;
        }
      }
    }
  } catch {}

  return null;
}

function humanizePreferences(raw: any = {}) {
  const style =
    Array.isArray(raw.style) || Array.isArray(raw.styles)
      ? (raw.style ?? raw.styles).map((s: string) => styleMap[s] ?? s)
      : raw.style ? [styleMap[raw.style] ?? raw.style] : undefined;

  const budget = formatBudget(raw.budget);
  const duration = formatDuration(raw.duration);

  const driving = pick(drivingMap, raw.driving);
  const cont = pick(continentMap, raw.continent ?? raw.cont);
  const climate =
    pick(climateMap, raw.climate) ??
    (raw.season ? { icon: "🌤️", value: String(raw.season) } : undefined);

  const densityKey = raw.density ?? raw.pace ?? raw.travel_pace;
  const density =
    densityKey != null && String(densityKey).trim() !== "-"
      ? densityMap[String(densityKey)] ?? { icon: "•", value: String(densityKey) }
      : undefined;

  const toMonths = (v: any): string[] | undefined => {
    if (v == null || v === "-" || v === "") return undefined;
    if (Array.isArray(v)) {
      const ns = v.flatMap((x) => String(x).split(/[,\s]/).filter(Boolean)).map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
      return ns.length ? ns.map((n) => `${n}월`) : undefined;
    }
    const ns = String(v).split(/[,\s]/).filter(Boolean).map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
    return ns.length ? ns.map((n) => `${n}월`) : undefined;
  };
  const months = toMonths(raw.travel_month) || toMonths(raw.months) || toMonths(raw.month);

  const departSlot = raw.depart_window != null ? (slotMap[String(raw.depart_window)] ?? { icon: "•", value: String(raw.depart_window) }) : undefined;
  const returnSlot = raw.return_window != null ? (slotMap[String(raw.return_window)] ?? { icon: "•", value: String(raw.return_window) }) : undefined;

  const comp = raw.companion ? { icon: "👥", value: String(raw.companion) } : undefined;

  return { comp, style, duration, budget, driving, cont, climate, density, months, departSlot, returnSlot };
}

/* ---------- 일정 복사 ---------- */
type Act = {
  time?: string;
  activity?: string;
  desc?: string;
  what?: string;
  title?: string;
  place?: string;
  name?: string;
};
function dayLabelKR(key: string) { const m = key.match(/(\d+)/); return m ? `${m[1]}일차` : key.replace(/_/g, " "); }
function unwrapRecommendationNode(input: any): any {
  if (!input) return null;
  const direct = input?.recommendation ?? input?.result ?? input?.data ?? input?.payload ?? input?.item ?? null;
  if (direct) return unwrapRecommendationNode(direct);
  if (Array.isArray(input)) return input[0] ?? null;
  for (const v of Object.values(input)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      const looksLikeRec = v.find((x: any) => x && (x.city || x.destination || x.country || x.reason || x.schedule || x.plan));
      if (looksLikeRec) return looksLikeRec;
    }
  }
  return input;
}
function extractSchedule(raw: any): Record<string, Act[]> {
  const candidate = raw?.schedule ?? raw?.plan ?? raw?.itinerary ?? raw?.days ?? raw?.detail ?? raw?.schedules ?? raw?.plans ?? null;
  const makeAct = (a: any): Act => ({ time: a?.time ?? a?.at ?? a?.hour ?? "", activity: a?.activity ?? a?.desc ?? a?.what ?? a?.title ?? a?.place ?? a?.name ?? "" });
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const out: Record<string, Act[]> = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (Array.isArray(v)) out[k] = v.map((x: any) => (typeof x === "string" ? ({ time: "", activity: x }) : makeAct(x)));
    }
    if (Object.keys(out).length) return out;
  }
  if (Array.isArray(candidate)) {
    return { day_1: candidate.map((x: any) => (typeof x === "string" ? ({ time: "", activity: x }) : makeAct(x))) };
  }
  if (raw && typeof raw === "object") {
    const out: Record<string, Act[]> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (/^day[_\s-]?\d+/i.test(k) && Array.isArray(v)) out[k] = v.map((x: any) => (typeof x === "string" ? ({ time: "", activity: x }) : makeAct(x)));
    }
    if (Object.keys(out).length) return out;
  }
  return {};
}
function buildItineraryText(input: any) {
  const data = unwrapRecommendationNode(input);
  if (!data) return "";
  const city = data?.city ?? data?.destination ?? data?.title ?? data?.meta?.city ?? "";
  const country = data?.country ?? data?.nation ?? data?.meta?.country ?? "";
  const head = [city, country].filter(Boolean).join(", ");
  const reason = data?.reason ?? data?.explain ?? data?.summary ?? data?.desc ?? data?.why ?? "";
  const schedule = extractSchedule(data);
  const lines: string[] = [];
  if (head) lines.push(head);
  if (reason) lines.push(String(reason));
  if (Object.keys(schedule).length) {
    Object.entries(schedule).forEach(([key, acts]) => {
      lines.push(`\n[${dayLabelKR(key)}]`);
      (acts || []).forEach((a) => {
        const t = a?.time ?? "";
        const act = a?.activity ?? a?.desc ?? a?.what ?? "";
        if (t || act) lines.push(`${t ? `${t} - ` : ""}${act}`);
      });
    });
  }
  if (lines.length === 0 && (city || country)) lines.push([city, country].filter(Boolean).join(", "));
  return lines.join("\n").trim();
}
async function copyItinerary(data: any) {
  const text = buildItineraryText(data);
  if (!text) { alert("복사할 일정이 없습니다."); return; }
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); alert("일정이 복사되었습니다!"); return; } catch {}
  }
  try {
    const temp = document.createElement("textarea");
    temp.value = text; temp.style.position = "fixed"; temp.style.left = "-9999px";
    document.body.appendChild(temp); temp.focus(); temp.select();
    const ok = document.execCommand("copy"); document.body.removeChild(temp);
    if (ok) alert("일정이 복사되었습니다!");
    else throw new Error("fail");
  } catch { alert("복사 실패. 브라우저 권한을 확인해주세요."); }
}

export default function HistoryDetail() {
  const { id } = useParams(); // survey id
  const [sp] = useSearchParams();

  const idxParam = Number(sp.get("idx"));
  const recIdParam = Number(sp.get("recId") ?? sp.get("rid") ?? sp.get("recommendationId"));
  const wantIdx = Number.isFinite(idxParam) ? idxParam : null;
  const wantRecId = Number.isFinite(recIdParam) ? recIdParam : null;
  const wantCity = sp.get("city");
  const wantCountry = sp.get("country");

  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  const [prefs, setPrefs] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);

  const total = results.length;
  const clampedIndex = useMemo(
    () => Math.max(0, Math.min(pageIndex, Math.max(total - 1, 0))),
    [pageIndex, total]
  );

  useEffect(() => {
    document.title = "기록 상세 - 여긴어때";
  }, []);

  useEffect(() => {
    let abort = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/v1/survey/detail/${id}`;
        const res = await fetch(url, {
          headers: buildHeaders(token || undefined),
          credentials: "include",
        });

        if (res.status === 401) {
          logout();
          navigate(`/login?re_uri=/history/detail/${id}`, { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json: DetailResp = await res.json();
        const arr = (json?.recommendation ?? json?.result ?? json?.data ?? []) as any[];
        const preferences = json?.preferences ?? {};

        if (!abort) {
          setResults(Array.isArray(arr) ? arr : []);
          setPrefs(humanizePreferences(preferences));

          let init = 0;
          if (Number.isFinite(wantIdx as any) && arr.length) {
            init = Math.max(0, Math.min(wantIdx!, arr.length - 1));
          } else {
            let byRec = findIndexByRecId(arr, wantRecId);
            if (byRec < 0) byRec = findIndexByCityCountry(arr, wantCity, wantCountry);
            if (byRec >= 0) init = byRec;
          }
          setPageIndex(init);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "상세를 불러오지 못했어요.");
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [id, token, logout, navigate, wantIdx, wantRecId, wantCity, wantCountry]);

  useEffect(() => {
    if (!total) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`result-${clampedIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add(
          "ring-2",
          "ring-violet-300",
          "shadow-[0_0_0_4px_rgba(167,139,250,0.25)]"
        );
        setTimeout(() => {
          el.classList.remove(
            "ring-2",
            "ring-violet-300",
            "shadow-[0_0_0_4px_rgba(167,139,250,0.25)]"
          );
        }, 1600);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [clampedIndex, total]);

  /* ───────── 디자인 맞춤: HistoryList와 동일 스코프 ───────── */
  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="history-scope w-full mx-auto max-w-screen-sm md:max-w-3xl px-3 sm:px-4 md:px-6 py-3 md:py-6">
      {/* 북마크 숨김 + 세이프영역 */}
      <style>{`
        .history-scope .lucide-bookmark { display: none !important; }
        .history-scope button:has(.lucide-bookmark) { display: none !important; }
        @supports(padding:max(0px)) {
          .safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
        }
      `}</style>
      {children}
    </div>
  );

  if (error) {
    return (
      <Container>
        <button
          onClick={() => navigate("/history")}
          className="mb-4 text-sm text-purple-600 underline underline-offset-2"
        >
          ← 기록으로
        </button>
        <div className="bg-white/80 rounded-2xl p-8 shadow ring-1 ring-zinc-200 text-center">
          <div className="flex flex-col items-center gap-3">
            <TriangleAlert className="w-10 h-10 text-rose-500" />
            <p className="text-zinc-600 text-sm">에러: {error}</p>
          </div>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
          불러오는 중…
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-purple-600 underline underline-offset-2"
      >
        ← 마이페이지로
      </button>

      <HistorySection
        index={clampedIndex}
        total={total}
        loading={false}
        detail={{ preferences: prefs, recommendation: results }}
        onPrev={() => setPageIndex((v) => Math.max(0, v - 1))}
        onNext={() => setPageIndex((v) => Math.min(total - 1, v + 1))}
        hideHeaderPager={true}   // ✅ 이 한 줄만 추가!
        RecommendationSlot={({ data }) => (
          <>

            <ResultData
              data={data}
              surveyId={id}
              initialIndex={clampedIndex}
              hideInlineActions={false}    // ✅ HistoryList와 동일(하트만 보이게)
              wishMode="card"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => copyItinerary(data)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
                title="일정 복사"
              >
                <Copy size={16} />
                일정 복사
              </button>
            </div>
          </>
        )}
      />
    </Container>
  );
}
