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
import { useAuthStore } from "@/store/authStore";

/** 보호 라우트: 'token' 또는 'isAuthed' 만으로 통과 (user까지 기다리지 않음) */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isAuthed } = useAuthStore();
  const loc = useLocation();

  const authed = !!token || isAuthed; // ✅ user 요구 제거

  if (!authed) {
    return (
      <Navigate
        to={`/login?re_uri=${encodeURIComponent(loc.pathname)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

/** 이미 로그인 상태면 /login, /signup 접근 막기 */
function LoginGuard({ children }: { children: React.ReactNode }) {
  const { token, isAuthed } = useAuthStore();
  const authed = !!token || isAuthed; // ✅ user 요구 제거
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
          path="/mypage"
          element={
            <RequireAuth>
              <Mypage />
            </RequireAuth>
          }
        />

        {/* 결과 페이지 보호가 필요하면 아래 주석 해제 */}
        {/* <Route path="/result" element={<RequireAuth><Result /></RequireAuth>} /> */}
        <Route path="/result" element={<Result />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
