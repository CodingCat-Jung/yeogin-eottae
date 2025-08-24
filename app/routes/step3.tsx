import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageCircleHeart,
  Milestone,
  UtensilsCrossed,
  Palette,
  CircleEllipsis,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type StyleItem = { id: string; label: string; Icon: any };

export default function Step3() {
  const navigate = useNavigate();

  const baseStyles: StyleItem[] = useMemo(
    () => [
      { id: "감성 여행", label: "감성 여행", Icon: MessageCircleHeart },
      { id: "액티비티 여행", label: "액티비티 여행", Icon: Milestone },
      { id: "먹방 여행", label: "먹방 여행", Icon: UtensilsCrossed },
      { id: "문화 체험", label: "문화 체험", Icon: Palette },
    ],
    []
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");

  // ✅ 이전 선택 복원
  useEffect(() => {
    const saved = localStorage.getItem("actType");
    if (saved) {
      const init = saved.split(",").map(s => s.trim()).filter(Boolean);
      setSelected(Array.from(new Set(init)));
    }
  }, []);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const canSubmit =
    selected.length > 0 || (showCustom && customInput.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extra = showCustom ? customInput.trim() : "";
    const merged = [...selected, extra].map(s => s.trim()).filter(Boolean);
    const unique = Array.from(new Set(merged));
    if (unique.length === 0) return;

    const value = unique.join(",");
    localStorage.setItem("actType", value);
    navigate(`/step4?act=${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FEF9F3] to-white flex items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="bg-white/95 backdrop-blur-sm shadow-xl rounded-3xl p-8 md:p-10 w-full max-w-5xl space-y-8 border border-white"
      >
        {/* 헤더 */}
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            여행 스타일을 골라주세요.
          </h1>
          <p className="text-base text-gray-700">
            ✨ 어떤 여행을 기대하고 계신가요?
            <br />
            <span className="text-[#6C3DF4] font-semibold">당신의 취향</span>
            에 맞는 여행 스타일을 선택해 주세요.
          </p>
        </div>

        {/* 선택 카드 */}
        <div
          role="group"
          aria-label="여행 스타일 선택"
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5"
        >
          {baseStyles.map(({ id, label, Icon }) => {
            const active = selected.includes(id);
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                whileTap={{ scale: 0.98 }}
                role="checkbox"
                aria-checked={active}
                className={[
                  "group rounded-2xl p-4 text-center cursor-pointer transition-all duration-200 border-2 focus:outline-none",
                  "focus:ring-2 focus:ring-[#6C3DF4]/50",
                  active
                    ? "bg-gradient-to-r from-purple-50 to-purple-100 border-[#6C3DF4] shadow-md"
                    : "bg-white border-gray-200 hover:border-[#6C3DF4]/50 hover:shadow-sm",
                ].join(" ")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(id);
                  }
                }}
              >
                <div className="flex flex-col items-center gap-2">
                  <Icon
                    size={28}
                    className={
                      active
                        ? "text-[#6C3DF4]"
                        : "text-[#A99BEF] group-hover:text-[#6C3DF4]"
                    }
                  />
                  <p
                    className={[
                      "font-semibold",
                      active ? "text-[#3F30C4]" : "text-gray-900",
                    ].join(" ")}
                  >
                    {label}
                  </p>
                </div>
              </motion.button>
            );
          })}

          {/* 기타 */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCustom(true)}
            className="rounded-2xl p-4 text-center cursor-pointer transition-all duration-200 border-2 bg-white hover:border-[#6C3DF4]/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/50"
          >
            <div className="flex flex-col items-center gap-2 text-gray-800">
              <CircleEllipsis size={28} className="text-[#6C3DF4]" />
              <p className="font-semibold">기타</p>
            </div>
          </motion.button>
        </div>

        {/* 기타 입력 */}
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-1"
          >
            <div className="p-4 bg-[#F6F0FF] rounded-xl border border-[#E3D8FF]">
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-gray-800 flex items-center gap-2">
                  <CircleEllipsis size={18} className="text-[#6C3DF4]" />
                  기타 스타일 입력
                </label>
                <button
                  type="button"
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    setShowCustom(false);
                    setCustomInput("");
                  }}
                >
                  취소
                </button>
              </div>
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="예: 힐링, 유적 탐방, 감각적인 카페 투어"
                className="w-full p-3 rounded-lg border border-[#D9D6E3] focus:outline-none focus:ring-2 focus:ring-[#6C3DF4]/40 placeholder:text-sm placeholder:text-gray-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                쉼표 없이 한 가지 스타일만 입력해 주세요. (중복은 자동 제거돼요)
              </p>
            </div>
          </motion.div>
        )}

        {/* 하단 네비 */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/step2")}
            className="flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            뒤로가기
          </Button>

          <Button
            type="submit"
            disabled={!canSubmit}
            className={[
              "flex items-center gap-2 px-5 py-2 rounded-full transition-all",
              canSubmit
                ? "bg-gradient-to-r from-[#6C3DF4] to-[#A66CFF] text-white shadow-md hover:shadow-lg hover:brightness-105"
                : "bg-gradient-to-r from-purple-100 to-purple-50 text-[#8F78F6] border border-[#E5DCFF] cursor-not-allowed",
            ].join(" ")}
          >
            다음으로
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}
