// app/routes/month.tsx
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, ArrowLeft, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTravelStore } from "@/store/travelStore";

const MONTHS = [
  { key: "01", label: "1월" }, { key: "02", label: "2월" }, { key: "03", label: "3월" },
  { key: "04", label: "4월" }, { key: "05", label: "5월" }, { key: "06", label: "6월" },
  { key: "07", label: "7월" }, { key: "08", label: "8월" }, { key: "09", label: "9월" },
  { key: "10", label: "10월" }, { key: "11", label: "11월" }, { key: "12", label: "12월" },
];

// store의 month("YYYY-MM" | "flexible" | null) → 초기 선택값만 추출
const initSelectedFromStore = (v: string | null) => {
  if (!v || v === "flexible") return null;
  const mm = (v.includes("-") ? v.split("-")[1] : v).padStart(2, "0");
  return MONTHS.some(m => m.key === mm) ? mm : null;
};

export default function MonthSelectPage() {
  const navigate = useNavigate();
  const monthInStore = useTravelStore(s => s.month);
  const setMonth     = useTravelStore(s => s.setMonth);

  // ✅ 로컬 상태(디자인/선택만 담당)
  const [selected, setSelected] = useState<string | null>(initSelectedFromStore(monthInStore));
  const [flexible, setFlexible] = useState<boolean>(monthInStore === "flexible");

  // 현재(실시간)
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ✅ 선택된 월에 맞춰 **표시/저장용 연도** 동적 계산
  const targetYear = useMemo(() => {
    if (!selected) return currentYear;
    const sel = parseInt(selected, 10);
    // 선택 월이 현재 월보다 작으면 내년, 아니면 올해
    return sel < currentMonth ? currentYear + 1 : currentYear;
  }, [selected, currentMonth, currentYear]);

  const canNext = flexible || !!selected;

  const handleNext = () => {
    if (!canNext) return;
    const value = flexible
      ? "flexible"
      : `${targetYear}-${selected}`; // ✅ 자동 보정된 연도로 저장
    setMonth(value);
    navigate("/step2");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FEF7EC] to-[#FFF4FD] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        {/* 헤더 */}
        <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-16 h-16 bg-[#6C3DF4] text-white rounded-full flex items-center justify-center shadow-xl mx-auto mb-4">
            <Calendar size={30} />
          </div>
          <h1 className="text-[26px] font-extrabold text-[#3F30C4] tracking-tight">언제 떠나시나요?</h1>
          <p className="text-sm text-gray-600 mt-2">여행의 계절감을 반영해 더 섬세하게 추천해 드릴게요.</p>
        </motion.div>

        {/* 카드 */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                    className="mx-auto bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white w-full max-w-2xl"
        >
          {/* 상단 상태 */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-gray-800 text-lg font-medium">
              {selected && !flexible
                ? `${targetYear}년 ${parseInt(selected,10)}월 선택됨`
                : flexible
                  ? "일정이 유연해요"
                  : "월을 선택해 주세요"}
            </span>

            <button
              type="button"
              onClick={() => { setFlexible(v => !v); setSelected(null); }}
              className={`px-3 py-2 rounded-lg text-sm border transition ${
                flexible ? "border-[#6C3DF4] text-[#6C3DF4] bg-[#F9F5FF]" :
                  "border-gray-300 text-gray-600 hover:border-[#6C3DF4]/40"
              }`}
            >
              일정이 유연해요
            </button>
          </div>

          {/* 월 선택 그리드 */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 md:gap-4">
            {MONTHS.map(m => {
              const active = selected === m.key && !flexible;
              return (
                <motion.button
                  key={m.key}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setSelected(m.key); setFlexible(false); }}
                  className={[
                    "h-14 md:h-16 rounded-xl border transition flex items-center justify-center font-semibold",
                    active
                      ? "border-transparent bg-gradient-to-r from-[#F2ECFF] to-[#FBF7FF] text-[#3F30C4] shadow-md"
                      : "border-gray-200 bg-white text-gray-700 hover:border-[#6C3DF4]/40 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {m.label}
                </motion.button>
              );
            })}
          </div>

          {/* 안내 텍스트 */}
          <div className="mt-6 text-sm text-gray-500">
            {flexible ? (
              <p>정확한 달이 정해지지 않으셨다면 <b>유연한 일정</b>으로 추천을 받아보세요.</p>
            ) : selected ? (
              <p><b>{targetYear}년 {parseInt(selected,10)}월</b> 여행을 기준으로 추천을 준비할게요.</p>
            ) : (
              <p>월을 선택하거나 <b>일정이 유연해요</b>를 선택하세요.</p>
            )}
          </div>

          {/* 하단 버튼 */}
          <div className="mt-8 flex justify-end items-center">
            <button
              onClick={handleNext}
              disabled={!canNext}
              className={[
                "px-5 py-2 rounded-xl flex items-center gap-2 transition-all border",
                canNext
                  ? "text-white bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] border-transparent shadow-md hover:shadow-lg hover:brightness-105"
                  : "text-[#8F78F6] bg-gradient-to-r from-purple-100 to-purple-50 border-purple-200 cursor-not-allowed",
              ].join(" ")}
            >
              다음 <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
