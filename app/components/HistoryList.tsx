// routes/HistoryList.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import HistorySection from "./HistorySection";
import { ResultData } from "./ResultData";

import { useAuthStore } from "@/store/authStore";
import { useTravelStore } from "@/store/travelStore";

/* ======================= 환경/유틸 ======================= */
const API_BASE ="";
  //import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* ======================= 타입 ======================= */
type HistoryRow = { survey_id: number; recommendation_id?: number; created_at?: string };
type DetailResp = { preferences?: any; recommendation?: any; result?: any; data?: any };
type RecItem = any;

/* ======================= 표시 유틸 ======================= */
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

/* ---------- 매핑 ---------- */
const companionMap: Record<string, { icon: string; value: string }> = {
  alone: { icon: "👤", value: "혼자" },
  solo: { icon: "👤", value: "혼자" },
  couple: { icon: "👫", value: "연인" },
  friends: { icon: "👥", value: "친구" },
  family: { icon: "👨‍👩‍👧‍👦", value: "가족" },
  group: { icon: "👥", value: "단체" },
  pet: { icon: "🐶", value: "반려동물과" },
};
const companionAlias: Record<string, string> = {
  "혼자":"alone","1인":"alone","solo":"alone","single":"alone","솔로":"alone","alones":"alone",
  "연인":"couple","커플":"couple","부부":"couple","couple":"couple",
  "친구":"friends","지인":"friends","friends":"friends",
  "가족":"family","패밀리":"family","family":"family","부모님":"family","아이와":"family","아이와함께":"family",
  "단체":"group","그룹":"group","group":"group","회사동료":"group",
  "반려동물":"pet","pet":"pet","withpet":"pet",
};
const companionIndexMap: Record<string, string> = {"0":"alone","1":"couple","2":"friends","3":"family","4":"group"};
const styleMap: Record<string, string> = {
  foodie:"먹방 여행", healing:"힐링 여행", adventure:"액티비티", shopping:"쇼핑", culture:"문화/역사",
  nature:"자연", luxury:"럭셔리", budget:"가성비", photo:"사진", festival:"축제",
};
const drivingMap: Record<string, { icon: string; value: string }> = {
  public:{icon:"🚌",value:"대중교통"}, car:{icon:"🚗",value:"자가용 운전"}, walk:{icon:"🚶",value:"도보 중심"},
};
const climateMap: Record<string, { icon: string; value: string }> = {
  hot:{icon:"🔥",value:"더운 지역"}, warm:{icon:"🌤️",value:"따뜻한 지역"}, mild:{icon:"🌤️",value:"온화한 지역"},
  fresh:{icon:"🍃",value:"선선한 지역"}, cold:{icon:"❄️",value:"추운 지역"},
};
const densityMap: Record<string, { icon: string; value: string }> = {
  calm:{icon:"🌿",value:"여유로운 장소"}, normal:{icon:"🙂",value:"보통"}, active:{icon:"⚡",value:"활기찬 장소"}, crowded:{icon:"👥",value:"붐비는 장소"},
};
const continentMap: Record<string, { icon: string; value: string }> = {
  asia:{icon:"🌏",value:"아시아"}, europe:{icon:"🌍",value:"유럽"}, africa:{icon:"🌍",value:"아프리카"}, oceania:{icon:"🌏",value:"오세아니아"},
  north_america:{icon:"🌎",value:"북미"}, south_america:{icon:"🌎",value:"남미"}, middle_east:{icon:"🌍",value:"중동"}, etc:{icon:"🗺️",value:"기타"},
  아시아:{icon:"🌏",value:"아시아"}, 유럽:{icon:"🌍",value:"유럽"},
};

