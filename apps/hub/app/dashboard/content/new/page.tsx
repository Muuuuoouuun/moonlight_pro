"use client"
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { toast } from "@com-moon/ui"

// ─── Types ────────────────────────────────────────────────────────────────────
type CardNewsData = { title: string; subtitle: string; body: string }
type SaveState = "idle" | "saving" | "saved" | "error"

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({
  saveState,
  onSave,
  onPublish,
}: {
  saveState: SaveState
  onSave: () => void
  onPublish: () => void
}) {
  return (
    <div className="flex items-center justify-between px-6 h-14 bg-white border-b border-[rgba(0,0,0,0.07)] shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-[#0F0F0F] tracking-tight">새 콘텐츠</h1>
        <span className="text-[9px] font-semibold text-[#9BA8B5] bg-[#F8F8F9] border border-[rgba(0,0,0,0.07)] px-2 py-0.5 rounded-md uppercase tracking-wider">
          Moon v3
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={[
            "text-xs transition-all duration-300 tabular-nums",
            saveState === "saving" ? "text-[#9BA8B5]" :
            saveState === "saved"  ? "text-[#16A34A]" :
            saveState === "error"  ? "text-[#DC2626]" :
            "text-transparent select-none",
          ].join(" ")}
        >
          {saveState === "saving" ? "저장 중..." :
           saveState === "saved"  ? "초안 저장됨 ✓" :
           saveState === "error"  ? "저장 실패" : "·"}
        </span>
        <button
          onClick={onSave}
          disabled={saveState === "saving"}
          className="px-3.5 py-2 text-xs font-medium text-[#0F0F0F] bg-white border border-[rgba(0,0,0,0.12)] rounded-xl hover:bg-[#F8F8F9] active:scale-[0.96] disabled:opacity-40 transition-all duration-100 shadow-sm"
        >
          초안 저장
        </button>
        <button
          onClick={onPublish}
          disabled={saveState === "saving"}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F0F0F] rounded-xl hover:bg-[#1A1A1A] active:scale-[0.96] disabled:opacity-40 transition-all duration-100 shadow-sm"
        >
          발행
        </button>
      </div>
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

function Field({
  label,
  hint,
  max,
  len,
  children,
}: {
  label: string
  hint?: string
  max?: number
  len?: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
          {label}
        </label>
        {max !== undefined && len !== undefined && (
          <span className={["text-[10px] tabular-nums", len > max * 0.9 ? "text-[#DC2626]" : "text-[#C4C9CF]"].join(" ")}>
            {len}/{max}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[10px] text-[#C4C9CF]">{hint}</p>}
    </div>
  )
}

// ─── Editor Panel ─────────────────────────────────────────────────────────────
function EditorPanel({ data, onChange }: { data: CardNewsData; onChange: (d: CardNewsData) => void }) {
  return (
    <div className="flex flex-col h-full bg-white border border-[rgba(0,0,0,0.07)] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[rgba(0,0,0,0.06)]">
        <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em]">콘텐츠 편집</p>
      </div>
      <div className="flex-1 flex flex-col gap-5 p-5 overflow-y-auto">
        <Field label="제목" max={30} len={data.title.length}>
          <input
            className={inputCls + " font-medium"}
            value={data.title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="핵심 내용을 담은 짧은 제목"
            maxLength={30}
          />
        </Field>
        <Field label="부제목" max={40} len={data.subtitle.length}>
          <input
            className={inputCls}
            value={data.subtitle}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="출처 · 날짜 · 카테고리"
            maxLength={40}
          />
        </Field>
        <Field label="본문" hint="줄 앞에 - 를 붙이면 항목으로 표시됩니다" max={300} len={data.body.length}>
          <textarea
            className={inputCls + " min-h-[180px] font-mono resize-none leading-relaxed"}
            value={data.body}
            onChange={(e) => onChange({ ...data, body: e.target.value })}
            placeholder={"- 첫 번째 항목\n- 두 번째 항목\n- 세 번째 항목"}
            maxLength={300}
          />
        </Field>
        <div className="mt-auto pt-4 border-t border-[rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-[#0F0F0F]" />
            <p className="text-[11px] text-[#9BA8B5]">Moon 템플릿 v3 · 1080×1080px</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Preview Panel ────────────────────────────────────────────────────────────
function PreviewPanel({ data }: { data: CardNewsData }) {
  const bodyHtml = data.body
    .split("\n")
    .map((line) =>
      line.startsWith("- ")
        ? `<span class="flex gap-2 mb-1"><span class="text-[#9BA8B5] shrink-0">·</span><span>${line.slice(2)}</span></span>`
        : line ? `<span class="block mb-1">${line}</span>` : ""
    )
    .join("")

  return (
    <div className="flex flex-col h-full bg-white border border-[rgba(0,0,0,0.07)] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
        <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em]">미리보기</p>
        <span className="text-[10px] text-[#C4C9CF] bg-[#F8F8F9] border border-[rgba(0,0,0,0.07)] px-2 py-0.5 rounded-md">
          1080 × 1080
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-[#F8F8F9] overflow-auto">
        <div className="w-full max-w-[300px] aspect-square bg-white rounded-2xl shadow-md border border-[rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
          <div className="h-[3px] bg-[#0F0F0F] shrink-0" />
          <div className="flex-1 flex flex-col p-7 min-h-0">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-5 h-5 rounded-md bg-[#0F0F0F] flex items-center justify-center shrink-0">
                <span className="text-white text-[7px] font-bold leading-none select-none">CM</span>
              </div>
              <span className="text-[9px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em]">Com_Moon</span>
            </div>
            <div className="mb-auto">
              <h2 className="text-lg font-bold text-[#0F0F0F] leading-tight break-keep mb-1.5">
                {data.title || <span className="text-[#D1D5DB]">제목을 입력하세요</span>}
              </h2>
              <p className="text-[11px] text-[#9BA8B5]">
                {data.subtitle || <span className="text-[#E5E7EB]">부제목</span>}
              </p>
            </div>
            <div className="w-6 h-px bg-[rgba(0,0,0,0.1)] my-4 shrink-0" />
            {data.body && (
              <div
                className="text-[11px] text-[#4B5563] leading-relaxed flex-1 min-h-0 overflow-hidden"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
            <div className="mt-4 pt-3 border-t border-[rgba(0,0,0,0.07)] flex items-center justify-between shrink-0">
              <span className="text-[9px] text-[#C4C9CF] uppercase tracking-widest">
                {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}
              </span>
              <div className="w-8 h-px bg-[rgba(0,0,0,0.08)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContentNewPage() {
  const router = useRouter()
  const [data, setData] = useState<CardNewsData>({ title: "", subtitle: "", body: "" })
  const [saveState, setSaveState] = useState<SaveState>("idle")

  const save = useCallback(async (status: "draft" | "published") => {
    if (!data.title.trim()) { toast.warning("제목을 입력하세요"); return }
    setSaveState("saving")
    const { error } = await supabase.from("content_items").insert({
      title: data.title,
      subtitle: data.subtitle,
      body: data.body,
      status,
      template_id: "v3",
      created_at: new Date().toISOString(),
    })
    if (error) {
      setSaveState("error")
      toast.error("저장 실패 — 다시 시도해주세요")
      setTimeout(() => setSaveState("idle"), 2500)
      return
    }
    setSaveState("saved")
    if (status === "published") {
      toast.success("발행됐습니다")
      setTimeout(() => router.push("/dashboard/content"), 800)
    } else {
      toast.success("초안 저장됐습니다")
      setTimeout(() => setSaveState("idle"), 2200)
    }
  }, [data, router])

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#F8F8F9] overflow-hidden">
      <Toolbar
        saveState={saveState}
        onSave={() => save("draft")}
        onPublish={() => save("published")}
      />
      <div className="flex-1 p-5 md:p-6 overflow-hidden min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
          <EditorPanel data={data} onChange={setData} />
          <PreviewPanel data={data} />
        </div>
      </div>
    </div>
  )
}
