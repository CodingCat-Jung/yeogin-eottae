// app/layouts/AppLayout.tsx (또는 현재 파일 경로)
import { Outlet } from "react-router-dom";
import NavBar, { NavSpacer } from "@/components/Navbar"; // 파일명이 Navbar라면 경로/이름 맞춰주세요

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f6f0] to-[#e9e4d5]">
      <NavBar />
      {/* 고정 네비 높이만큼 자동 여백 */}
      <NavSpacer />
      <main className="px-4">
        <Outlet />
      </main>
    </div>
  );
}