function pick<T>(map: Record<string, T>, v: unknown): T | undefined {
  if (v == null) return undefined;
  const raw = String(v);
  const lower = raw.toLowerCase();
  return map[lower] ?? (map[raw] as T | undefined);
}
function pickCompanionField(prefs: any) {
  return (
    prefs?.companion ?? prefs?.comp ?? prefs?.companion_type ?? prefs?.companionType ??
    prefs?.company ?? prefs?.with_whom ?? prefs?.withWhom
  );
}
function normalizeCompanionKey(v: unknown): string | undefined {
  if (v == null) return undefined;
  const raw = String(v).trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[\s_]/g, "");
  if (companionIndexMap[lower]) return companionIndexMap[lower];
  return companionAlias[raw] || companionAlias[lower] || companionAlias[compact] || lower;
}
function humanizePreferences(raw: any = {}) {
  const compRaw = pickCompanionField(raw);
  const compKey = normalizeCompanionKey(compRaw);
  let comp = compKey ? companionMap[compKey] : undefined;
  if (!comp && compRaw != null && String(compRaw).trim() !== "") {
    comp = { icon: "•", value: String(compRaw) };
  }
  const style =
    Array.isArray(raw.style) || Array.isArray(raw.styles)
      ? (raw.style ?? raw.styles).map((s: string) => styleMap[s] ?? s)
      : raw.style ? [styleMap[raw.style] ?? raw.style] : undefined;

  return {
    comp,
    style,
    duration: formatDuration(raw.duration),
    budget: formatBudget(raw.budget),
    driving: pick(drivingMap, raw.driving),
    climate: pick(climateMap, raw.climate),
    cont: pick(continentMap, raw.continent ?? raw.cont),
    density: pick(densityMap, raw.density),
  };
}

/* ======================= me 보정 ======================= */
async function ensureUser() {
  const { token, setUser, setAuthed } = useAuthStore.getState();
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: buildHeaders(token || undefined),
      credentials: "include",
    });
    if (res.ok) {
      const me = await res.json();
      setUser?.({ id: me.id, nickname: me.nickname, email: me.email });
      setAuthed?.(true);
    }
  } catch {}
}

