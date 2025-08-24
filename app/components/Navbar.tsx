import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTravelStore } from "@/store/travelStore";
import { useAuthStore } from "@/store/authStore";

const API_BASE =
  import.meta.env.VITE_BACKEND_ADDRESS ?? "http://127.0.0.1:8000";

/** 본문 가림 방지용: 레이아웃에서 <NavSpacer/> 한 줄 추가하면 끝 */
export function NavSpacer() {
  // 전역 CSS 변수 적용 (html { scroll-padding-top: var(--nav-h); } 같이 쓰면 앵커도 안전)
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

  // 설문 스토어 (필요 시 reset에서만 사용)
  const resetSurvey = useTravelStore((s) => s.reset);

  // 인증 스토어
  const {
    token,
    isAuthed,
    user,
    setUser,
    hydrateFromStorage,
    logout,     // 내부적으로 user/token/isAuthed 초기화
    setAuthed,  // (선택) 명시적 로그인 상태 토글
  } = useAuthStore();

  /** 네비 높이를 CSS 변수로 반영 → 본문 가림 방지 */
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

  /** 앱 시작 시 localStorage → store 동기화 */
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  /** /auth/me 조회 (토큰/쿠키 모드 자동) */
  useEffect(() => {
    let aborted = false;
    const fetchMe = async () => {
      try {
        const headers: Record<string, string> = {};
        const opts: RequestInit = {
          method: "GET",
          headers,
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
          opts.credentials = "include"; // 백이 토큰+세션 병행해도 안전
        } else {
          opts.credentials = "include"; // 세션/쿠키 모드
        }

        const res = await fetch(`${API_BASE}/api/auth/me`, opts);
        if (!res.ok) {
          // 비로그인/만료 상태 → 프론트 상태 정리
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
        // 네트워크 오류는 초기 렌더 방해하지 않도록 무시
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
      (opts as any).credentials = "include"; // 쿠키 모드도 함께 처리
      await fetch(`${API_BASE}/api/auth/logout`, opts);
    } catch {
      // 서버 통신 실패해도 프론트 상태는 정리
    } finally {
      resetSurvey();
      logout();

      // persist/로컬 키들 정리 (프로젝트에서 사용하는 키 전부 추가)
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

  /** 활성 링크 스타일 (하위 경로 포함) */
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

  /** 로그인 가드: user 기준이 안전 */
  const guardNav = useCallback(
    (path: string) => {
      if (!user) navigate(`/login?re_uri=${encodeURIComponent(path)}`);
      else navigate(path);
    },
    [user, navigate]
  );

  /** 인사말: user 기준으로만 표시(로컬 캐시 잔상 방지) */
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
        {/* 로고 / 타이틀 */}
        <Link
          to="/"
          className="text-2xl font-extrabold text-purple-600 tracking-tight"
        >
          여긴어때
        </Link>

        {/* 메뉴 */}
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={() => guardNav("/step2?fresh=1")}
            className={linkStyle("/step2")}
          >
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
)
  ;
}
