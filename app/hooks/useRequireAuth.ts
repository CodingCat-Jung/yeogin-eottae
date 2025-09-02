// app/hooks/useRequireAuth.ts
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export function useRequireAuth(redirectTo = "/login") {
  const { isAuthed, user, initialized } = useAuthStore((s) => ({
    isAuthed: s.isAuthed,
    user: s.user,
    initialized: s.initialized,
  }));
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!initialized) return; // 초기화 전엔 아무것도 안 함
    if (!isAuthed || !user) {
      nav(`${redirectTo}?re_uri=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true });
    }
  }, [initialized, isAuthed, user, nav, loc, redirectTo]);
}