/* ======================= 메인 ======================= */
export default function HistoryList() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const token = useAuthStore((s) => s.token);
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const user = useAuthStore((s) => s.user);
  const nicknameFromTravel = useTravelStore((s) => s.nickname);

  const nickname = user?.nickname || nicknameFromTravel || null;
  const ready = (!!token || isAuthed) && !!nickname;

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [index, setIndex] = useState(0);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [detail, setDetail] = useState<{ preferences?: any; recommendation?: RecItem } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ((token || isAuthed) && !nickname) void ensureUser();
  }, [token, isAuthed, nickname]);

  // 리스트 로드 + recId/idx 처리
  useEffect(() => {
    if (!ready) return;
    let abort = false;

    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/v1/survey/history/${encodeURIComponent(nickname!)}`;
        const res = await fetch(url, { headers: buildHeaders(token || undefined), credentials: "include" });

        if (res.status === 401) {
          useAuthStore.getState().logout();
          navigate(`/login?re_uri=/history`, { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const list: HistoryRow[] = json?.results ?? json?.list ?? json ?? [];
        if (abort) return;

        const arr = Array.isArray(list) ? list : [];
        setRows(arr);

        const recIdRaw = sp.get("recId");
        const idxRaw = sp.get("idx");
        const recIdParam = recIdRaw != null ? Number(recIdRaw) : null;
        const idxParam = idxRaw != null ? Number(idxRaw) : null;

        let startIdx = 0;

        if (recIdParam != null && Number.isFinite(recIdParam)) {
          const found = arr.findIndex((r) => r?.recommendation_id === recIdParam);
          if (found >= 0) startIdx = found;
          else {
            for (let i = 0; i < arr.length; i++) {
              if (abort) return;
              const row = arr[i];
              try {
                const dRes = await fetch(`${API_BASE}/api/v1/survey/detail/${row.survey_id}`, {
                  headers: buildHeaders(token || undefined), credentials: "include",
                });
                if (!dRes.ok) continue;
                const dJson: any = await dRes.json();
                const recos: any[] = (dJson?.recommendation ?? dJson?.result ?? dJson?.data ?? []) as any[];
                if (!Array.isArray(recos)) continue;
                const hit = recos.some((r) => {
                  const id = r?.id ?? r?.rec_id ?? r?.recommendation_id ?? r?.result_id ?? null;
                  return id === recIdParam;
                });
                if (hit) { startIdx = i; break; }
              } catch {}
            }
          }
        } else if (idxParam != null && Number.isFinite(idxParam) && idxParam >= 0 && idxParam < arr.length) {
          startIdx = idxParam;
        }

        setIndex(startIdx);

        const params = new URLSearchParams(sp);
        params.delete("recId");
        params.set("idx", String(startIdx));
        navigate(`/history?${params.toString()}`, { replace: true });
      } catch (e: any) {
        if (!abort) setError(e?.message || "기록을 불러오지 못했어요.");
      } finally {
        if (!abort) setLoadingList(false);
      }
    })();

    return () => { abort = true; };
  }, [ready, nickname, token, navigate, sp]);

  // 상세 로드
  useEffect(() => {
    if (!rows.length || !(token || isAuthed)) { setDetail(null); return; }
    const cur = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (!cur?.survey_id) { setDetail(null); return; }

    let abort = false;
    (async () => {
      setLoadingDetail(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/v1/survey/detail/${cur.survey_id}`;
        const res = await fetch(url, { headers: buildHeaders(token || undefined), credentials: "include" });

        if (res.status === 401) {
          useAuthStore.getState().logout();
          navigate(`/login?re_uri=/history`, { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reco: DetailResp = await res.json();
        const recommendation = reco?.recommendation ?? reco?.result ?? reco?.data ?? (reco as any);
        const rawPrefs = reco?.preferences ?? (recommendation as any)?.preferences ?? {};

        if (!abort) {
          setDetail({ preferences: humanizePreferences(rawPrefs), recommendation: recommendation as RecItem });
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "상세를 불러오지 못했어요.");
        if (!abort) setDetail(null);
      } finally {
        if (!abort) setLoadingDetail(false);
      }
    })();

    return () => { abort = true; };
  }, [rows, index, token, isAuthed, navigate]);

  const total = rows.length;
  const loading = loadingList || loadingDetail;

  // idx 싱크
  useEffect(() => {
    const params = new URLSearchParams(sp);
    params.set("idx", String(Math.min(Math.max(index, 0), Math.max(total - 1, 0))));
    params.delete("recId");
    navigate(`/history?${params.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  /* ======================= 렌더 ======================= */
  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full mx-auto max-w-screen-sm md:max-w-3xl px-3 sm:px-4 md:px-6 py-3 md:py-6">
      {children}
    </div>
  );

  if (error) {
    return (
      <Container>
        <div className="text-center flex flex-col items-center mt-8 gap-3">
          <TriangleAlert className="w-9 h-9 text-rose-500" />
          <p className="text-sm md:text-base text-zinc-600">{error}</p>
        </div>
      </Container>
    );
  }
  if (!ready || loading) {
    return (
      <Container>
        <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
          로딩 중입니다...
        </div>
      </Container>
    );
  }
  if (total === 0) {
    return (
      <Container>
        <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
          아직 설문 기록이 없어요. 먼저 설문을 완료해 보세요!
        </div>
      </Container>
    );
  }

  return (
    <div className="history-scope">
      {/* 북마크는 숨기고, 하트(위시)는 노출 */}
      <style>{`
        .history-scope .lucide-bookmark { display: none !important; }
        .history-scope button:has(.lucide-bookmark) { display: none !important; }
        @supports(padding:max(0px)) {
          .safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
        }
      `}</style>

      <Container>
        <HistorySection
          index={Math.min(Math.max(index, 0), Math.max(total - 1, 0))}
          total={total}
          loading={loading}
          detail={detail}
          onPrev={() => setIndex((v) => Math.max(v - 1, 0))}
          onNext={() => setIndex((v) => Math.min(v + 1, Math.max(total - 1, 0)))}
          /* 추천 본문: inline 하트로 카드 단위 위시 */
          RecommendationSlot={({ data }) => (
            <ResultData
              data={data}
              hideInlineActions={false}   // 하트 보이기
              wishMode="card"             // ✅ 카드 단위 위시
            />
          )}
        />
      </Container>
    </div>
  );
}
