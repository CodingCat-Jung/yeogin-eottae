// routes/HistoryDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import { HistorySection } from "@/components/HistorySection";
import { ResultData } from "@/components/ResultData";
import { useAuthStore } from "@/store/authStore";

const API_BASE = import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

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

/* ---- 유틸: 인덱스 탐색 ---- */
function findIndexByRecId(arr: any[], recId: number | null) {
  if (!Array.isArray(arr) || recId == null) return -1;
  const keys = ["id", "rec_id", "recommendation_id", "result_id"];
  return arr.findIndex((r) => keys.some((k) => r?.[k] === recId));
}
function findIndexByCityCountry(arr: any[], city?: string | null, country?: string | null) {
  if (!Array.isArray(arr) || (!city && !country)) return -1;
  const ci = (city ?? "").trim().toLowerCase();
  const co = (country ?? "").trim().toLowerCase();
  // 1) city+country
  let idx = arr.findIndex(
    (r) =>
      (r?.city ?? r?.destination ?? r?.place ?? "").toLowerCase() === ci &&
      (r?.country ?? "").toLowerCase() === co
  );
  if (idx >= 0) return idx;
  // 2) city만
  if (ci) {
    idx = arr.findIndex(
      (r) => (r?.city ?? r?.destination ?? r?.place ?? "").toLowerCase() === ci
    );
    if (idx >= 0) return idx;
  }
  // 3) country만
  if (co) {
    idx = arr.findIndex((r) => (r?.country ?? "").toLowerCase() === co);
    if (idx >= 0) return idx;
  }
  return -1;
}

export default function HistoryDetail() {
  const { id } = useParams(); // survey id
  const [sp] = useSearchParams();

  // ✅ URL 파라미터 모두 수용
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

  // ✅ 상단 페이저/ResultData를 함께 제어할 현재 인덱스
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
          setPrefs(preferences);

          // ✅ 인덱스 결정 우선순위: idx > recId > city/country > 0
          let init = 0;

          if (Number.isFinite(wantIdx as any) && arr.length) {
            init = Math.max(0, Math.min(wantIdx!, arr.length - 1));
          } else {
            let byRec = findIndexByRecId(arr, wantRecId);
            if (byRec < 0) {
              byRec = findIndexByCityCountry(arr, wantCity, wantCountry);
            }
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

  // ✅ 처음 진입 시 해당 카드로 스크롤 + 하이라이트
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
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
          불러오는 중…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-purple-600 underline underline-offset-2"
      >
        ← 목록으로
      </button>

      <HistorySection
        index={clampedIndex}
        total={total}
        loading={false}
        detail={{ preferences: prefs, recommendation: results }}
        onPrev={() => setPageIndex((v) => Math.max(0, v - 1))}
        onNext={() => setPageIndex((v) => Math.min(total - 1, v + 1))}
        RecommendationSlot={({ data }) => (
          <ResultData data={data} surveyId={id} initialIndex={clampedIndex} />
        )}
      />
    </div>
  );
}
