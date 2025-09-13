import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Clock4,
  Sparkles,
  LogOut,
  UserRound,
  Heart,
  Star,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const API = import.meta.env.VITE_BACKEND_ADDRESS ?? "";

// ✅ 쿠키에서 CSRF 읽기
function getCsrfFromCookie() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type RecItem = {
  id: number;
  title: unknown;
  summary?: unknown;
  created_at?: string;
  rating?: number | null;
};

export default function MyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const nickname = user?.nickname ?? "사용자";

  const [items, setItems] = useState<RecItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`${API}/api/recommendations/my`, {
          credentials: "include",
        });
        if (res.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const data: RecItem[] = await res.json();
        if (alive) setItems(data);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "알 수 없는 오류");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate, logout]);

  // (선택) CSRF 토큰 재발급용
  const fetchCsrf = async () => {
    try {
      await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
    } catch {}
  };

  const rate = async (recId: number, rating: number) => {
    if (!items) return;

    const prev = items;
    const next = items.map((it) => (it.id === recId ? { ...it, rating } : it));
    setItems(next);

    const postRating = async () => {
      const csrf = getCsrfFromCookie();
      const res = await fetch(`${API}/api/recommendations/${recId}/rating`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ rating }),
      });
      return res;
    };

    try {
      let res = await postRating();

      if (res.status === 401) {
        logout();
        navigate("/login");
        return;
      }

      if (res.status === 403) {
        await fetchCsrf();
        res = await postRating();
      }

      if (!res.ok) throw new Error(`rate failed: ${res.status}`);
    } catch {
      setItems(prev);
      alert("평점 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const hasItems = useMemo(() => (items?.length ?? 0) > 0, [items]);

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
              <div className="h-full w-full rounded-full bg-white overflow-hidden flex items-center justify-center">
                {user?.profile_image_url ? (
                  <img
                    src={user.profile_image_url}
                    alt="프로필 이미지"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      // 이미지 깨지면 이니셜로 폴백
                      (e.target as HTMLImageElement).style.display = "none";
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent) {
                        parent.innerHTML = `<span class="text-lg font-bold text-gray-700">${getInitials(
                          nickname
                        )}</span>`;
                      }
                    }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-lg font-bold text-gray-700">
                    {getInitials(nickname)}
                  </span>
                )}
              </div>
            </div>
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-400 ring-2 ring-white"
            />
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

        {/* 추가 메뉴: 2칸 그리드 (보관함 제거) */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <SecondaryTile
            icon={<UserRound className="w-5 h-5" />}
            label="프로필 수정"
            onClick={() => navigate("/profile")}
          />
          <SecondaryTile
            icon={<Heart className="w-5 h-5" />}
            label="위시리스트"
            onClick={() => navigate("/wish")}
          />
        </div>

        {/* ⭐ 내가 받은 추천들 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-3">내가 받은 추천들</h2>

          {loading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
            </div>
          )}
          {err && !loading && (
            <p className="text-red-500 text-sm">불러오기 실패: {err}</p>
          )}
          {!loading && !err && !hasItems && (
            <p className="text-gray-500 text-sm">
              아직 받은 추천이 없어요.{" "}
              <button
                className="underline underline-offset-2 text-purple-600 hover:text-purple-700"
                onClick={() => navigate("/step3")}
              >
                여행 다시 추천받기
              </button>
              에서 시작해 보세요!
            </p>
          )}

          <div className="mt-2 space-y-3">
            {items?.map((it) => (
              <RecommendationCard
                key={it.id}
                item={it}
                onRate={(v) => rate(it.id, v)}
              />
            ))}
          </div>
        </section>

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

/* ───────── 유틸 & 하위 컴포넌트 ───────── */

function getInitials(name: string) {
  const t = (name || "").trim();
  if (!t) return "U";
  const [a, b] = t.split(/\s+/);
  return ((a?.[0] ?? "") + (b?.[0] ?? "")).toUpperCase() || "U";
}

function formatSummary(summary: unknown): string {
  if (summary == null) return "";
  if (typeof summary === "string") return summary;
  if (Array.isArray(summary)) return summary.map(formatSummary).join(" / ");
  try {
    const obj: any = summary;
    const city = obj?.city ?? obj?.destination ?? obj?.place;
    const country = obj?.country;
    const reason = obj?.reason ?? obj?.description ?? obj?.summary;
    let days =
      obj?.days ??
      obj?.duration ??
      obj?.schedule?.days ??
      (Array.isArray(obj?.schedule) ? obj.schedule.length : undefined);

    const segs = [
      city && country ? `${city}, ${country}` : city ?? country,
      reason,
      days ? `${days}일 일정` : null,
    ].filter(Boolean);
    return segs.join(" · ");
  } catch {}
  return String(summary);
}

function extractCityCountry(src: unknown): string | null {
  try {
    const obj: any = src;
    const city = obj?.city ?? obj?.destination ?? obj?.place;
    const country = obj?.country;
    if (city && country) return `${city}, ${country}`;
    return city ?? country ?? null;
  } catch {
    return null;
  }
}

function countCities(src: unknown): number {
  if (Array.isArray(src)) return src.map(extractCityCountry).filter(Boolean).length;
  return extractCityCountry(src) ? 1 : 0;
}

function formatTitleCompact(title: unknown, countHint?: number): string {
  const first = extractCityCountry(title);
  if (!first) return "추천 여행";
  const n = (typeof countHint === "number" ? countHint : countCities(title)) - 1;
  return n > 0 ? `${first} 외 ${n}곳` : first;
}

type CitySummary = { cityTitle: string; text: string };
function summariesFrom(summary: unknown, title: unknown): CitySummary[] {
  const asOne = (s: unknown): CitySummary | null => {
    const cityTitle = extractCityCountry(s) ?? "";
    const text = formatSummary(s);
    if (!cityTitle && !text) return null;
    return { cityTitle: cityTitle || "추천 도시", text };
  };
  if (Array.isArray(summary) && summary.length)
    return summary.map(asOne).filter(Boolean) as CitySummary[];
  if (Array.isArray(title) && title.length)
    return title.map(asOne).filter(Boolean) as CitySummary[];
  const one = asOne(summary ?? title);
  return one ? [one] : [];
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
      className="h-24 rounded-2xl bg-white/80 border border-white/60 shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center text-gray-700 hover:text-gray-900"
    >
      <div className="mb-2 text-purple-600">{icon}</div>
      <span className="text-sm font-semibold">{label}</span>
    </motion.button>
  );
}

function RecommendationCard({
                              item,
                              onRate,
                            }: {
  item: RecItem;
  onRate: (v: number) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const list = summariesFrom(item.summary, item.title);
  const first = list[0];
  const moreCount = Math.max(0, list.length - 1);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-md hover:shadow-lg transition-shadow border border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            {formatTitleCompact(item.title, list.length)}
          </h3>
          {first?.text && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
              <span className="font-medium text-gray-800">{first.cityTitle}</span>{" "}
              · {first.text}
            </p>
          )}
          {item.created_at && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(item.created_at).toLocaleString()}
            </p>
          )}
        </div>
        {moreCount > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800"
          >
            {open ? "접기" : `자세히 보기 · ${moreCount}개`}
          </button>
        )}
      </div>

      {/* 펼침 UI 필요하면 주석 해제 */}
      {/* {open && moreCount > 0 && (
        <ul className="mt-2 list-disc list-inside text-sm text-gray-600">
          {list.slice(1).map((c, i) => (
            <li key={i}>
              <span className="font-medium text-gray-800">{c.cityTitle}</span> · {c.text}
            </li>
          ))}
        </ul>
      )} */}

      <div className="mt-3 flex items-center gap-3">
        <StarRating value={item.rating ?? 0} onChange={onRate} size={22} />
        <span className="text-xs text-gray-500">
          {item.rating ? `${item.rating}점` : "평가하기"}
        </span>
      </div>

      <button
        onClick={() => navigate(`/history?recId=${item.id}`)}
        className="text-xs text-purple-600 hover:text-purple-700 underline underline-offset-2"
      >
        기록 상세 보기
      </button>
    </div>
  );
}

function StarRating({
                      value = 0,
                      onChange,
                      size = 24,
                    }: {
  value?: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value || 0;
  return (
    <div className="flex items-center gap-1 cursor-pointer">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= display;
        return (
          <button
            key={i}
            type="button"
            className="p-0.5"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange && onChange(i)}
          >
            <Star
              width={size}
              height={size}
              className={filled ? "fill-yellow-400 stroke-yellow-500" : "stroke-gray-400"}
            />
          </button>
        );
      })}
    </div>
  );
}
