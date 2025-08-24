// app/routes/step2.tsx  (파일 경로는 프로젝트 구조에 맞춰 조정)
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User,
  Handshake,
  Heart,
  Users,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

type Option = { label: string; Icon: typeof User };

export default function Step2() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("");

  const options: Option[] = useMemo(
    () => [
      { label: "혼자", Icon: User },
      { label: "친구", Icon: Handshake },
      { label: "연인", Icon: Heart },
      { label: "가족", Icon: Users },
    ],
    []
  );

  // ✅ 이전 선택 복원
  useEffect(() => {
    const saved = localStorage.getItem("travelWith");
    if (saved) setSelected(saved);
  }, []);

  const handleNext = () => {
    if (!selected) return;
    localStorage.setItem("travelWith", selected);
    navigate(`/step3?companion=${encodeURIComponent(selected)}`);
  };

  // 방향키로 이동
  const move = (dir: 1 | -1) => {
    const idx = options.findIndex((o) => o.label === selected);
    const next = idx === -1 ? 0 : (idx + dir + options.length) % options.length;
    setSelected(options[next].label);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 bg-[#6C3DF4] text-white rounded-full flex items-center justify-center shadow-xl mx-auto mb-4">
            <User size={30} />
          </div>
          <h1 className="text-[26px] font-extrabold text-[#3F30C4] tracking-tight">
            누구와 함께하나요?
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            당신의 여행 동반자를 선택해 주세요
          </p>
        </motion.div>

        {/* 카드 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white w-full max-w-2xl"
        >
          <div
            role="radiogroup"
            aria-label="여행 동반자 선택"
            className="space-y-3"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                handleNext();
              }
            }}
          >
            {options.map(({ label, Icon }) => {
              const active = selected === label;
              return (
                <motion.button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(label)}
                  whileTap={{ scale: 0.98 }}
                  className={[
                    "group w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 focus:outline-none",
                    "focus:ring-2 focus:ring-[#6C3DF4]/50",
                    active
                      ? "border-transparent bg-gradient-to-r from-[#F2ECFF] to-[#FBF7FF] shadow-md"
                      : "border-gray-200 hover:border-[#6C3DF4]/40 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {/* 아이콘 박스 */}
                  <div
                    className={[
                      "flex h-10 w-10 items-center justify-center rounded-lg transition",
                      active
                        ? "bg-[#6C3DF4]/15"
                        : "bg-[#6C3DF4]/8 group-hover:bg-[#6C3DF4]/12",
                    ].join(" ")}
                  >
                    <Icon
                      size={26}
                      className={active ? "text-[#6C3DF4]" : "text-[#8F78F6]"}
                    />
                  </div>

                  <span
                    className={[
                      "text-lg font-semibold transition-colors",
                      active ? "text-[#3F30C4]" : "text-gray-800",
                    ].join(" ")}
                  >
                    {label}
                  </span>

                  {/* 선택 인디케이터 */}
                  <span
                    aria-hidden
                    className={[
                      "ml-auto h-5 w-5 rounded-full border transition-colors",
                      active
                        ? "border-[#6C3DF4] bg-[#6C3DF4]"
                        : "border-gray-300 bg-white group-hover:border-[#6C3DF4]/50",
                    ].join(" ")}
                  />
                </motion.button>
              );
            })}
          </div>

          {/* 하단 버튼 */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={() => navigate(-1)}
              className="text-[#6C3DF4] flex items-center gap-1 px-4 py-2 text-sm hover:opacity-80 transition"
            >
              <ArrowLeft size={18} />
              뒤로가기
            </button>

            <button
              onClick={handleNext}
              disabled={!selected}
              className={[
                "px-5 py-2 rounded-xl flex items-center gap-2 transition-all border",
                selected
                  ? "text-white bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] border-transparent shadow-md hover:shadow-lg hover:brightness-105"
                  : "text-[#8F78F6] bg-gradient-to-r from-purple-100 to-purple-50 border-purple-200 cursor-not-allowed",
              ].join(" ")}
            >
              다음으로
              <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
