"use client"

import React, { useState, useCallback } from "react"
import { DataTable, type Column, StatusBadge, SlidePanel, toast } from "@com-moon/ui"

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType = "webhook" | "schedule" | "event"
type WorkflowStatus = "active" | "inactive"

interface Workflow {
  id: string
  name: string
  trigger: TriggerType
  status: WorkflowStatus
  lastRun: string
  runCount: number
  description: string
}

interface RunLog {
  id: string
  workflow: string
  status: "success" | "failure"
  duration: string
  ran_at: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_WORKFLOWS: Workflow[] = [
  { id: "1", name: "신규 리드 알림", trigger: "webhook", status: "active", lastRun: "2분 전", runCount: 142, description: "Telegram으로 신규 리드 알림 전송" },
  { id: "2", name: "콘텐츠 발행 알림", trigger: "schedule", status: "active", lastRun: "1시간 전", runCount: 38, description: "발행된 콘텐츠를 SNS 채널에 공유" },
  { id: "3", name: "일일 요약 리포트", trigger: "schedule", status: "inactive", lastRun: "어제", runCount: 21, description: "매일 오전 9시 KPI 요약 전송" },
  { id: "4", name: "운영 건 마감 알림", trigger: "event", status: "inactive", lastRun: "3일 전", runCount: 7, description: "운영 건이 closed 상태가 되면 알림" },
]

const INITIAL_RUN_LOGS: RunLog[] = [
  { id: "r1", workflow: "신규 리드 알림",    status: "success", duration: "0.3s", ran_at: "2026-04-13 14:32" },
  { id: "r2", workflow: "콘텐츠 발행 알림",  status: "success", duration: "1.2s", ran_at: "2026-04-13 13:11" },
  { id: "r3", workflow: "신규 리드 알림",    status: "failure", duration: "0.1s", ran_at: "2026-04-13 12:45" },
  { id: "r4", workflow: "일일 요약 리포트",  status: "success", duration: "2.1s", ran_at: "2026-04-13 09:00" },
  { id: "r5", workflow: "신규 리드 알림",    status: "success", duration: "0.4s", ran_at: "2026-04-12 18:23" },
  { id: "r6", workflow: "운영 건 마감 알림", status: "success", duration: "0.2s", ran_at: "2026-04-12 15:10" },
  { id: "r7", workflow: "콘텐츠 발행 알림",  status: "failure", duration: "0.8s", ran_at: "2026-04-12 11:00" },
  { id: "r8", workflow: "일일 요약 리포트",  status: "success", duration: "1.9s", ran_at: "2026-04-12 09:00" },
]

// ─── Icons ────────────────────────────────────────────────────────────────────

function WebhookIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" fill="currentColor" opacity=".3"/>
      <path d="M8 5a1 1 0 0 1 1 1v2.586l1.707 1.707a1 1 0 0 1-1.414 1.414l-2-2A1 1 0 0 1 7 9V6a1 1 0 0 1 1-1z" fill="currentColor"/>
    </svg>
  )
}

function ScheduleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" fill="currentColor" opacity=".3"/>
      <path d="M7.5 3.5a.5.5 0 0 1 .5.5V8l2.5 2.5a.5.5 0 0 1-.707.707l-2.646-2.646A.5.5 0 0 1 7 8.207V4a.5.5 0 0 1 .5-.5z" fill="currentColor"/>
    </svg>
  )
}

function EventIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11 2.5L5 10.5h5.5L9 17.5l6-9H9.5L11 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TRIGGER_CONFIG: Record<TriggerType, { label: string; variant: string; icon: React.ReactNode }> = {
  webhook: { label: "Webhook",  variant: "info",    icon: <WebhookIcon /> },
  schedule: { label: "Schedule", variant: "warning", icon: <ScheduleIcon /> },
  event:   { label: "Event",    variant: "default",  icon: <EventIcon /> },
}

function TriggerBadge({ type }: { type: TriggerType }) {
  const cfg = TRIGGER_CONFIG[type]
  return (
    <StatusBadge status={type} variant={cfg.variant as any} label={cfg.label} />
  )
}

