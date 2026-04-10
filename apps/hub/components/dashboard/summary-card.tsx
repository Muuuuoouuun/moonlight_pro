export function SummaryCard({ title, value, status }: { title: string, value: string, status?: string }) {
  return (
    <div className="p-6 bg-white rounded-xl border border-[#E2E1DD] shadow-sm">
      <h3 className="text-sm text-[#5F635D]">{title}</h3>
      <p className="text-2xl font-bold mt-2">{value}</p>
      {status && <span className="text-xs text-[#4A7A59]">{status}</span>}
    </div>
  )
}
