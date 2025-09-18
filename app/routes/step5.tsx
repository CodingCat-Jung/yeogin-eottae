// app/routes/step5.tsx
import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Landmark, Building, Map, Mountain, Ship, CircleEllipsis,
  FlameKindling, Leaf, Snowflake,
  Armchair, Footprints, Activity,
  ArrowLeft, ArrowRight, Globe2,
} from "lucide-react";

const continentOptions = [
  { id: "asia", label: "아시아", icon: Landmark },
  { id: "europe", label: "유럽", icon: Building },
  { id: "america", label: "아메리카", icon: Map },
  { id: "africa", label: "아프리카", icon: Mountain },
  { id: "oceania", label: "오세아니아", icon: Ship },
  { id: "anywhere", label: "상관없음", icon: CircleEllipsis },
] as const;

const environmentOptions = [
  { id: "warm", label: "따뜻한", icon: FlameKindling },
  { id: "fresh", label: "상쾌한", icon: Leaf },
  { id: "snowy", label: "눈 내리는", icon: Snowflake },
] as const;

const paceOptions = [
  { id: "relaxed", label: "느긋하게", icon: Armchair },
  { id: "moderate", label: "적당히", icon: Footprints },
  { id: "active", label: "활동적으로", icon: Activity },
] as const;

type Option = { id: string; label: string; icon: React.ComponentType<{ size?: number }> };

function OptionCard({
                      opt, active, onSelect,
                    }: { opt: Option; active: boolean; onSelect: () => void }) {
  const Icon = opt.icon;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      role="radio"
      aria-checked={active}
      className={[
        "flex flex-col items-center justify-center",
        "min-h-[90px] xs:min-h-[104px] sm:min-h-[112px]",
        "rounded-2xl border-2 px-3 py-4 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/50",
        active
          ? "border-[#6C3DF4] bg-[#F4EEFF] text-[#6C3DF4] shadow-sm"
          : "border-zinc-200 text-zinc-800 hover:border-[#6C3DF4]/40",
      ].join(" ")}
    >
      <Icon size={26} />
      <span className={`mt-2 text-[13px] sm:text-sm ${active ? "font-semibold" : ""}`}>
        {opt.label}
      </span>
    </motion.button>
  );
}

function Section({
                   title, options, selected, setSelected, ariaLabel,
                 }: {
  title: string;
  options: ReadonlyArray<Option>;
  selected: string;
  setSelected: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <section className="space-y-3">
      <p className="text-[15px] sm:text-base font-semibold text-[#6C3DF4]">{title}</p>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-6"
      >
        {options.map((opt) => (
          <OptionCard
            key={opt.id}
            opt={opt}
            active={selected === opt.id}
            onSelect={() => setSelected(opt.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Step5() {
  const navigate = useNavigate();
  const location = useLocation();
  const actType = useMemo(() => new URLSearchParams(location.search).get("act"), [location.search]);

  // 미선택 시작
  const [continent, setContinent] = useState("");
  const [environment, setEnvironment] = useState("");
  const [pace, setPace] = useState("");
  const canNext = continent && environment && pace;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canNext) return;
    localStorage.setItem("continent", continent);
    localStorage.setItem("climate", environment);
    localStorage.setItem("density", pace);
    navigate(`/step-time?cont=${continent}&env=${environment}&pace=${pace}`);
  };

  return (
    <div
      className="
        min-h-screen
        bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC]
        px-4
        pt-[calc(var(--nav-h)+24px)]
        pb-8
      "
    >
      <div className="max-w-5xl mx-auto">
        {/* 카드 컨테이너 */}
        <div className="bg-white/90 backdrop-blur-[1px] border border-white rounded-3xl shadow-xl overflow-hidden">
          {/* 헤더 */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center px-5 pt-8 sm:pt-10"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#6C3DF4] text-white rounded-full flex items-center justify-center shadow-lg mx-auto mb-3">
              <Globe2 size={24} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3F30C4]">
              당신이 그리는 여행의 풍경은 어떤가요?
            </h1>
            <p className="text-[13px] sm:text-sm text-gray-600 mt-1">
              머릿속에 그려지는 그 감정과 분위기를{" "}
              <span className="text-[#6C3DF4] font-medium">지금</span> 선택해보세요.
            </p>
          </motion.div>

          {/* 본문 폼 */}
          <form onSubmit={handleSubmit} className="px-5 sm:px-8 md:px-10 pt-6 pb-2 space-y-7 sm:space-y-9">
            <Section
              title="대륙 선택"
              options={continentOptions as unknown as Option[]}
              selected={continent}
              setSelected={setContinent}
              ariaLabel="대륙 선택"
            />

            <Section
              title="기온 선호"
              options={environmentOptions as unknown as Option[]}
              selected={environment}
              setSelected={setEnvironment}
              ariaLabel="기온 선호 선택"
            />

            <Section
              title="여행 스타일"
              options={paceOptions as unknown as Option[]}
              selected={pace}
              setSelected={setPace}
              ariaLabel="여행 스타일 선택"
            />

            {/* 카드 푸터: 뒤로가기 / 다음으로 */}
            <div className="mt-4 pt-5 border-t border-zinc-100">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => navigate(`/step4?act=${actType ?? ""}`)}
                  className="text-[#6C3DF4] hover:opacity-90 inline-flex items-center gap-1 px-3 py-2"
                >
                  <ArrowLeft size={18} />
                  뒤로가기
                </button>

                <button
                  type="submit"
                  disabled={!canNext}
                  className={[
                    "inline-flex items-center gap-2 rounded-full",
                    "px-5 sm:px-6 py-2.5 sm:py-3",
                    "text-white text-sm sm:text-base font-semibold shadow-md transition-all",
                    canNext
                      ? "bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] hover:opacity-90"
                      : "bg-zinc-300 cursor-not-allowed",
                  ].join(" ")}
                >
                  다음으로
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
