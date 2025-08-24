// components/HistoryList.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import HistorySection from "./HistorySection";
import { ResultData } from "./ResultData";

import { useAuthStore } from "@/store/authStore";
import { useTravelStore } from "@/store/travelStore";

type HistoryRow = { survey_id: number; created_at?: string };

type DetailResp = {
  preferences?: any;
  recommendation?: any;
  result?: any;
  data?: any;
};

const API_BASE =
  import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

/* -------------------- 공통 유틸 -------------------- */

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
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

/* -------------------- 매핑 테이블 -------------------- */

// 동행 유형
const companionMap: Record<string, { icon: string; value: string }> = {
  alone: { icon: "👤", value: "혼자" },
  solo: { icon: "👤", value: "혼자" },
  couple: { icon: "👫", value: "연인" },
  friends: { icon: "👥", value: "친구" },
  family: { icon: "👨‍👩‍👧‍👦", value: "가족" },
  group: { icon: "👥", value: "단체" },
  pet: { icon: "🐶", value: "반려동물과" },
};

// 동행 유형 별칭(한글/영문/공백/숫자 코드 등)
const companionAlias: Record<string, string> = {
  // 혼자
  "혼자": "alone",
  "1인": "alone",
  "solo": "alone",
  "single": "alone",
  "솔로": "alone",
  "alones": "alone",

  // 커플/연인/부부
  "연인": "couple",
  "커플": "couple",
  "부부": "couple",
  "couple": "couple",

  // 친구/지인
  "친구": "friends",
  "지인": "friends",
  "friends": "friends",

  // 가족/부모/아이
  "가족": "family",
  "패밀리": "family",
  "family": "family",
  "부모님": "family",
  "아이와": "family",
  "아이와함께": "family",

  // 단체/그룹/동료
  "단체": "group",
  "그룹": "group",
  "group": "group",
  "회사동료": "group",

  // 반려동물
  "반려동물": "pet",
  "pet": "pet",
  "withpet": "pet",
};

// 서버가 숫자 코드로 줄 때 대응
const companionIndexMap: Record<string, string> = {
  "0": "alone",
  "1": "couple",
  "2": "friends",
  "3": "family",
  "4": "group",
};

// 여행 스타일
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

// 이동수단
const drivingMap: Record<string, { icon: string; value: string }> = {
  public: { icon: "🚌", value: "대중교통" },
  car: { icon: "🚗", value: "자가용 운전" },
  walk: { icon: "🚶", value: "도보 중심" },
};

// 기온
const climateMap: Record<string, { icon: string; value: string }> = {
  hot: { icon: "🔥", value: "더운 지역" },
  warm: { icon: "🌤️", value: "따뜻한 지역" },
  mild: { icon: "🌤️", value: "온화한 지역" },
  fresh: { icon: "🍃", value: "선선한 지역" },
  cold: { icon: "❄️", value: "추운 지역" },
};

// 인파 밀도
const densityMap: Record<string, { icon: string; value: string }> = {
  calm: { icon: "🌿", value: "여유로운 장소" },
  normal: { icon: "🙂", value: "보통" },
  active: { icon: "⚡", value: "활기찬 장소" },
  crowded: { icon: "👥", value: "붐비는 장소" },
};

// 대륙
const continentMap: Record<string, { icon: string; value: string }> = {
  asia: { icon: "🌏", value: "아시아" },
  europe: { icon: "🌍", value: "유럽" },
  africa: { icon: "🌍", value: "아프리카" },
  oceania: { icon: "🌏", value: "오세아니아" },
  north_america: { icon: "🌎", value: "북미" },
  south_america: { icon: "🌎", value: "남미" },
  middle_east: { icon: "🌍", value: "중동" },
  etc: { icon: "🗺️", value: "기타" },

  // 서버가 한글을 직접 주는 경우
  아시아: { icon: "🌏", value: "아시아" },
  유럽: { icon: "🌍", value: "유럽" },
};

/* -------------------- 정규화 도우미 -------------------- */

function pick<T>(map: Record<string, T>, v: unknown): T | undefined {
  if (v == null) return undefined;
  const raw = String(v);
  const lower = raw.toLowerCase();
  return map[lower] ?? (map[raw] as T | undefined);
}

// 여러 필드명 중 존재하는 것 하나 선택
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

  // 숫자코드 → 표준키
  if (companionIndexMap[lower]) return companionIndexMap[lower];

  // 별칭 매핑(원문/소문자/compact 순서)
  return (
    companionAlias[raw] ||
    companionAlias[lower] ||
    companionAlias[compact] ||
    lower
  );
}

/** 서버 preferences → 화면용 preferences 로 변환 */
function humanizePreferences(raw: any = {}) {
  // 동행 유형
  const compRaw = pickCompanionField(raw);
  const compKey = normalizeCompanionKey(compRaw);
  let comp = compKey ? companionMap[compKey] : undefined;
  // 낯선 값이지만 값 자체는 있는 경우: 원문 노출
  if (!comp && compRaw != null && String(compRaw).trim() !== "") {
    comp = { icon: "•", value: String(compRaw) };
  }

  // 스타일: 배열/단일 모두 허용 (이미 한글이면 그대로 노출)
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

/* -------------------- me 보정 -------------------- */

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
  } catch {
    /* silent */
  }
}

/* -------------------- 메인 컴포넌트 -------------------- */

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
    recommendation?: any;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  // 토큰/세션은 있는데 닉네임이 비어 있으면 me로 보정
  useEffect(() => {
    if ((token || isAuthed) && !nickname) {
      void ensureUser();
    }
  }, [token, isAuthed, nickname]);

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
          reco?.recommendation ?? reco?.result ?? reco?.data ?? reco;

        const rawPrefs =
          reco?.preferences ?? recommendation?.preferences ?? {};

        if (!abort) {
          setDetail({
            preferences: humanizePreferences(rawPrefs), // ← 사람 친화 변환
            recommendation,
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

  /* -------------------- 렌더 분기 -------------------- */

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

  return (
    <HistorySection
      index={Math.min(Math.max(index, 0), Math.max(total - 1, 0))}
      total={total}
      loading={loading}
      detail={detail}
      onPrev={() => setIndex((v) => Math.max(v - 1, 0))}
      onNext={() => setIndex((v) => Math.min(v + 1, Math.max(total - 1, 0)))}
      RecommendationSlot={({ data }) => <ResultData data={data} />}
    />
  );
}
