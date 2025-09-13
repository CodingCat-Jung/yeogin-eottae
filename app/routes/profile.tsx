// app/routes/profile.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Camera, Trash2, Save, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAuthStore } from "@/store/authStore";

const API_BASE = import.meta.env.VITE_BACKEND_ADDRESS || "http://localhost:8000";

export default function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser); // ✅ 스토어 업데이트 함수

  // 파일/미리보기 상태
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const [loadingMe, setLoadingMe] = useState(true);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // 현재 내 정보 불러와서 기존 이미지 URL 표시
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoadingMe(true);
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          method: "GET",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: token ? "omit" : "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const me = await res.json();
        if (!aborted) {
          const url = me?.profile_image_url ?? null;
          setCurrentUrl(url);
          setPreview(url);
        }
      } catch (e) {
        console.warn("Failed to load me:", e);
      } finally {
        if (!aborted) setLoadingMe(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [token]);

  // 파일 선택 → 간단 검증 + 미리보기
  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      alert("파일 용량은 5MB 이하로 업로드해주세요.");
      return;
    }
    setImageFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const onRemove = () => {
    setImageFile(null);
    setPreview(null);
  };

  const canSubmit = useMemo(() => !saving, [saving]);

  // 저장 로직
  const onSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      let newUrl: string | "" = "";

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);

        const up = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          credentials: token ? "omit" : "include",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: fd,
        });
        if (!up.ok) {
          const t = await up.text();
          throw new Error(t || "이미지 업로드 실패");
        }
        const j = await up.json();
        newUrl = j?.url || "";
      } else {
        newUrl = preview ? (currentUrl ?? "") : "";
      }

      // 프로필에 URL 저장
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "PATCH",
        credentials: token ? "omit" : "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profile_image_url: preview ? newUrl : "" }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "프로필 저장 실패");
      }

      // 최종 동기화
      const updated = await res.json().catch(() => ({}));
      const savedUrl = updated?.profile_image_url ?? (preview ? newUrl : "");

      setCurrentUrl(savedUrl || null);
      if (imageFile && preview) URL.revokeObjectURL(preview);
      setImageFile(null);
      setPreview(savedUrl || null);

      // ✅ 스토어의 user도 업데이트 → 마이페이지 등에서 즉시 반영됨
      if (user) {
        setUser({ ...user, profile_image_url: savedUrl || undefined });
      }

      alert("프로필 이미지가 저장되었습니다.");
      navigate(-1);
    } catch (e: any) {
      console.error(e);
      alert(`저장 중 오류가 발생했습니다.\n${e?.message ?? ""}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#F6F1E9] via-[#F7F2ED] to-[#EFE7DA]">
      <div className="mx-auto w-full max-w-xl px-5 py-8">
        {/* 헤더 */}
        <div className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-2xl">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="ml-1 flex items-center gap-2">
            <Sparkles className="size-5 text-[#6C3DF4]" />
            <h1 className="text-xl font-bold tracking-tight">프로필</h1>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Card className="rounded-2xl shadow-md border-0">
            <CardHeader>
              <p className="text-sm text-muted-foreground">
                닉네임은 현재 변경할 수 없어요. <br />
                대신 <span className="font-medium">프로필 이미지</span>를 업로드해보세요 ✨
              </p>
            </CardHeader>

            <CardContent className="space-y-8">
              {/* 닉네임 (읽기 전용) */}
              <div className="space-y-2">
                <Label htmlFor="nickname" className="text-[13px] text-gray-700">
                  닉네임
                </Label>
                <Input
                  id="nickname"
                  value={user?.nickname ?? ""}
                  readOnly
                  className="rounded-xl bg-white/70 cursor-not-allowed"
                />
              </div>

              {/* 프로필 이미지 업로드 */}
              <div className="space-y-3">
                <Label className="text-[13px] text-gray-700">프로필 이미지</Label>

                <div className="flex items-center gap-4">
                  <div className="size-20 overflow-hidden rounded-full border bg-white/60 shadow-sm">
                    {loadingMe ? (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                        로딩…
                      </div>
                    ) : preview ? (
                      <img
                        src={preview}
                        alt="preview"
                        className="h-full w-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                        no image
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" className="rounded-xl" onClick={onPickFile}>
                      <Camera className="mr-2 size-4" />
                      파일 선택
                    </Button>

                    {preview && (
                      <Button type="button" variant="ghost" className="rounded-xl" onClick={onRemove}>
                        <Trash2 className="mr-2 size-4" />
                        제거
                      </Button>
                    )}

                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </div>
                </div>

                <p className="text-[12px] text-gray-400">권장: 1:1 비율 · 최대 5MB · JPG/PNG/WebP</p>
              </div>

              {/* 저장 버튼 */}
              <div className="pt-2">
                <Button
                  type="button"
                  className="w-full rounded-2xl bg-gradient-to-r from-[#6C3DF4] to-[#8C5BFF]"
                  onClick={onSave}
                  disabled={!canSubmit}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      저장 중…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" />
                      프로필 저장
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
