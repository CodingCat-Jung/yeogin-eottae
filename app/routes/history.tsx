// routes/history.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import HistoryList from "@/components/HistoryList";
import { useAuthStore } from "@/store/authStore";
import { useTravelStore } from "@/store/travelStore";

const API_BASE = "";
  //import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

function buildHeaders(token?: string) {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ensureUser() {
  const { token, setUser, setAuthed } = useAuthStore.getState();
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
      headers: buildHeaders(token || undefined),
    });
    if (res.ok) {
      const me = await res.json();
      setUser?.({ id: me.id, nickname: me.nickname, email: me.email });
      setAuthed?.(true);
      return me?.nickname as string | undefined;
    }
  } catch {}
  return undefined;
}

export default function HistoryRoute() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const recIdParam = Number(sp.get("recId"));
  const wantRecId = Number.isFinite(recIdParam) ? recIdParam : null;

  const { token, user, logout } = useAuthStore();
  const travelNick = useTravelStore((s) => s.nickname);
  const nickFromStore = user?.nickname || travelNick || "";

  const [resolving, setResolving] = useState(() => wantRecId != null);
  const [error, setError] = useState<string | null>(null);
  const triedKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let aborted = false;
    if (!wantRecId) return;

    const key = `${wantRecId}:${nickFromStore}`;
    if (triedKeyRef.current === key) return;
    triedKeyRef.current = key;

    const end = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setResolving(false);
    };

    (async () => {
      try {
        setResolving(true);
        setError(null);

        // 닉네임 보정
        let nickname = nickFromStore;
        if (!nickname) nickname = (await ensureUser()) || "";

        // 타임아웃 가드
        timeoutRef.current = window.setTimeout(() => {
          if (!aborted) end();
        }, 8000);

        if (!nickname) {
          end();
          return;
        }

// 히스토리 목록에서 recId 위치 찾기 (+ 상세 순회로 보강)
        const listRes = await fetch(
          `${API_BASE}/api/v1/survey/history/${encodeURIComponent(nickname)}`,
          { credentials: "include", headers: buildHeaders(token || undefined) }
        );
        if (aborted) return;

        if (listRes.status === 401) {
          logout();
          end();
          navigate(`/login?re_uri=/history?recId=${wantRecId}`, { replace: true });
          return;
        }
        if (!listRes.ok) throw new Error(`history HTTP ${listRes.status}`);

        const listJson = await listRes.json();
        const rows: Array<{ survey_id: number; recommendation_id?: number }> =
          listJson?.results ?? listJson?.list ?? listJson ?? [];

// 1) 빠른 경로: 목록에 recId가 바로 박혀있는 경우
        if (Array.isArray(rows) && rows.length) {
          const quickIdx = rows.findIndex((r) => r.recommendation_id === wantRecId);
          if (quickIdx >= 0) {
            end();
            const surveyId = rows[quickIdx].survey_id;
            navigate(`/history/detail/${surveyId}?recId=${wantRecId}`, { replace: true });
            return;
          }
        }

// 2) 느린 경로: 각 설문 상세를 순회하며 recId를 포함하는지 검사
        if (Array.isArray(rows) && rows.length) {
          for (const row of rows) {
            if (aborted) return;

            try {
              const dRes = await fetch(
                `${API_BASE}/api/v1/survey/detail/${row.survey_id}`,
                { credentials: "include", headers: buildHeaders(token || undefined) }
              );
              if (!dRes.ok) continue;

              const dJson: any = await dRes.json();
              const recos: any[] = (dJson?.recommendation ?? dJson?.result ?? dJson?.data ?? []) as any[];
              if (!Array.isArray(recos)) continue;

              const hit = recos.some((r) => {
                const id = r?.id ?? r?.rec_id ?? r?.recommendation_id ?? r?.result_id ?? null;
                return id === wantRecId;
              });

              if (hit) {
                end();
                navigate(`/history/detail/${row.survey_id}?recId=${wantRecId}`, { replace: true });
                return;
              }
            } catch {
              // 무시하고 다음 row로
            }
          }
        }

// 3) 그래도 못 찾으면 그냥 리스트로 (기존 동작)
        end();

      } catch (e: any) {
        setError(e?.message || "기록 탐색 중 오류");
        end();
      }
    })();

    return () => {
      aborted = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [wantRecId, nickFromStore, token, navigate, logout]);

  if (wantRecId && resolving) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-zinc-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          해당 기록을 찾는 중입니다…
        </div>
      </div>
    );
  }
  if (wantRecId && error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-rose-500">
          <TriangleAlert className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
        <div className="mt-6">
          <HistoryList />
        </div>
      </div>
    );
  }

  // ✅ recId 있을 때는 HistoryList를 렌더하지 않고 스피너만 보이게
  if (wantRecId) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-zinc-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          해당 기록을 찾는 중입니다…
        </div>
      </div>
    );
  }


  return <HistoryList />;
}
