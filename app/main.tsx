// app/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/app.css";
import { useAuthStore } from "@/store/authStore";

/**
 * 앱 부팅 시
 * 1) localStorage의 token 복구
 * 2) /auth/me 호출로 user 채우기 (JWT 또는 쿠키 세션 모두 지원)
 */
async function bootstrapAuth() {
  const { hydrateFromStorage, setUser, setAuthed } = useAuthStore.getState();

  // 1) 토큰 복구
  hydrateFromStorage();

  // 2) 내 정보 조회 (JWT 있으면 헤더, 없더라도 쿠키 세션이면 credentials로 인증)
  const t = useAuthStore.getState().token;

  try {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_ADDRESS}/api/auth/me`,
      {
        headers: t ? { Authorization: `Bearer ${t}` } : undefined,
        credentials: "include", // ✅ 쿠키 세션 지원
      }
    );

    if (res.ok) {
      const me = await res.json();
      setUser({ id: me.id, nickname: me.nickname }); // ✅ user 채우기
      setAuthed(true);                                // ✅ 토큰 없어도 세션이면 인증됨
    } else if (res.status === 401) {
      // 로그인 안 된 상태: 스토어만 초기화
      useAuthStore.setState({ isAuthed: false, user: null });
      // 토큰이 있었는데 만료/무효면 제거
      if (t) {
        useAuthStore.setState({ token: null });
        localStorage.removeItem("token");
      }
    }
  } catch {
    // 네트워크 오류 등은 무시하고 앱 구동 계속
  }
}

bootstrapAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
