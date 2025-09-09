// src/components/LogoBlock.tsx
import { Plane } from "lucide-react";
import { motion } from "framer-motion";

type LogoBlockProps = {
  compact?: boolean;
};

export default function LogoBlock({ compact = false }: LogoBlockProps) {
  const ringSize = compact ? "h-12 w-12 md:h-14 md:w-14" : "h-14 w-14 md:h-16 md:w-16";
  const titleSize = compact ? "text-xl md:text-2xl" : "text-2xl md:text-[28px]";
  const iconSize = compact ? 20 : 24; // ✅ 크기 살짝 업

  return (
    <motion.div
      className="flex flex-col items-center justify-center select-none"
      initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      aria-label="여긴어때 로고"
      role="img"
    >
      {/* ── Halo(광륜) + Glass core */}
      <div className="relative">
        {/* 외곽 콘익 그라디언트 링 */}
        <div
          className={[
            "absolute inset-0 -z-10 rounded-full opacity-60 blur-[10px]",
            "bg-[conic-gradient(from_180deg_at_50%_50%,#A17CFF_0deg,#6C3DF4_120deg,#B9A8FF_240deg,#A17CFF_360deg)]",
          ].join(" ")}
        />
        {/* 글래스 아이콘 박스 */}
        <div
          className={[
            ringSize,
            "rounded-full border border-white/60 bg-white/70 backdrop-blur-md",
            "shadow-[0_8px_30px_-12px_rgba(108,61,244,0.35)]",
            "grid place-items-center transition-transform duration-200 hover:translate-y-[-3px]",
          ].join(" ")}
        >
          {/* ✈️ 아이콘에 기울임 추가 */}
          <Plane
            width={iconSize}
            height={iconSize}
            className="text-[#6C3DF4] -rotate-12" // ✅ 기울여서 이륙 느낌
            aria-hidden="true"
          />
        </div>
        {/* 바닥 그림자 */}
        <div className="mx-auto mt-2 h-2 w-10 rounded-full bg-black/5 blur-[6px]" />
      </div>

      {/* 타이틀 */}
      <div
        className={[
          "mt-2 font-extrabold tracking-tight",
          titleSize,
          "bg-gradient-to-r from-[#6C3DF4] via-[#8F6BFF] to-[#A17CFF] bg-clip-text text-transparent",
        ].join(" ")}
      >
        여긴어때
      </div>
    </motion.div>
  );
}
