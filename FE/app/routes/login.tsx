// app/routes/login.tsx
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CircleArrowRight, Eye, EyeOff } from "lucide-react";
import LogoBlock from "@/components/LogoBlock";
import { useTravelStore } from "@/store/travelStore";
import { useAuthStore } from "@/store/authStore";

const API_BASE =
  import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

export default function Login() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const returnUrl = decodeURIComponent(params.get("re_uri") || "/step2");
  const prefillNickname = params.get("nickname") || "";

  const [form, setForm] = useState({ nickname: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const setNickname = useTravelStore((s) => s.setNickname);
  const { setToken, setUser, setAuthed } = useAuthStore();

  // 프리필 닉네임
  useEffect(() => {
    if (prefillNickname) setForm((p) => ({ ...p, nickname: prefillNickname }));
  }, [prefillNickname]);

  // 닉네임 규칙
  const nickState = useMemo(() => {
    const v = form.nickname.trim();
    if (!v) return { valid: false, msg: "" };
    if (v.length < 2) return { valid: false, msg: "닉네임은 2자 이상이어야 해요." };
    if (v.length > 12) return { valid: false, msg: "닉네임은 최대 12자까지 가능해요." };
    if (!/^[a-zA-Z0-9가-힣_-]+$/.test(v))
      return { valid: false, msg: "한글/영문/숫자/ _ - 만 사용할 수 있어요." };
    return { valid: true, msg: "" };
  }, [form.nickname]);

  const pwValid = !!form.password;
  const canSubmit = nickState.valid && pwValid && !loading;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerError("");
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  async function handleLoginJWT(result: any) {
    // 응답 스키마를 유연하게 대응
    const token: string | undefined =
      result.token ?? result.accessToken ?? result.jwt ?? result.data?.token;

    const userIdRaw: number | string | undefined =
      result.user_id ?? result.user?.id ?? result.id;

    const returnedName: string =
      result.nickname ?? result.user?.nickname ?? form.nickname.trim();

    if (!token) return false;

    // 1) 토큰 저장
    setToken(token);
    setAuthed(true);

    // 2) 사용자 정보 세팅 (응답에 포함돼 있으면 그대로, 아니면 /me 재조회)
    if (returnedName && userIdRaw != null) {
      setUser({
        id: typeof userIdRaw === "string" ? parseInt(userIdRaw) : userIdRaw,
        nickname: returnedName,
      });
      setNickname(returnedName);
    } else {
      // /me로 보강
      try {
        const meRes = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const me = await meRes.json();
          setUser({ id: me.id, nickname: me.nickname });
          setNickname(me.nickname);
        }
      } catch {}
    }

    return true;
  }

  async function handleLoginCookie() {
    // 세션/쿠키 방식
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
    });
    if (!meRes.ok) return false;
    const me = await meRes.json();
    setUser({ id: me.id, nickname: me.nickname });
    setAuthed(true);
    setNickname(me.nickname);
    return true;
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement> | KeyboardEvent) => {
    e.preventDefault?.();
    if (!canSubmit) return;

    setLoading(true);
    setServerError("");

    try {
      // 1) 로그인 요청 (JWT 또는 세션 쿠키 둘 다 대응)
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include", // 쿠키 방식도 함께 지원
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          password: form.password,
        }),
      });

      if (!res.ok) {
        setServerError("닉네임 또는 비밀번호를 확인하세요.");
        return;
      }

      // 2) JWT 우선 처리
      const json = await res.json().catch(() => ({} as any));
      const jwtHandled = await handleLoginJWT(json);
      if (jwtHandled) {
        navigate(returnUrl);
        return;
      }

      // 3) JWT가 없으면 쿠키 세션으로 /me 조회
      const cookieHandled = await handleLoginCookie();
      if (cookieHandled) {
        navigate(returnUrl);
        return;
      }

      // 4) 둘 다 실패
      setServerError("로그인 처리에 실패했습니다.");
    } catch (err: any) {
      setServerError(err?.message || "로그인 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-[linear-gradient(#FFFBF6,#FFFFFF)]">
      {/* 배경 라디얼 + 도트 */}
      <div
        className="pointer-events-none absolute -top-[12vh] left-1/2
        h-[30rem] w-[30rem] md:h-[34rem] md:w-[34rem] xl:h-[42rem] xl:w-[42rem]
        -translate-x-1/2 rounded-full bg-[#9D7DFF] opacity-15 blur-[130px]"
      />
      <div
        className="pointer-events-none absolute inset-0
        [background-image:radial-gradient(transparent_1px,rgba(0,0,0,0.015)_1px)]
        [background-size:18px_18px]"
      />

      <div className="relative z-10 w-full max-w-[560px]">
        {/* 타이틀 그룹 */}
        <div className="text-center mb-7">
          <LogoBlock />
          <h2 className="mt-4 text-lg font-semibold text-zinc-800">로그인</h2>
          <p className="mt-1 text-base leading-relaxed text-zinc-500">
            다시 만난 여행의 시작, 함께한 기록이 여기에 있어요.
          </p>
        </div>

        {/* 카드 폼 */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 18, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-[0_16px_48px_-14px_rgba(0,0,0,0.14)] px-8 py-10 text-left"
        >
          {/* 닉네임 */}
          <div className="mb-5">
            <label htmlFor="nickname" className="block text-xs font-medium text-zinc-600">
              닉네임
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              value={form.nickname}
              onChange={onChange}
              placeholder="닉네임을 입력하세요"
              aria-invalid={!!form.nickname && !nickState.valid}
              aria-describedby="nick-help nick-error"
              className={[
                "mt-1 w-full rounded-xl border px-4 py-3 text-sm outline-none transition bg-white/90 focus:bg-white",
                !form.nickname || nickState.valid
                  ? "border-zinc-200 focus:border-[#6C3DF4]"
                  : "border-rose-300 focus:border-rose-400",
              ].join(" ")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("password")?.focus();
                }
              }}
              autoComplete="username"
            />
            <div className="mt-1 flex items-center justify-between">
              <span id="nick-help" className="text-[11px] text-zinc-400">
                2~12자, 한글/영문/숫자/ _ -
              </span>
              {!nickState.valid && form.nickname && (
                <span id="nick-error" className="text-[11px] text-rose-500">
                  {nickState.msg}
                </span>
              )}
            </div>
          </div>

          {/* 비밀번호 */}
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-zinc-600">
              비밀번호
            </label>
            <div
              className={[
                "mt-1 flex items-center rounded-xl border px-3 py-1 transition bg-white/90 focus-within:bg-white",
                form.password
                  ? "border-zinc-200 focus-within:border-[#6C3DF4]"
                  : "border-zinc-200",
              ].join(" ")}
            >
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={onChange}
                placeholder="비밀번호를 입력하세요"
                className="w-full py-2.5 px-1 text-sm outline-none bg-transparent"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && onSubmit(e as any)}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="p-2 rounded-lg text-zinc-500 transition hover:text-zinc-700 hover:scale-[1.03]"
                aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보이기"}
              >
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              보안을 위해 개인 기기에서만 로그인 정보를 저장하세요.
            </div>
          </div>

          {/* 서버 에러 */}
          {serverError && (
            <p className="mt-4 text-center text-sm text-rose-600">{serverError}</p>
          )}

          {/* CTA 버튼 */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl
                       bg-gradient-to-r from-[#6C3DF4] to-[#A17CFF] font-semibold text-white
                       border border-white/20 shadow-lg shadow-[#6C3DF4]/25
                       transition enabled:hover:border-white/30 enabled:hover:shadow-[#6C3DF4]/40
                       enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            로그인
            <CircleArrowRight className="h-5 w-5 translate-x-0 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 보조 링크 */}
          <p className="mt-6 text-right text-sm text-zinc-500">
            아직 계정이 없으신가요?{" "}
            <Link
              to={`/signup?nickname=${encodeURIComponent(form.nickname)}`}
              className="font-medium text-[#6C3DF4]/70 underline-offset-2 hover:text-[#6C3DF4] hover:underline"
            >
              회원가입하기
            </Link>
          </p>
        </motion.form>

        {/* 푸터 */}
        <p className="mt-10 text-center text-xs text-zinc-400">
          © 2025 여긴어때. All rights reserved.
        </p>
      </div>
    </main>
  );
}
