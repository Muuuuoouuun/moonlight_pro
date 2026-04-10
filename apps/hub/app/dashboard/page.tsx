"use client";
import { useEffect, useState } from "react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { supabase } from "../../lib/supabase";

export default function DashboardPage() {
  const [stats, setStats] = useState({ ops: 0, leads: 0, content: 0 });

  useEffect(() => {
    async function fetchStats() {
      const { count: ops } = await supabase.from("operation_cases").select("*", { count: "exact", head: true });
      const { count: leads } = await supabase.from("leads").select("*", { count: "exact", head: true });
      const { count: content } = await supabase.from("content_items").select("*", { count: "exact", head: true });
      
      setStats({
        ops: ops ?? 0,
        leads: leads ?? 0,
        content: content ?? 0
      });
    }
    fetchStats();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Com_Moon OS 상태 대시보드</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard title="현재 운영 건" value={stats.ops.toString()} status="진행중" />
        <SummaryCard title="신규 리드" value={stats.leads.toString()} status="오늘" />
        <SummaryCard title="카드뉴스 발행" value={stats.content.toString()} status="이번주" />
      </div>
    </div>
  );
}
