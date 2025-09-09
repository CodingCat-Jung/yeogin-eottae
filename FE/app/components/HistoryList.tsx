// components/HistoryList.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import HistorySection from "./HistorySection";
import { ResultData } from "./ResultData";

import { useAuthStore } from "@/store/authStore";
import { useTravelStore } from "@/store/travelStore";

/* ======================= 환경/유틸 ======================= */

const API_BASE =
  import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

// 백엔드와 통일: csrf_token
function getCsrfFromCookie() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* ======================= 타입 ======================= */

type HistoryRow = { survey_id: number; created_at?: string };

type DetailResp = {
  preferences?: any;
  recommendation?: any;
  result?: any;
  data?: any;
};

type RecItem = any; // recommendation 객체 (백엔드 스키마 유동)

/* ======================= 매핑/표현 보조 ======================= */

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

/* ---------- 동행/스타일/선호 매핑(기존 코드 유지) ---------- */

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
  "혼자": "alone",
  "1인": "alone",
  "solo": "alone",
  "single": "alone",
  "솔로": "alone",
  "alones": "alone",
  "연인": "couple",
  "커플": "couple",
  "부부": "couple",
  "couple": "couple",
  "친구": "friends",
  "지인": "friends",
  "friends": "friends",
  "가족": "family",
  "패밀리": "family",
  "family": "family",
  "부모님": "family",
  "아이와": "family",
  "아이와함께": "family",
  "단체": "group",
  "그룹": "group",
  "group": "group",
  "회사동료": "group",
  "반려동물": "pet",
  "pet": "pet",
  "withpet": "pet",
};
const companionIndexMap: Record<string, string> = {
  "0": "alone",
  "1": "couple",
  "2": "friends",
  "3": "family",
  "4": "group",
};
const styleMap: Record<string, string> = {
  foodie: "먹방 여행",
  healing: "힐링 여행",
  adventure: "액티비티",
  shopping: "쇼핑",
  culture: "문화/역사",
  nature: "자연",
  luxury: "럭셔리",
  budget: "가성비",
  photo: "사진",
  festival: "축제",
};
const drivingMap: Record<string, { icon: string; value: string }> = {
  public: { icon: "🚌", value: "대중교통" },
  car: { icon: "🚗", value: "자가용 운전" },
  walk: { icon: "🚶", value: "도보 중심" },
};
const climateMap: Record<string, { icon: string; value: string }> = {
  hot: { icon: "🔥", value: "더운 지역" },
  warm: { icon: "🌤️", value: "따뜻한 지역" },
  mild: { icon: "🌤️", value: "온화한 지역" },
  fresh: { icon: "🍃", value: "선선한 지역" },
  cold: { icon: "❄️", value: "추운 지역" },
};
const densityMap: Record<string, { icon: string; value: string }> = {
  calm: { icon: "🌿", value: "여유로운 장소" },
  normal: { icon: "🙂", value: "보통" },
  active: { icon: "⚡", value: "활기찬 장소" },
  crowded: { icon: "👥", value: "붐비는 장소" },
};
const continentMap: Record<string, { icon: string; value: string }> = {
  asia: { icon: "🌏", value: "아시아" },
  europe: { icon: "🌍", value: "유럽" },
  africa: { icon: "🌍", value: "아프리카" },
  oceania: { icon: "🌏", value: "오세아니아" },
  north_america: { icon: "🌎", value: "북미" },
  south_america: { icon: "🌎", value: "남미" },
  middle_east: { icon: "🌍", value: "중동" },
  etc: { icon: "🗺️", value: "기타" },
  아시아: { icon: "🌏", value: "아시아" },
  유럽: { icon: "🌍", value: "유럽" },
};

function pick<T>(map: Record<string, T>, v: unknown): T | undefined {
  if (v == null) return undefined;
  const raw = String(v);
  const lower = raw.toLowerCase();
  return map[lower] ?? (map[raw] as T | undefined);
}
function pickCompanionField(prefs: any) {
  return (
    prefs?.companion ??
    prefs?.comp ??
    prefs?.companion_type ??
    prefs?.companionType ??
    prefs?.company ??
    prefs?.with_whom ??
    prefs?.withWhom
  );
}
function normalizeCompanionKey(v: unknown): string | undefined {
  if (v == null) return undefined;
  const raw = String(v).trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[\s_]/g, "");
  if (companionIndexMap[lower]) return companionIndexMap[lower];
  return (
    companionAlias[raw] ||
    companionAlias[lower] ||
    companionAlias[compact] ||
    lower
  );
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
      : raw.style
        ? [styleMap[raw.style] ?? raw.style]
        : undefined;

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
  } catch {/* silent */}
}

