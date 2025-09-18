// app/main.tsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/app.css";
import { useAuthStore } from "@/store/authStore";

function Bootstrap() {
  const initialize = useAuthStore((s) => s.initialize);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initialize();     // ✅ initialize는 여기서만
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [initialize]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff8f1]">
        <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

// ✅ 개발(DEV)에서는 StrictMode를 끈다 (effect 2회 실행 방지)
const AppTree = import.meta.env.PROD ? (
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
) : (
  <Bootstrap />
);

root.render(AppTree);
