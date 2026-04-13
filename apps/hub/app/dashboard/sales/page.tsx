// Phase 2 — Coming Soon
export default function SalesPage() {
  return <ComingSoon label="세일즈" desc="리드 · 딜 파이프라인 · 예상 매출" phase={2} />
}

function ComingSoon({ label, desc, phase }: { label: string; desc: string; phase: number }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-xs">
        <div className="w-12 h-12 rounded-2xl bg-[#F0F0F2] flex items-center justify-center mx-auto mb-5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 15L7.5 9.5l4 3.5 5.5-8" stroke="#9BA8B5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.5 5H17v3.5" stroke="#9BA8B5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
