// app/router.tsx (또는 기존 라우터 설정 파일)
import { createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout";
import LoginPage from "./routes/login";
import MyPage from "./routes/mypage";
import HistoryPage from "./routes/history";           // ← 네가 이미 가진 리스트 페이지
import HistoryDetailPage from "./routes/HistoryDetail"; // ← 새로 만들 상세 컴포넌트
import ProtectedRoute from "./routes/ProtectedRoute";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },

      // 보호 라우트
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/mypage", element: <MyPage /> },
          {
            path: "/history",
            children: [
              { index: true, element: <HistoryPage /> },       // /history
              { path: "detail/:id", element: <HistoryDetailPage /> }, // /history/detail/123
            ],
          },
        ],
      },

      { path: "*", element: <div>Not Found</div> },
    ],
  },
]);
