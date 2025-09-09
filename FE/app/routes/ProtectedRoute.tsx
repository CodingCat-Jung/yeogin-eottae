// app/routes/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function ProtectedRoute() {
  const { isAuthed, user, initialized } = useAuthStore();
  const loc = useLocation();

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff8f1]">
        <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      </div>
    );
  }
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
