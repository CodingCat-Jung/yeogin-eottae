import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Landmark,
  Building,
  Map,
  Mountain,
  Ship,
  CircleEllipsis,
  FlameKindling,
  Leaf,
  Snowflake,
  Armchair,
  Footprints,
  Activity,
  ArrowLeft,
  ArrowRight,
  Globe2,
} from "lucide-react";

const continentOptions = [
  { id: "asia", label: "아시아", icon: <Landmark size={32} /> },
  { id: "europe", label: "유럽", icon: <Building size={32} /> },
  { id: "america", label: "아메리카", icon: <Map size={32} /> },
  { id: "africa", label: "아프리카", icon: <Mountain size={32} /> },
  { id: "oceania", label: "오세아니아", icon: <Ship size={32} /> },
  { id: "anywhere", label: "상관없음", icon: <CircleEllipsis size={32} /> },
];

const environmentOptions = [
  { id: "warm", label: "따뜻한", icon: <FlameKindling size={32} /> },
  { id: "fresh", label: "상쾌한", icon: <Leaf size={32} /> },
  { id: "snowy", label: "눈 내리는", icon: <Snowflake size={32} /> },
];

const paceOptions = [
  { id: "relaxed", label: "느긋하게", icon: <Armchair size={32} /> },
  { id: "moderate", label: "적당히", icon: <Footprints size={32} /> },
  { id: "active", label: "활동적으로", icon: <Activity size={32} /> },
];

export default function Step5() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const actType = searchParams.get("act");

  const [continent, setContinent] = useState("");
  const [environment, setEnvironment] = useState("");
  const [pace, setPace] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (continent && environment && pace) {
      // 저장
      localStorage.setItem("continent", continent);
      localStorage.setItem("climate", environment);
      localStorage.setItem("density", pace);

      navigate(`/step-time?cont=${continent}&env=${environment}&pace=${pace}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC] flex flex-col items-center px-4 py-10 pt-20">
      {/* 상단 문구 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 mt-2"
      >
        <div className="w-16 h-16 bg-[#6C3DF4] text-white rounded-full flex items-center justify-center shadow-lg mx-auto mb-4">
          <Globe2 size={28} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-[#3F30C4]">
          당신이 그리는 여행의 풍경은 어떤가요?
        </h1>
        <p className="text-gray-600 mt-2 text-base md:text-lg">
          머릿속에 그려지는 그 감정과 분위기를{" "}
          <span className="font-medium text-[#6C3DF4]">지금</span> 선택해보세요.
        </p>
      </motion.div>

      {/* 선택 폼 */}
      <form onSubmit={handleSubmit} className="w-full max-w-4xl space-y-10">
        <Section
          title="대륙 선택"
          options={continentOptions}
          selected={continent}
          setSelected={setContinent}
        />

        <Section
          title="기온 선호"
          options={environmentOptions}
          selected={environment}
          setSelected={setEnvironment}
        />

        <Section
          title="여행 스타일"
          options={paceOptions}
          selected={pace}
          setSelected={setPace}
        />

        {/* 버튼 영역 */}
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            onClick={() => navigate(`/step4?act=${actType}`)}
            className="text-[#6C3DF4] flex items-center gap-1 px-4 py-2 text-sm"
          >
            <ArrowLeft size={18} />
            뒤로가기
          </button>

          <button
            type="submit"
            disabled={!(continent && environment && pace)}
            className={`px-6 py-3 rounded-xl text-white flex items-center gap-2 font-semibold transition-all shadow-md
              ${
              continent && environment && pace
                ? "bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] hover:opacity-90"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            다음으로
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}

type SectionProps = {
  title: string;
  options: { id: string; label: string; icon: React.ReactNode }[];
  selected: string;
  setSelected: (id: string) => void;
};

function Section({ title, options, selected, setSelected }: SectionProps) {
  return (
    <div>
      <p className="text-lg font-semibold mb-4 text-[#6C3DF4]">{title}</p>
      <div className="flex flex-wrap gap-4">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSelected(opt.id)}
            className={`flex flex-col items-center justify-center w-32 h-32 rounded-2xl border transition-all duration-200 shadow-sm
              ${
              selected === opt.id
                ? "border-[#6C3DF4] bg-[#f3edff] text-[#6C3DF4] font-semibold"
                : "border-gray-200 hover:border-[#6C3DF4]/40 text-gray-700"
            }`}
          >
            <div className="mb-2">{opt.icon}</div>
            <span className="text-sm text-center">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
