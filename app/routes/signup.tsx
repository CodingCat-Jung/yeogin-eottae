// app/routes/signup.tsx
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import LogoBlock from "@/components/LogoBlock";
import { useTravelStore } from "@/store/travelStore";
import { useAuthStore } from "@/store/authStore";

const API_BASE = import.meta.env.VITE_BACKEND_ADDRESS || "http://127.0.0.1:8000";

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialNickname = searchParams.get("nickname") || "";
  const reUri = searchParams.get("re_uri") || "/step2";

  const [form, setForm] = useState({ nickname: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const setNickname = useTravelStore((s) => s.setNickname);
  const { setToken, setUser, setAuthed } = useAuthStore();

  useEffect(() => {
    setForm((prev) => ({ ...prev, nickname: initialNickname }));
  }, [initialNickname]);

  const nickState = useMemo(() => {
    const v = form.nickname.trim();
    if (!v) return { valid: false, msg: "" };
    if (v.length < 2) return { valid: false, msg: "닉네임은 2자 이상이어야 해요." };
    if (v.length > 12) return { valid: false, msg: "닉네임은 최대 12자까지 가능해요." };
    if (!/^[a-zA-Z0-9가-힣_-]+$/.test(v))
      return { valid: false, msg: "한글/영문/숫자/ _ - 만 사용할 수 있어요." };
    return { valid: true, msg: "" };
  }, [form.nickname]);

  const pwState = useMemo(() => {
    const v = form.password;
    if (!v) return { valid: false, msg: "" };
    if (v.length < 8) return { valid: false, msg: "비밀번호는 8자 이상이 좋아요." };
    return { valid: true, msg: "" };
  }, [form.password]);

  const canSubmit = nickState.valid && pwState.valid && !loading;

  // ── 로그인 응답 공통 처리 (JWT 우선, 실패 시 쿠키 세션) ──
  async function handleLoginJWT(json: any) {
    const token: string | undefined =
      json.token ?? json.accessToken ?? json.jwt ?? json.data?.token;
    const userIdRaw: number | string | undefined =
      json.user_id ?? json.user?.id ?? json.id;
    const returnedName: string =
      json.nickname ?? json.user?.nickname ?? form.nickname.trim();

    if (!token) return false;

    setToken(token);
    setAuthed(true);

    if (returnedName && userIdRaw != null) {
      setUser({
        id: typeof userIdRaw === "string" ? parseInt(userIdRaw) : userIdRaw,
        nickname: returnedName,
      });
      setNickname(returnedName);
    } else {
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
    const meRes = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!meRes.ok) return false;
    const me = await meRes.json();
    setUser({ id: me.id, nickname: me.nickname });
    setAuthed(true);
    setNickname(me.nickname);
    return true;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError("");
    setLoading(true);

    try {
      // 1) 회원가입
      const signRes = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          password: form.password,
        }),
      });
      if (!signRes.ok) {
        const msg = await signRes.text();
        throw new Error(msg || "회원가입에 실패했습니다.");
      }

      // 2) 즉시 로그인 (JWT/쿠키 모두 대응)
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          password: form.password,
        }),
      });
      if (!loginRes.ok) {
        throw new Error("회원가입은 완료되었지만 로그인에 실패했어요.");
      }

      const json = await loginRes.json().catch(() => ({} as any));
      const jwtHandled = await handleLoginJWT(json);
      if (!jwtHandled) {
        const cookieHandled = await handleLoginCookie();
        if (!cookieHandled) throw new Error("로그인 세션 설정에 실패했습니다.");
      }

      navigate(reUri);
    } catch (err: any) {
      try {
        const parsed = JSON.parse(err?.message ?? "");
        setServerError(parsed.message || "회원가입에 실패했습니다.");
      } catch {
        setServerError(err?.message || "회원가입에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-[linear-gradient(#FFFBF6,#FFFFFF)]">
      {/* 배경 */}
      <div className="pointer-events-none absolute -top-[12vh] left-1/2 h-[30rem] w-[30rem] md:h-[34rem] md:w-[34rem] xl:h-[42rem] xl:w-[42rem] -translate-x-1/2 rounded-full bg-[#9D7DFF] opacity-15 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(transparent_1px,rgba(0,0,0,0.015)_1px)] [background-size:18px_18px]" />

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="text-center mb-6">
          <LogoBlock />
          <h2 className="mt-3 text-lg font-semibold text-zinc-800">회원가입</h2>
          <p className="mt-1 text-sm text-zinc-500">여행의 설렘, 지금 시작하세요.</p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
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
              onChange={(e) => { setServerError(""); setForm({ ...form, nickname: e.target.value }); }}
              placeholder="예) 여행러, sunny, jay_park"
              aria-invalid={!!form.nickname && !nickState.valid}
              aria-describedby="nick-help nick-error"
              className={[
                "mt-1 w-full rounded-xl border px-4 py-3 text-sm outline-none transition bg-white/90 focus:bg-white",
                !form.nickname || nickState.valid
                  ? "border-zinc-200 focus:border-[#6C3DF4]"
                  : "border-rose-300 focus:border-rose-400",
              ].join(" ")}
            />
            <div className="mt-1 flex items-center justify-between">
              <span id="nick-help" className="text-[11px] text-zinc-400">2~12자, 한글/영문/숫자/ _ -</span>
              {!nickState.valid && form.nickname && (
                <span id="nick-error" className="text-[11px] text-rose-500">{nickState.msg}</span>
              )}
            </div>
          </div>

          {/* 비밀번호 */}
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-zinc-600">
              비밀번호
            </label>
            <div className={[
              "mt-1 flex items-center rounded-xl border px-3 py-1 transition bg-white/90 focus-within:bg-white",
              !form.password || pwState.valid
                ? "border-zinc-200 focus-within:border-[#6C3DF4]"
                : "border-rose-300 focus-within:border-rose-400",
            ].join(" ")}>
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => { setServerError(""); setForm({ ...form, password: e.target.value }); }}
                placeholder="비밀번호를 입력하세요"
                className="w-full py-2.5 px-1 text-sm outline-none bg-transparent"
                aria-invalid={!!form.password && !pwState.valid}
                aria-describedby="pw-help pw-error"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 transition"
                aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보이기"}
              >
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span id="pw-help" className="text-[11px] text-[#6C3DF4]/70">8자 이상을 권장해요.</span>
              {!pwState.valid && form.password && (
                <span id="pw-error" className="text-[11px] text-rose-500">{pwState.msg}</span>
              )}
            </div>
          </div>

          {/* 서버 에러 */}
          {serverError && <p className="mt-4 text-center text-sm text-rose-600">{serverError}</p>}

          {/* CTA */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl
                       bg-gradient-to-r from-[#6C3DF4] to-[#A17CFF] font-semibold text-white
                       border border-white/20 shadow-lg shadow-[#6C3DF4]/25
                       transition enabled:hover:border-white/30 enabled:hover:shadow-[#6C3DF4]/40
                       enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "가입 중..." : "가입하기"}
            <ArrowRight className="h-5 w-5 translate-x-0 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 로그인 링크 */}
          <p className="mt-6 text-right text-sm text-zinc-500">
            이미 계정이 있나요?{" "}
            <a
              href={`/login?nickname=${encodeURIComponent(form.nickname)}`}
              className="font-medium text-[#6C3DF4]/70 underline-offset-2 hover:text-[#6C3DF4] hover:underline"
            >
              로그인하기
            </a>
          </p>
        </motion.form>

        <p className="mt-8 text-center text-xs text-zinc-400">
          © 2025 여긴어때. All rights reserved.
        </p>
      </div>
    </main>
  );
}
