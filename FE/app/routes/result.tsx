// app/routes/result.tsx
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

/* ---------- Types ---------- */
type Activity = { time: string; activity: string };
type CitySchedule = Record<string, Activity[]>;
type Recommendation = {
  city: string;
  country: string;
  reason: string;
  schedule: CitySchedule; // 백엔드에서 배열→맵 변환 완료 전제
};

/* ---------- 세련된 히어로 ---------- */
function ResultHero({
                      duration,
                      budget,
                      transport,
                    }: {
  duration: string;
  budget: string;
  transport: string;
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
      {/* 부드러운 글로우 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 flex justify-center"
      >
        <div className="h-44 w-44 rounded-full bg-gradient-to-br from-violet-300/30 to-fuchsia-200/25 blur-3xl" />
      </div>

      {/* 프리헤더 배지 */}
      <div className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-700 backdrop-blur">
        ✨ 여행 취향 기반 추천
      </div>

      {/* 타이틀 */}
      <h1 className="mt-3 text-3xl md:text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
        당신만을 위한{" "}
        <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
          여행지
        </span>
        를 추천해요
      </h1>

      {/* 서브 카피 */}
      <p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-gray-600">
        선택하신 정보를 바탕으로 어울리는 여행지를 골라봤어요
      </p>

      {/* 요약 칩 */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <Chip>{duration}</Chip>
        <Chip>{toKRWString(budget)}</Chip>
        <Chip>{TransportText} 기준</Chip>
      </div>

      {/* 얇은 디바이더 */}
      <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-violet-400/50 via-fuchsia-400/50 to-violet-400/50" />
    </motion.header>
  );
}

/* ---------- Small utils ---------- */
const getCookie = (name: string) => {
  const v = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
  return v ? decodeURIComponent(v) : null;
};

const CSRF_COOKIE_CANDIDATES = [
  "csrf_access_token",
  "csrftoken",
  "csrf_token",
  "XSRF-TOKEN",
];

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

/* ✈️ 항공권 CTA 유틸 */
function openFlights(dstCity: string, dstIataHint?: string) {
  const origin = (localStorage.getItem("originAirport") || "ICN").toUpperCase();
  const dep = localStorage.getItem("departDate") || "";
  const ret = localStorage.getItem("returnDate") || "";

  // IATA 코드 힌트가 있으면 사용, 없으면 도시명으로 검색
  const dst = (dstIataHint || dstCity).toUpperCase();

  const url =
    dep && ret && /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(dst)
      ? `https://www.google.com/travel/flights?hl=ko#flt=${origin}.${dst}.${dep}*${dst}.${origin}.${ret}`
      : `https://www.google.com/travel/flights?hl=ko&curr=KRW&q=flights%20from%20${origin}%20to%20${encodeURIComponent(
        dstCity
      )}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

/* ---------- UI pieces ---------- */
function MetaChips({
                     duration,
                     budget,
                     transport,
                   }: {
  duration: string;
  budget: string;
  transport: string;
}) {
  const Tag = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-100">
      {children}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2 mt-3">
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
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

/* ---------- Page ---------- */
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

  useEffect(() => {
    let aborted = false;

    async function ensureCsrf(API: string) {
      let token = CSRF_COOKIE_CANDIDATES.map(getCookie).find(Boolean) ?? null;
      if (!token) {
        const csrfPath = import.meta.env.VITE_CSRF_ENDPOINT ?? "/api/auth/csrf";
        try {
          await fetch(`${API}${csrfPath}`, {
            method: "GET",
            credentials: "include",
          });
          token = CSRF_COOKIE_CANDIDATES.map(getCookie).find(Boolean) ?? null;
        } catch {
          /* noop */
        }
      }
      return token;
    }

    async function fetchResult() {
      const nickname = localStorage.getItem("nickname");
      const travelWith = localStorage.getItem("travelWith");
      const actType = localStorage.getItem("actType");
      const schedule = localStorage.getItem("schedule");
      const budget = localStorage.getItem("budget");
      const transport = localStorage.getItem("transport");

      // ✅ step-time에서 저장한 값도 읽어온다
      const departWindow = localStorage.getItem("departWindow") || ""; // 'dawn'|'morning'|'afternoon'|'evening'
      const returnWindow = localStorage.getItem("returnWindow") || "";

      if (
        !nickname ||
        !travelWith ||
        !actType ||
        !schedule ||
        !budget ||
        !transport ||
        !cont ||
        !env ||
        !pace
      ) {
        setError(
          "입력 정보가 누락되어 추천을 불러올 수 없습니다. 처음부터 다시 시도해주세요."
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const API =
          import.meta.env.VITE_BACKEND_ADDRESS ?? "http://localhost:8000";

        const token =
          localStorage.getItem("access_token") ||
          localStorage.getItem("token") ||
          sessionStorage.getItem("access_token") ||
          sessionStorage.getItem("token") ||
          "";

        const useCookieAuth = !token;
        let csrfToken: string | null = null;
        if (useCookieAuth) csrfToken = await ensureCsrf(API);

        const payload = {
          nickname,
          preferences: {
            companion: travelWith,
            style: actType.split(",").map((s) => s.trim()).filter(Boolean),
            duration: schedule,
            budget,
            climate: env,
            continent: cont,
            density: pace,
            driving: transport,
            // ✅ 새로 추가: 출/귀국 시간대 힌트
            depart_window: departWindow || null,
            return_window: returnWindow || null,
          },
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (!useCookieAuth) {
          headers.Authorization = `Bearer ${token}`;
        } else if (csrfToken) {
          const hdr = import.meta.env.VITE_CSRF_HEADER ?? "X-CSRF-Token";
          headers[hdr] = csrfToken;
          headers["X-CSRFToken"] = csrfToken;
          headers["X-XSRF-TOKEN"] = csrfToken;
        }

        const res = await fetch(`${API}/api/v1/survey/recommend`, {
          method: "POST",
          headers,
          credentials: useCookieAuth ? "include" : "same-origin",
          body: JSON.stringify(payload),
        });

        if (res.status === 403) {
          const msg = (await res.text().catch(() => "")) || "Forbidden";
          throw new Error(
            `CSRF 검증에 실패했습니다. 새로고침 후 다시 시도하거나 로그인해 주세요.\n${msg}`
          );
        }
        if (res.status === 401) {
          const msg = (await res.text().catch(() => "")) || "Unauthorized";
          throw new Error(`세션이 만료되었거나 로그인 정보가 없습니다. (${msg})`);
        }
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(
            `서버 응답 오류: ${res.status} ${res.statusText}${
              msg ? `\n${msg}` : ""
            }`
          );
        }

        const data = (await res.json()) as { data: Recommendation[] };
        if (!aborted) setResultData(data?.data ?? []);
      } catch (e: any) {
        if (!aborted)
          setError(
            e?.message || "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
          );
        console.error("❌ 추천 조회 실패:", e);
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    fetchResult();
    return () => {
      aborted = true;
    };
  }, [cont, env, pace]);

  const durationKR = useMemo(() => {
    const s = (localStorage.getItem("schedule") || "").toLowerCase();
    const m = s.match(/(\d+)\s*night.*?(\d+)\s*days/);
    if (m) return `${m[1]}박 ${m[2]}일`;
    return s || "여행 기간";
  }, []);

  const budgetKR = localStorage.getItem("budget") || "";
  const transport = localStorage.getItem("transport") || "public";

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
      <ResultHero duration={durationKR} budget={budgetKR} transport={transport} />

      {loading ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="text-[#3F30C4] mb-8"
        >
          <div className="w-12 h-12 border-4 border-violet-300 border-t-transparent rounded-full animate-spin" />
        </motion.div>
      ) : error ? (
        <div className="max-w-xl w-full text-center text-red-600 flex flex-col items-center gap-3">
          <TriangleAlert size={40} />
          <p className="whitespace-pre-wrap">{error}</p>
          <div className="flex gap-3 justify-center mt-1">
            <button
              onClick={retry}
              className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
            >
              다시 시도
            </button>
            <button
              onClick={() => nav("/login")}
              className="px-4 py-2 rounded-lg border border-violet-300 text-[#6C3DF4] hover:bg-violet-50"
            >
              로그인으로
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-6">
          {(!resultData || resultData.length === 0) && (
            <div className="text-center text-gray-600">
              추천 결과가 비어있어요. 조건을 바꿔 다시 시도해보세요.
            </div>
          )}

          {resultData?.map((rec, index) => {
            const days = Object.entries(rec.schedule);
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
                    <p className="text-gray-700 mt-1 leading-relaxed">
                      {rec.reason}
                    </p>
                    <MetaChips
                      duration={durationKR}
                      budget={budgetKR}
                      transport={transport}
                    />
                  </div>

                  <div className="shrink-0 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openFlights(rec.city /*, 'IATA_HINT' */)}
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
                    <DaySection
                      key={dayKey}
                      title={dayLabel(dayKey)}
                      activities={acts}
                      defaultOpen={i === 0}
                    />
                  ))}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => nav(-1)}
                    className="text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50"
                  >
                    <CircleArrowLeft />
                    뒤로가기
                  </button>
                  <button
                    onClick={() => nav("/")}
                    className="text-[#6C3DF4] flex items-center gap-1 px-3 py-2 border border-violet-300 rounded-xl hover:bg-violet-50"
                  >
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