function ActivePing() {
  return (
    <span className="relative flex h-2 w-2 ml-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  )
}

function WorkflowCard({
  workflow,
  onToggle,
  onRun,
}: {
  workflow: Workflow
  onToggle: (id: string) => void
  onRun: (workflow: Workflow) => void
}) {
  const isActive = workflow.status === "active"

  return (
    <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm p-5 flex flex-col gap-3 hover:border-[rgba(0,0,0,0.12)] transition-all duration-150">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-sm text-[#0F0F0F] truncate leading-snug">{workflow.name}</span>
          {isActive && <ActivePing />}
        </div>
        <div className="shrink-0">
          <TriggerBadge type={workflow.trigger} />
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[#9BA8B5] leading-relaxed">{workflow.description}</p>

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#C4C9CF]">{workflow.lastRun}</span>
          <span className="text-xs text-[#9BA8B5]">{workflow.runCount}회 실행</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle button */}
          <button
            onClick={() => onToggle(workflow.id)}
            className={[
              "text-xs px-2.5 py-1 rounded-lg font-medium transition-all duration-150",
              isActive
                ? "bg-[#F0FDF4] text-[#16A34A] hover:bg-green-100"
                : "bg-[#F8F8F9] text-[#9BA8B5] hover:bg-[#F0F0F2]",
            ].join(" ")}
          >
            {isActive ? "활성" : "비활성"}
          </button>
          {/* Run button */}
          <button
            onClick={() => onRun(workflow)}
            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-[#0F0F0F] text-white hover:bg-[#1a1a1a] transition-all duration-150 flex items-center gap-1"
          >
            <span>▶</span>
            <span>실행</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

function AddWorkflowForm({
  onAdd,
  onClose,
}: {
  onAdd: (w: Workflow) => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [trigger, setTrigger] = useState<TriggerType>("webhook")
  const [webhookUrl, setWebhookUrl] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const newWorkflow: Workflow = {
      id: String(Date.now()),
      name: name.trim(),
      trigger,
      status: "inactive",
      lastRun: "미실행",
      runCount: 0,
      description: description.trim() || "-",
    }
    onAdd(newWorkflow)
    toast.success("워크플로가 등록됐습니다")
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-1">
      {/* 이름 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#0F0F0F]">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="워크플로 이름 입력"
          required
          className={INPUT_CLASS}
        />
      </div>

      {/* 설명 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#0F0F0F]">설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="워크플로에 대한 간략한 설명"
          rows={3}
          className={INPUT_CLASS + " resize-none"}
        />
      </div>

      {/* 트리거 타입 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#0F0F0F]">트리거 타입</label>
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as TriggerType)}
          className={INPUT_CLASS}
        >
          <option value="webhook">Webhook</option>
          <option value="schedule">Schedule</option>
          <option value="event">Event</option>
        </select>
      </div>

      {/* n8n Webhook URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#0F0F0F]">n8n Webhook URL</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://n8n.your-domain.com/webhook/..."
          className={INPUT_CLASS}
        />
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#9BA8B5] bg-[#F8F8F9] hover:bg-[#F0F0F2] transition-all duration-150"
        >
          취소
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-[#0F0F0F] hover:bg-[#1a1a1a] transition-all duration-150"
        >
          등록하기
        </button>
      </div>
    </form>
  )
}

// ─── DataTable columns ────────────────────────────────────────────────────────

const RUN_LOG_COLUMNS: Column<RunLog>[] = [
  {
    key: "workflow",
    header: "워크플로",
    render: (row) => (
      <span className="font-semibold text-[#0F0F0F] text-sm">{row.workflow}</span>
    ),
  },
  {
    key: "status",
    header: "상태",
    render: (row) => (
      <StatusBadge
        status={row.status}
        dot
        label={row.status === "success" ? "성공" : "실패"}
        variant={row.status === "success" ? "success" : "danger"}
      />
    ),
  },
  {
    key: "duration",
    header: "소요",
    render: (row) => (
      <span className="font-mono text-sm text-[#9BA8B5]">{row.duration}</span>
    ),
  },
  {
    key: "ran_at",
    header: "실행 시각",
    render: (row) => (
      <span className="text-xs text-[#C4C9CF] tabular-nums text-right block">{row.ran_at}</span>
    ),
  },
]

// ─── Page Component ───────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS)
  const [panelOpen, setPanelOpen] = useState(false)

  const handleToggle = useCallback((id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w
        const next = w.status === "active" ? "inactive" : "active"
        toast.info(`${w.name} ${next === "active" ? "활성화" : "비활성화"}됐습니다`)
        return { ...w, status: next }
      })
    )
  }, [])

  const handleRun = useCallback((workflow: Workflow) => {
    toast.success(`${workflow.name} 실행됐습니다`)
  }, [])

  const handleAdd = useCallback((w: Workflow) => {
    setWorkflows((prev) => [w, ...prev])
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight leading-tight">
            자동화
          </h1>
          <p className="text-sm text-[#9BA8B5] mt-1">
            n8n 워크플로 · 실행 로그 · 트리거 관리
          </p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#0F0F0F] hover:bg-[#1a1a1a] transition-all duration-150 shrink-0"
        >
          <PlusIcon />
          워크플로 추가
        </button>
      </div>

      {/* Section 1 — Workflow Cards */}
      <section className="mb-10">
        <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4">
          워크플로
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onToggle={handleToggle}
              onRun={handleRun}
            />
          ))}
        </div>
      </section>

      {/* Section 2 — Run History */}
      <section className="mb-10">
        <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4">
          실행 로그
        </p>
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] overflow-hidden shadow-sm">
          <DataTable<RunLog>
            columns={RUN_LOG_COLUMNS}
            rows={INITIAL_RUN_LOGS}
            keyField="id"
            searchable
            searchPlaceholder="워크플로 검색..."
            pageSize={5}
            loading={false}
            empty="실행 로그가 없습니다"
          />
        </div>
      </section>

      {/* Section 3 — Add Workflow SlidePanel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="워크플로 추가"
        description="n8n 워크플로를 등록하고 트리거를 설정하세요"
      >
        <AddWorkflowForm
          onAdd={handleAdd}
          onClose={() => setPanelOpen(false)}
        />
      </SlidePanel>
    </div>
  )
}
