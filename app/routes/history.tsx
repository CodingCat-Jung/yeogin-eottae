import { useEffect } from "react";
import HistoryList from "@/components/HistoryList";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function HistoryPage() {
  useEffect(() => {
    document.title = "최근 설문 내역 - 여긴어때";
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8">


        <ErrorBoundary>
          <HistoryList />
        </ErrorBoundary>
      </div>
    </div>
  );
}