/* ======================= 메인 컴포넌트 ======================= */

export default function HistoryList() {
  const navigate = useNavigate();

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

  const [detail, setDetail] = useState<{
    preferences?: any;
    recommendation?: RecItem;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  // 💜/📌 상태를 한 번에 관리 (현재 사용자 전체 세트)
  const [wishSet, setWishSet] = useState<Set<number>>(new Set());
  const [bookmarkSet, setBookmarkSet] = useState<Set<number>>(new Set());

  // 토큰/세션은 있는데 닉네임이 비어 있으면 me로 보정
  useEffect(() => {
    if ((token || isAuthed) && !nickname) {
      void ensureUser();
    }
  }, [token, isAuthed, nickname]);

  // 위시·보관 목록 1회 로드
  useEffect(() => {
    if (!ready) return;
    let abort = false;
    (async () => {
      try {
        const [wRes, bRes] = await Promise.all([
          fetch(`${API_BASE}/api/wishlist/my`, {
            headers: buildHeaders(token || undefined),
            credentials: "include",
          }),
          fetch(`${API_BASE}/api/bookmark/my`, {
            headers: buildHeaders(token || undefined),
            credentials: "include",
          }),
        ]);
        if (wRes.ok) {
          const ws = await wRes.json(); // [{ item_id, ... }]
          if (!abort) setWishSet(new Set<number>(ws.map((x: any) => x.item_id)));
        }
        if (bRes.ok) {
          const bs = await bRes.json();
          if (!abort) setBookmarkSet(new Set<number>(bs.map((x: any) => x.item_id)));
        }
      } catch {/* ignore */}
    })();
    return () => { abort = true; };
  }, [ready, token]);

  // 리스트
  useEffect(() => {
    if (!ready) return;

    let abort = false;

    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/v1/survey/history/${encodeURIComponent(
          nickname!
        )}`;
        const res = await fetch(url, {
          headers: buildHeaders(token || undefined),
          credentials: "include",
        });

        if (res.status === 401) {
          useAuthStore.getState().logout();
          navigate(`/login?re_uri=/history`, { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const list: HistoryRow[] = json?.results ?? json?.list ?? json ?? [];
        if (!abort) {
          setRows(Array.isArray(list) ? list : []);
          setIndex(0);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "기록을 불러오지 못했어요.");
      } finally {
        if (!abort) setLoadingList(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [ready, nickname, token, navigate]);

  // 상세
  useEffect(() => {
    if (!rows.length || !(token || isAuthed)) {
      setDetail(null);
      return;
    }
    const cur = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (!cur?.survey_id) {
      setDetail(null);
      return;
    }

    let abort = false;

    (async () => {
      setLoadingDetail(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/v1/survey/detail/${cur.survey_id}`;
        const res = await fetch(url, {
          headers: buildHeaders(token || undefined),
          credentials: "include",
        });

        if (res.status === 401) {
          useAuthStore.getState().logout();
          navigate(`/login?re_uri=/history`, { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reco: DetailResp = await res.json();
        const recommendation =
          reco?.recommendation ?? reco?.result ?? reco?.data ?? (reco as any);

        const rawPrefs =
          reco?.preferences ?? (recommendation as any)?.preferences ?? {};

        if (!abort) {
          setDetail({
            preferences: humanizePreferences(rawPrefs),
            recommendation: recommendation as RecItem,
          });
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "상세를 불러오지 못했어요.");
        if (!abort) setDetail(null);
      } finally {
        if (!abort) setLoadingDetail(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [rows, index, token, isAuthed, navigate]);

  const total = rows.length;
  const loading = loadingList || loadingDetail;

  // 현재 상세의 추천 ID 추출 (백엔드 스키마 유동성 대비)
  const currentRecId = useMemo(() => {
    const d = detail?.recommendation as any;
    return (
      d?.id ??
      d?.rec_id ??
      d?.recommendation_id ??
      d?.result_id ??
      d?.recommend?.id ??
      null
    ) as number | null;
  }, [detail]);

  // 💜 / 📌 현재 상태
  const wished = currentRecId != null && wishSet.has(currentRecId);
  const bookmarked = currentRecId != null && bookmarkSet.has(currentRecId);

  // 공통 토글 함수 (낙관적 + 롤백)
  const toggleMark = async (
    kind: "wishlist" | "bookmark",
    next: boolean
  ) => {
    if (currentRecId == null) return;
    const csrf = getCsrfFromCookie();
    const method = next ? "POST" : "DELETE";
    const endpoint = `${API_BASE}/api/${kind}`;
    const body = JSON.stringify({
      item_type: "recommendation",
      item_id: currentRecId,
    });

    // 낙관적 업데이트
    if (kind === "wishlist") {
      setWishSet((s) => {
        const ns = new Set(s);
        next ? ns.add(currentRecId) : ns.delete(currentRecId);
        return ns;
      });
    } else {
      setBookmarkSet((s) => {
        const ns = new Set(s);
        next ? ns.add(currentRecId) : ns.delete(currentRecId);
        return ns;
      });
    }

    try {
      const res = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...buildHeaders(token || undefined),
        },
        body,
      });

      if (res.status === 401) {
        useAuthStore.getState().logout();
        navigate(`/login?re_uri=/history`, { replace: true });
        return;
      }
      if (!res.ok) throw new Error(`${kind} failed: ${res.status}`);
    } catch (e) {
      // 롤백
      if (kind === "wishlist") {
        setWishSet((s) => {
          const ns = new Set(s);
          next ? ns.delete(currentRecId!) : ns.add(currentRecId!);
          return ns;
        });
      } else {
        setBookmarkSet((s) => {
          const ns = new Set(s);
          next ? ns.delete(currentRecId!) : ns.add(currentRecId!);
          return ns;
        });
      }
      alert(`${kind === "wishlist" ? "위시리스트" : "보관함"} 저장에 실패했어요.`);
    }
  };

  /* ======================= 렌더 분기 ======================= */

  if (error) {
    return (
      <div className="text-center flex flex-col items-center mt-10 gap-3">
        <TriangleAlert className="w-10 h-10 text-rose-500" />
        <p className="text-sm text-zinc-600">{error}</p>
      </div>
    );
  }

  if (!ready || loading) {
    return (
      <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
        로딩 중입니다...
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
        아직 설문 기록이 없어요. 먼저 설문을 완료해 보세요!
      </div>
    );
  }

  /* ======================= 본문 ======================= */

  return (
    <HistorySection
      index={Math.min(Math.max(index, 0), Math.max(total - 1, 0))}
      total={total}
      loading={loading}
      detail={detail}
      onPrev={() => setIndex((v) => Math.max(v - 1, 0))}
      onNext={() => setIndex((v) => Math.min(v + 1, Math.max(total - 1, 0)))}
      // 추천 본문 렌더 슬롯 커스터마이즈: 하트/핀 버튼 오버레이 + 기존 ResultData
      RecommendationSlot={({ data }) => (
        <div className="relative">
          {/* 우측 상단 토글 버튼 그룹 */}
          {currentRecId != null && (
            <div className="absolute -top-2 right-0 flex gap-2 z-10">
              {/* 위시리스트 */}
              <button
                onClick={() => toggleMark("wishlist", !wished)}
                className="rounded-full px-2 py-1 text-xs border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                title={wished ? "위시리스트에서 제거" : "위시리스트에 추가"}
              >
                {wished ? "💜 위시" : "🤍 위시"}
              </button>

              {/* 보관함 */}
              <button
                onClick={() => toggleMark("bookmark", !bookmarked)}
                className="rounded-full px-2 py-1 text-xs border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                title={bookmarked ? "보관함에서 제거" : "보관함에 추가"}
              >
                {bookmarked ? "📌 보관" : "📍 보관"}
              </button>
            </div>
          )}

          {/* 기존 추천 결과 렌더 */}
          <ResultData data={data} />
        </div>
      )}
    />
  );
}
