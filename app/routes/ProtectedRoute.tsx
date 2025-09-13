import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";

export default function ProtectedRoute() {
  const { isAuthed, user, initialized, setUser, setAuthed } = useAuthStore();
  const loc = useLocation();

  // ⚠️ 첫 렌더에서 바로 리다이렉트하지 않기 위해 true로 시작
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    const ensureMe = async () => {
      // 이미 인증돼 있으면 바로 통과
      if (isAuthed && user) {
        if (alive) setChecking(false);
        return;
      }

      try {
        // ✅ 상대경로 사용: Vite proxy가 8000으로 전달, 동일출처로 쿠키 붙음
        const res = await fetch(`/api/auth/me`, { credentials: "include" });
        if (res.ok) {
          const me = await res.json();
          setUser?.({ id: me.id, nickname: me.nickname, email: me.email });
          setAuthed?.(true);
        }
      } catch {
        // ignore
      } finally {
        if (alive) setChecking(false);
      }
    };

    ensureMe();
    return () => {
      alive = false;
    };
  }, [isAuthed, user, setUser, setAuthed]);

  // 앱 초기화 전이거나, 인증 확인 중이면 로딩
  if (!initialized || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff8f1]">
        <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      </div>
    );
  }

  // 최종적으로 인증 실패면 로그인으로
  if (!isAuthed || !user) {
    return (
      <Navigate
        to={`/login?re_uri=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  }

  return <Outlet />;
}
