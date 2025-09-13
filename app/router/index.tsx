// app/router/index.tsx
import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layouts/RootLayout";
import Home from "../routes/index";
import Login from "../routes/login";

// ✅ 반드시 히스토리 라우터(Resolver)를 임포트
import HistoryRoute from "../routes/history";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },

      // ✅ 딱 이 한 줄로 /history를 HistoryRoute에 연결
      { path: "history", element: <HistoryRoute /> },

    ],
  },
]);
