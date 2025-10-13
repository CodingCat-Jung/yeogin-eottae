// app/components/NavBar.tsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTravelStore } from "@/store/travelStore";
import { useAuthStore } from "@/store/authStore";

const API_BASE = "";
// import.meta.env.VITE_BACKEND_ADDRESS ?? "http://127.0.0.1:8000";

export function NavSpacer() {
  useEffect(() => {
    const el = document.getElementById("site-nav");
    const setVar = () => {
      const h = el?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--nav-h", `${h}px`);
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    if (el) ro.observe(el);
    window.addEventListener("resize", setVar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, []);
  return <div style={{ height: "var(--nav-h)" }} />;
}

export default function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);

  // 설문 스토어
  const resetSurvey = useTravelStore((s) => s.reset);
  const resetExceptNickname = useTravelStore((s) => s.resetExceptNickname);
  const setTravelWith = useTravelStore((s) => s.setTravelWith);

  // 인증 스토어
  const {
    token,
    isAuthed,
    user,
    setUser,
    hydrateFromStorage,
    logout,
    setAuthed,
  } = useAuthStore();

  useEffect(() => {
    const el = navRef.current;
    const setVar = () => {
      const h = el?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--nav-h", `${h}px`);
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    if (el) ro.observe(el);
    window.addEventListener("resize", setVar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, []);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    let aborted = false;
    const fetchMe = async () => {
      try {
        const headers: Record<string, string> = {};
        const opts: RequestInit = { method: "GET", headers };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
          opts.credentials = "include";
        } else {
          opts.credentials = "include";
        }

        const res = await fetch(`${API_BASE}/api/auth/me`, opts);
        if (!res.ok) {
          logout();
          return;
        }
        const data = await res.json();
        if (aborted) return;

        setUser({
          id: data.id,
          nickname: data.nickname,
          email: data.email,
        });
        setAuthed?.(true);
      } catch {
        // ignore
      }
    };
    fetchMe();
    return () => {
      aborted = true;
    };
  }, [token, setUser, logout, setAuthed]);

  /** 로그아웃 */
  const handleLogout = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const opts: RequestInit = { method: "POST" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        (opts as any).headers = headers;
      }
      (opts as any).credentials = "include";
      await fetch(`${API_BASE}/api/auth/logout`, opts);
    } catch {
      // noop
    } finally {
      resetSurvey();
      logout();

      // ✅ 설문 관련 키들까지 확실히 삭제
      const keysToClear = [
        "user",
        "nickname",
        "travelWith",
        "actType",
        "schedule",
        "budget",
        "transport",
        "continent",
        "climate",
        "density",
        // ⏰ step-time 관련 (옛 키 포함)
        "departSlot",
        "returnSlot",
        "departWindow",
        "returnWindow",
        // auth
        "access_token",
        "token",
      ];
      keysToClear.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });

      navigate("/login");
    }
  }, [token, resetSurvey, logout, navigate]);

  /** 활성 링크 스타일 */
  const isActive = useCallback(
    (path: string) =>
      location.pathname === path ||
      location.pathname.startsWith(path + "/"),
    [location.pathname]
  );

  const linkStyle = useCallback(
    (path: string) =>
      `hover:text-purple-600 transition ${
        isActive(path) ? "text-purple-700 font-semibold" : "text-gray-700"
      }`,
    [isActive]
  );

  /** 로그인 가드 */
  const guardNav = useCallback(
    (path: string) => {
      if (!user) navigate(`/login?re_uri=${encodeURIComponent(path)}`);
      else navigate(path);
    },
    [user, navigate]
  );

  /** 설문 새 시작 (닉네임만 유지) */
  const goSurveyFresh = useCallback(() => {
    if (!user) {
      navigate(`/login?re_uri=${encodeURIComponent("/month")}`);
      return;
    }
    // ✅ store 초기화
    resetExceptNickname();
    setTravelWith(null);

    // ✅ 혹시 남아 있는 이전 키들을 즉시 제거(안전망)
    [
      "travelWith",
      "actType",
      "schedule",
      "budget",
      "transport",
      "continent",
      "climate",
      "density",
      "departSlot",
      "returnSlot",
      "departWindow",
      "returnWindow",
    ].forEach((k) => localStorage.removeItem(k));

    navigate("/month");
  }, [user, navigate, resetExceptNickname, setTravelWith]);

  const greetName = useMemo(
    () => (isAuthed && user?.nickname ? user.nickname : "여행자"),
    [isAuthed, user?.nickname]
  );

  return (
    <nav
      ref={navRef}
      id="site-nav"
      className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md shadow-md px-6 py-3"
      role="navigation"
      aria-label="Global"
    >
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="text-2xl font-extrabold text-purple-600 tracking-tight"
        >
          여긴어때
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <button onClick={goSurveyFresh} className={linkStyle("/month")}>
            설문
          </button>
          <button
            onClick={() => guardNav("/mypage")}
            className={linkStyle("/mypage")}
          >
            마이페이지
          </button>
          <button
            onClick={() => guardNav("/history")}
            className={linkStyle("/history")}
          >
            기록
          </button>

          {!isAuthed ? (
            <Link
              to="/login"
              className="text-purple-600 font-semibold hover:underline"
            >
              로그인
            </Link>
          ) : (
            <>
              <span className="text-gray-600">
                반가워요, <strong>{greetName}</strong>님
              </span>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:underline transition text-sm"
              >
                로그아웃
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
