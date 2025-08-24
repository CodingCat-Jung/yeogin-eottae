import { useNavigate } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import {
  Car,
  TramFront,
  CircleArrowLeft,
  CircleArrowRight,
  Minus,
  Plus,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";

/** ── 유틸 ───────────────────────────────────────── */
const clampInt = (v: number, min = 1, max = 365) =>
  Math.max(min, Math.min(max, Math.floor(v || 0)));
const parseSchedule = (s?: string | null) => {
  if (!s) return { night: 1, day: 2 };
  const m = s.match(/(\d+)\s*night\s+(\d+)\s*days/i);
  if (!m) return { night: 1, day: 2 };
  return { night: clampInt(+m[1]), day: clampInt(+m[2]) };
};
const parseBudget = (s?: string | null) => {
  if (!s) return 100000;
  const n = Number(String(s).replace(/[^\d]/g, ""));
  return n > 0 ? n : 100000;
};
const formatKRW = (n: number) => n.toLocaleString("ko-KR");

/** ── 교통수단 카드 컴포넌트 ───────────────────────── */
type TransportOptionCardProps = {
  active: boolean;
  label: string;
  onSelect: () => void;
  Icon: typeof Car;
};
function TransportOptionCard({ active, label, onSelect, Icon }: TransportOptionCardProps) {
  return (
    <motion.label
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={[
        "flex flex-col items-center justify-center",
        "w-32 h-36 md:w-36 md:h-40", // ← 박스 크게
        "rounded-2xl border-2 cursor-pointer transition-all duration-300",
        "focus-within:ring-2 focus-within:ring-[#6C3DF4]/50",
        active
          ? "border-[#6C3DF4] bg-purple-50 text-[#6C3DF4] shadow-md"
          : "border-gray-200 text-gray-800 hover:border-[#6C3DF4]/40",
      ].join(" ")}
      tabIndex={0}
      role="radio"
      aria-checked={active}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <Icon size={28} /> {/* 아이콘은 28px 유지 */}
        <span className="text-lg font-semibold">{label}</span>
      </div>
      <input type="radio" checked={active} onChange={onSelect} className="sr-only" />
    </motion.label>
  );
}

/** ── 페이지 ─────────────────────────────────────── */
export default function Step4() {
  const navigate = useNavigate();

  // ✅ 초기 복원
  const initial = useMemo(() => {
    const { night, day } = parseSchedule(localStorage.getItem("schedule"));
    const budget = parseBudget(localStorage.getItem("budget"));
    const transport = (localStorage.getItem("transport") as "public" | "car") || "public";
    return { night, day, budget, transport };
  }, []);

  const [transport, setTransport] = useState<"public" | "car">(initial.transport);
  const [night, setNight] = useState<number>(initial.night);
  const [day, setDay] = useState<number>(initial.day);
  const [budgetDisp, setBudgetDisp] = useState<string>(formatKRW(initial.budget));

  const nightRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  // 숫자 증감
  const inc = (setter: (v: number) => void, cur: number) => setter(clampInt(cur + 1));
  const dec = (setter: (v: number) => void, cur: number) => setter(clampInt(cur - 1));

  // 예산 입력(표시는 콤마, 저장은 숫자)
  const handleBudgetChange = (val: string) => {
    const num = Number(val.replace(/[^\d]/g, "").slice(0, 12));
    setBudgetDisp(num ? formatKRW(num) : "");
  };
  const budgetNumber = Number(budgetDisp.replace(/[^\d]/g, "") || 0);

  const canSubmit = night > 0 && day > 0 && budgetNumber > 0 && !!transport;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    localStorage.setItem("schedule", `${night}night ${day}days`);
    localStorage.setItem("budget", `${budgetNumber}KRW`);
    localStorage.setItem("transport", transport);
    navigate("/step5");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-b from-[#FDF7F1] to-[#FFFAF4]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-8 md:p-10 space-y-10 border border-white"
      >
        {/* 헤더 */}
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            예산과 여행 기간을 알려주세요
          </h1>
          <p className="text-base text-gray-700 leading-relaxed">
            ✨ 여행을 얼마나 오래 떠날지, 얼마나 여유롭게 다닐지
            <br />
            <span className="text-[#6C3DF4] font-semibold">당신만의 스타일로 계획</span>해봐요.
          </p>
        </div>

        {/* 여행 기간 */}
        <section>
          <label className="block text-lg font-semibold text-gray-900 mb-4">여행 기간</label>
          <div className="flex flex-wrap gap-6 items-center">
            {/* 박 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="박 감소"
                onClick={() => dec(setNight, night)}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition"
              >
                <Minus size={16} />
              </button>
              <input
                ref={nightRef}
                type="number"
                min={1}
                max={365}
                value={night}
                onChange={(e) => setNight(clampInt(+e.target.value))}
                className="w-24 px-4 py-2 rounded-lg border border-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/50 focus:border-[#6C3DF4]"
              />
              <span className="text-gray-800 font-medium">박</span>
              <button
                type="button"
                aria-label="박 증가"
                onClick={() => inc(setNight, night)}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* 일 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="일 감소"
                onClick={() => dec(setDay, day)}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition"
              >
                <Minus size={16} />
              </button>
              <input
                ref={dayRef}
                type="number"
                min={1}
                max={366}
                value={day}
                onChange={(e) => setDay(clampInt(+e.target.value))}
                className="w-24 px-4 py-2 rounded-lg border border-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/50 focus:border-[#6C3DF4]"
              />
              <span className="text-gray-800 font-medium">일</span>
              <button
                type="button"
                aria-label="일 증가"
                onClick={() => inc(setDay, day)}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">최소 1박 1일, 최대 1년까지 입력할 수 있어요.</p>
        </section>

        {/* 예산 */}
        <section>
          <label className="block text-lg font-semibold text-gray-900 mb-3">예산 (₩)</label>
          <div className="relative">
            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              inputMode="numeric"
              value={budgetDisp}
              onChange={(e) => handleBudgetChange(e.target.value)}
              placeholder="100,000"
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/50 focus:border-[#6C3DF4]"
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            여유로운 여행을 위한 예상 금액을 입력해보세요. <span className="text-gray-400">(천단위 구분 자동)</span>
          </p>
        </section>

        {/* 교통수단 */}
        <section>
          <label className="block text-lg font-semibold text-gray-900 mb-4">교통수단</label>
          <div
            role="radiogroup"
            aria-label="교통수단 선택"
            className="grid grid-cols-2 gap-4 sm:flex sm:gap-6"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                setTransport((prev) => (prev === "public" ? "car" : "public"));
              }
            }}
          >
            <TransportOptionCard
              active={transport === "public"}
              label="대중교통"
              onSelect={() => setTransport("public")}
              Icon={TramFront}
            />
            <TransportOptionCard
              active={transport === "car"}
              label="자가용"
              onSelect={() => setTransport("car")}
              Icon={Car}
            />
          </div>
        </section>

        {/* 하단 네비게이션 */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
          <button
            type="button"
            onClick={() => navigate("/step3")}
            className="text-gray-700 hover:text-[#6C3DF4] flex items-center gap-1"
          >
            <CircleArrowLeft size={20} />
            뒤로가기
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              "flex items-center gap-2 px-6 py-2 rounded-full shadow-md transition-all",
              canSubmit
                ? "bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] text-white hover:shadow-lg hover:brightness-105"
                : "bg-gradient-to-r from-purple-100 to-purple-50 text-[#8F78F6] border border-[#E5DCFF] cursor-not-allowed",
            ].join(" ")}
          >
            다음으로
            <CircleArrowRight size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}
