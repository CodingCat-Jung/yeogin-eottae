import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import HistorySection from "@/components/HistorySection";
import { ResultData } from "@/components/ResultData";

import { useAuthStore } from "@/store/authStore";

/* ========= 공통 ========== */

const API_BASE =
  import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

type DetailResp = {
  preferences?: any;
  recommendation?: any;
  result?: any;
  data?: any;
};

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* === HistoryList 에 있던 preferences → 화면용 변환 유틸 최소본(동일 동작) === */
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
const companionMap: Record<string, { icon: string; value: string }> = {
  alone: { icon: "👤", value: "혼자" },
  couple: { icon: "👫", value: "연인" },
  friends: { icon: "👥", value: "친구" },
  family: { icon: "👨‍👩‍👧‍👦", value: "가족" },
  group: { icon: "👥", value: "단체" },
  pet: { icon: "🐶", value: "반려동물과" },
};
const companionAlias: Record<string, string> = {
  혼자: "alone",
  "1인": "alone",
  solo: "alone",
  single: "alone",
  솔로: "alone",
  alones: "alone",
  연인: "couple",
  커플: "couple",
  부부: "couple",
  couple: "couple",
  친구: "friends",
  지인: "friends",
  friends: "friends",
  가족: "family",
  패밀리: "family",
  family: "family",
  부모님: "family",
  아이와: "family",
  아이와함께: "family",
  단체: "group",
  그룹: "group",
  group: "group",
  회사동료: "group",
  반려동물: "pet",
  pet: "pet",
  withpet: "pet",
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

/* ========= 상세 페이지 ========= */

export default function HistoryDetail() {
  const { id } = useParams(); // ← survey_id 여야 함
  const navigate = useNavigate();

  const token = useAuthStore((s) => s.token);

  const [detail, setDetail] = useState<{
    preferences?: any;
    recommendation?: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          useAuthStore.getState().logout();
          navigate(`/login?re_uri=/history/detail/${id}`, { replace: true });
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
            preferences: humanizePreferences(rawPrefs),
            recommendation,
          });
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "상세를 불러오지 못했어요.");
        if (!abort) setDetail(null);
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [id, token, navigate]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
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
            <p className="text-zinc-500 text-xs">
              (이 링크가 추천 ID일 가능성이 있어요. 히스토리 목록에서 다시 선택해 주세요.)
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
          불러오는 중…
        </div>
      </div>
    );
  }

  // ✅ 히스토리 UI 그대로 재사용 (총 1건)
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-purple-600 underline underline-offset-2"
      >
        ← 목록으로
      </button>

      <HistorySection
        index={0}
        total={1}
        loading={false}
        detail={detail}
        onPrev={() => {}}
        onNext={() => {}}
        RecommendationSlot={({ data }) => <ResultData data={data} />}
      />
    </div>
  );
}
