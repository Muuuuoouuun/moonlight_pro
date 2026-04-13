// Phase 3 — Coming Soon
export default function AutomationPage() {
  return <ComingSoon label="자동화" desc="n8n 오케스트레이션 · 실행 로그 · 트리거 관리" phase={3} />
}

function ComingSoon({ label, desc, phase }: { label: string; desc: string; phase: number }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-xs">
        <div className="w-12 h-12 rounded-2xl bg-[#F0F0F2] flex items-center justify-center mx-auto mb-5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M11 2.5L5 10.5h5.5L9 17.5l6-9H9.5L11 2.5z" stroke="#9BA8B5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-[#C4C9CF] uppercase tracking-widest mb-2">
          Phase {phase} · Coming Soon
        </p>
        <h2 className="text-xl font-semibold text-[#0F0F0F] tracking-tight mb-1.5">{label}</h2>
        <p className="text-sm text-[#9BA8B5] leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}
