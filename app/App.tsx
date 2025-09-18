// app/App.tsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import Profile from "./routes/profile";
import { useAuthStore } from "@/store/authStore";

/** 보호 라우트 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isAuthed, initialized } = useAuthStore();
  const loc = useLocation();

  if (!initialized) {
    // ✅ 초기화 중 로딩 화면
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff8f1]">
        <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      </div>
    );
  }

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
        <Route path="/result" element={<Result />} />
        {/*
          🔐 만약 추천 결과도 로그인 사용자에게만 보이게 하려면 위 한 줄을 아래처럼 교체:
          <Route path="/result" element={<RequireAuth><Result /></RequireAuth>} />
        */}

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
