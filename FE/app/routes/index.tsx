import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LogoBlock from "@/components/LogoBlock";

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [touched, setTouched] = useState(false);
  const navigate = useNavigate();

  // ✅ 닉네임 규칙 체크
  const { isValid, message } = useMemo(() => {
    const v = nickname.trim();
    if (!v) return { isValid: false, message: "" };
    if (v.length < 2) return { isValid: false, message: "닉네임은 2자 이상이어야 해요." };
    if (v.length > 12) return { isValid: false, message: "닉네임은 최대 12자까지 가능해요." };
    if (!/^[a-zA-Z0-9가-힣_-]+$/.test(v))
      return { isValid: false, message: "한글/영문/숫자/ _ - 만 사용할 수 있어요." };
    return { isValid: true, message: "" };
  }, [nickname]);

  const handleNextStep = () => {
    if (isValid) {
      navigate(`/signup?nickname=${encodeURIComponent(nickname.trim())}`);
    } else {
      setTouched(true);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 flex items-center justify-center bg-[linear-gradient(#FFFBF6,#FFFFFF)]">
      {/* 🔮 배경: 보라 광원 확대 (초광폭에서 허전함 보완) */}
      <div className="pointer-events-none absolute -top-[12vh] left-1/2
        h-[30rem] w-[30rem] md:h-[34rem] md:w-[34rem] xl:h-[42rem] xl:w-[42rem]
        -translate-x-1/2 rounded-full bg-[#9D7DFF] opacity-15 blur-[130px]" />

      {/* ✨ 은은한 도트 패턴 (밀도 낮춤) */}
      <div className="pointer-events-none absolute inset-0
        [background-image:radial-gradient(transparent_1px,rgba(0,0,0,0.015)_1px)]
        [background-size:18px_18px]" />

      <div className="z-10 text-center">
        {/* 로고 블록 */}
        <div className="mb-4">
          <LogoBlock />
        </div>

        {/* 카드 */}
        <motion.div
          initial={{ opacity: 0, y: 18, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 w-full max-w-[520px] rounded-3xl bg-white/90 px-8 py-10 shadow-[0_16px_48px_-14px_rgba(0,0,0,0.14)] backdrop-blur-sm"
        >
          <h2 className="mb-3 text-xl font-semibold text-zinc-800">
            여행의 시작은{" "}
            <span className="bg-gradient-to-r from-[#6C3DF4] to-[#A17CFF] bg-clip-text font-extrabold text-transparent">
              당신의 이름
            </span>
            부터
          </h2>
          <p className="text-sm text-zinc-500">
            당신만의 여행 이야기를 들려주세요.
            <br className="hidden sm:block" />
            이름 한 줄이면 충분해요.
          </p>
          <p className="mt-2 text-xs italic text-zinc-400">
            ✦ 여긴어때는 당신의 발걸음을 기록하는 여행 파트너예요
          </p>

          {/* 입력 폼 */}
          <div className="mt-7 text-left">
            <label htmlFor="nickname" className="mb-1 block text-xs font-medium text-zinc-600">
              닉네임
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleNextStep();
                }
              }}
              placeholder="예) 여행러, sunny, jay_park"
              aria-invalid={touched && !isValid}
              aria-describedby="nickname-help nickname-error"
              className={[
                "w-full rounded-xl border px-4 py-3 text-sm outline-none transition bg-white/90 focus:bg-white",
                touched && !isValid
                  ? "border-rose-300 focus:border-rose-400"
                  : "border-zinc-200 focus:border-[#6C3DF4]"
              ].join(" ")}
            />
            <div className="mt-1 flex items-center justify-between">
              <span id="nickname-help" className="text-[11px] text-zinc-400">
                2~12자, 한글/영문/숫자/ _ -
              </span>
              {touched && !isValid && (
                <span id="nickname-error" className="text-[11px] text-rose-500">
                  {message}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">닉네임은 공개 프로필에만 사용돼요.</p>
          </div>

          {/* CTA 버튼 */}
          <button
            onClick={handleNextStep}
            disabled={!isValid}
            className="group mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl
                       bg-gradient-to-r from-[#6C3DF4] to-[#A17CFF] font-semibold text-white
                       border border-white/20 shadow-lg shadow-[#6C3DF4]/25
                       transition enabled:hover:border-white/30 enabled:hover:shadow-[#6C3DF4]/40
                       enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음 단계로
            <ArrowRight className="h-5 w-5 translate-x-0 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 로그인 링크 */}
          <p className="mt-6 text-right text-sm text-zinc-500">
            이미 계정이 있나요?{" "}
            <a
              href="/login"
              className="font-medium text-[#6C3DF4]/70 underline-offset-2 hover:text-[#6C3DF4] hover:underline"
            >
              로그인하기
            </a>
          </p>
        </motion.div>

        {/* 푸터 */}
        <p className="mt-8 text-xs text-zinc-400">© 2025 여긴어때. All rights reserved.</p>
      </div>
    </main>
  );
}
