// app/App.tsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AppLayout from "./AppLayout";

import Home from "./routes/index";
import Signup from "./routes/signup";
import Login from "./routes/login";
import Step2 from "./routes/step2";
import Step3 from "./routes/step3";
import Step4 from "./routes/step4";
import Step5 from "./routes/step5";
import StepTime from "./routes/step-time";
import Result from "./routes/result";
import History from "./routes/history";
import Mypage from "./routes/mypage";
import HistoryDetail from "./routes/HistoryDetail";
import Wishlist from "./routes/Wishlist";
import Profile from "./routes/profile";           // ✅ 프로필 페이지 추가
import { useAuthStore } from "@/store/authStore";

/** 보호 라우트: 'token' 또는 'isAuthed' 만으로 통과 (user까지 기다리지 않음) */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isAuthed, initialized } = useAuthStore();
  const loc = useLocation();
  if (!initialized) return null;
  const authed = !!token || isAuthed;
  if (!authed) {
    return (
      <Navigate
        to={`/login?re_uri=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

/** 이미 로그인 상태면 /login, /signup 접근 막기 */
function LoginGuard({ children }: { children: React.ReactNode }) {
  const { token, isAuthed } = useAuthStore();
  const authed = !!token || isAuthed;
  if (authed) return <Navigate to="/mypage" replace />;
  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 공개 라우트 */}
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<LoginGuard><Signup /></LoginGuard>} />
        <Route path="/login" element={<LoginGuard><Login /></LoginGuard>} />
        <Route path="/step2" element={<Step2 />} />
        <Route path="/step3" element={<Step3 />} />
        <Route path="/step4" element={<Step4 />} />
        <Route path="/step5" element={<Step5 />} />
        <Route path="/step-time" element={<StepTime />} />
        <Route path="/result" element={<Result />} /> {/* 필요시 RequireAuth로 감싸기 */}

        {/* 보호 라우트 */}
        <Route
          path="/history"
          element={
            <RequireAuth>
              <History />
            </RequireAuth>
          }
        />
        <Route
          path="/history/detail/:id"
          element={
            <RequireAuth>
              <HistoryDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/mypage"
          element={
            <RequireAuth>
              <Mypage />
            </RequireAuth>
          }
        />
        <Route
          path="/wish"
          element={
            <RequireAuth>
              <Wishlist />
            </RequireAuth>
          }
        />

        {/* ✅ 프로필 수정 라우트 */}
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
