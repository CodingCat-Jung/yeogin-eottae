// routes/history.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import HistoryList from "@/components/HistoryList";
import { useAuthStore } from "@/store/authStore";
import { useTravelStore } from "@/store/travelStore";

const API_BASE = import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

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

  const [resolving, setResolving] = useState(false);
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

        // 히스토리 목록에서 recId 위치 찾기
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
        const rows: Array<{ survey_id: number; recommendation_id: number }> =
          listJson?.results ?? listJson?.list ?? listJson ?? [];

        if (Array.isArray(rows) && rows.length) {
          const idx = rows.findIndex((r) => r.recommendation_id === wantRecId);
          if (idx >= 0) {
            end();
            // ✅ 목록의 해당 인덱스로 이동
            navigate(`/history?idx=${idx}`, { replace: true });
            return;
          }
        }

        // 못 찾으면 그냥 리스트
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

  return <HistoryList />;
}
