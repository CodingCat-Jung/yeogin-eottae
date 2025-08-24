// app/routes/step-time.tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sunrise, Sun, Sunset, Moon, ArrowLeft, ArrowRight } from "lucide-react";

const SLOT = [
  { id: "dawn", label: "새벽", icon: <Moon size={28} /> },
  { id: "morning", label: "오전", icon: <Sunrise size={28} /> },
  { id: "afternoon", label: "오후", icon: <Sun size={28} /> },
  { id: "evening", label: "저녁", icon: <Sunset size={28} /> },
];

export default function StepTime() {
  const nav = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const cont = params.get("cont");
  const env = params.get("env");
  const pace = params.get("pace");

  const [depart, setDepart] = useState(localStorage.getItem("departSlot") || "");
  const [ret, setRet] = useState(localStorage.getItem("returnSlot") || "");

  const goNext = () => {
    localStorage.setItem("departSlot", depart);
    localStorage.setItem("returnSlot", ret);
    nav(`/result?cont=${cont}&env=${env}&pace=${pace}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF4FD] to-[#FEF7EC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl p-8 space-y-8">
        <header className="text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#3F30C4]">
            출·귀국 <span className="text-violet-600">시간대</span>를 골라주세요
          </h1>
          <p className="text-gray-600 mt-2">
            정확한 항공편이 없어도 괜찮아요. 선호 시간대에 맞춰 첫날/마지막날 일정을 조절해 드릴게요.
          </p>
        </header>

        <section>
          <p className="text-lg font-semibold mb-3 text-[#3F30C4]">출국 시간대</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SLOT.map(s => (
              <button
                key={s.id}
                onClick={() => setDepart(s.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition ${
                  depart === s.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 hover:border-violet-300"
                }`}
              >
                {s.icon}
                <span className="font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-lg font-semibold mb-3 text-[#3F30C4]">귀국 시간대</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SLOT.map(s => (
              <button
                key={s.id}
                onClick={() => setRet(s.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition ${
                  ret === s.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 hover:border-violet-300"
                }`}
              >
                {s.icon}
                <span className="font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-between pt-2">
          <button onClick={() => nav(-1)} className="flex items-center gap-2 text-[#6C3DF4]">
            <ArrowLeft size={16} /> 뒤로가기
          </button>
          <button
            onClick={goNext}
            disabled={!depart || !ret}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-white transition ${
              !depart || !ret ? "bg-gray-300 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-indigo-500 hover:opacity-90"
            }`}
          >
            추천 받기 <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
