// app/router.tsx
import { createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout";
import LoginPage from "./routes/login";
import MyPage from "./routes/mypage";
import HistoryPage from "./routes/history";
import HistoryDetailPage from "./routes/HistoryDetail";
import WishlistPage from "./routes/Wishlist";
import ProfilePage from "./routes/profile";     // ✅ 프로필 추가
import ProtectedRoute from "./routes/ProtectedRoute";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },

      {
        element: <ProtectedRoute />,
        children: [
          { path: "/mypage", element: <MyPage /> },
          { path: "/profile", element: <ProfilePage /> },  // ✅ /profile 경로 추가
          { path: "/wish", element: <WishlistPage /> },
          {
            path: "/history",
            children: [
              { index: true, element: <HistoryPage /> },
              { path: "detail/:id", element: <HistoryDetailPage /> },
            ],
          },
        ],
      },

      { path: "*", element: <div>Not Found</div> },
    ],
  },
]);
