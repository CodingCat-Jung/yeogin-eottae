// app/routes/mypage.tsx
import { motion } from "framer-motion";
import { Clock4, Sparkles, LogOut, UserRound, BarChart3, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function MyPage() {
  const navigate = useNavigate();

  // ✅ authStore에서 현재 로그인 사용자 가져오기
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const nickname = user?.nickname ?? "사용자"; // ⬅️ 하드코딩 제거

  return (
    <div className="min-h-screen bg-[#fff8f1] flex items-center justify-center px-5 py-10">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-8">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-400 p-[2px]">
              <div className="h-full w-full rounded-full bg-white flex items-center justify-center">
                <span className="text-lg font-bold text-gray-700">
                  {getInitials(nickname)}
                </span>
              </div>
            </div>
            <span aria-hidden className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-400 ring-2 ring-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              {nickname}님
            </h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 font-semibold">
                여행의 흔적
              </span>
              이 여기에 고스란히 담겨 있어요.
            </p>
          </div>
        </div>

        {/* 메인 카드 */}
        <div className="rounded-3xl bg-white/80 backdrop-blur shadow-xl border border-white/60 p-5 sm:p-6 mb-6">
          <p className="text-gray-600 text-sm sm:text-base mb-4">
            함께했던 순간들이 다시 떠오르시나요?
          </p>

          <div className="flex flex-col gap-3">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/step3")}
              className="group w-full flex items-center gap-3 justify-center rounded-2xl px-5 py-4
                         bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white font-semibold
                         shadow-lg shadow-purple-500/20 hover:shadow-xl transition-all"
            >
              <Sparkles className="w-5 h-5 group-hover:rotate-6 transition-transform" />
              여행 다시 추천받기
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/history")}
              className="w-full flex items-center gap-3 justify-center rounded-2xl px-5 py-4
                         bg-white text-gray-800 font-semibold shadow-md hover:shadow-lg
                         border border-gray-100 transition-all"
            >
              <Clock4 className="w-5 h-5 text-purple-500" />
              여행 기록 보기
            </motion.button>
          </div>
        </div>

        {/* 추가 메뉴 */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <SecondaryTile icon={<UserRound className="w-5 h-5" />} label="프로필 수정" onClick={() => navigate("/profile")} />
          <SecondaryTile icon={<BarChart3 className="w-5 h-5" />} label="나의 통계" onClick={() => navigate("/stats")} />
          <SecondaryTile icon={<Heart className="w-5 h-5" />} label="위시리스트" onClick={() => navigate("/wish")} />
        </div>

        {/* 로그아웃 */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              if (!confirm("로그아웃 하시겠어요?")) return;
              logout();
              navigate("/login");
            }}
            className="flex items-center gap-2 text-[15px] text-red-500 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            로그아웃
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function getInitials(name: string) {
  const t = (name || "").trim();
  if (!t) return "U";
  const [a, b] = t.split(/\s+/);
  return ((a?.[0] ?? "") + (b?.[0] ?? "")).toUpperCase() || "U";
}

function SecondaryTile({
                         icon,
                         label,
                         onClick,
                       }: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="h-24 rounded-2xl bg-white/80 border border-white/60 shadow-md
                 hover:shadow-lg transition-all flex flex-col items-center justify-center
                 text-gray-700 hover:text-gray-900"
    >
      <div className="mb-2 text-purple-600">{icon}</div>
      <span className="text-sm font-semibold">{label}</span>
    </motion.button>
  );
}
