import Link from "next/link";
import { AiChatWorkspace } from "@/components/dashboard/ai-chat-workspace";
import { SectionCard } from "@/components/dashboard/section-card";
import { getAiConsolePageData } from "@/lib/server-data";

function resolveFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AiChatPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const { chatThreads, chatMessages, chatSuggestions, agents } = await getAiConsolePageData();
  const initialDraft = resolveFirst(params?.draft) || resolveFirst(params?.target)
    ? {
        title: resolveFirst(params?.title) || "",
        body: resolveFirst(params?.draft) || "",
        target: resolveFirst(params?.target) || "both",
        source: resolveFirst(params?.source) || "",
      }
    : null;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Chat</p>
        <h1>Claude와 Codex에게 바로 메시지</h1>
        <p>
          스레드 하나를 골라 에이전트에게 바로 말합니다. 타겟을 Claude, Codex, 둘 다, 혹은 Engine으로 전환하면
          같은 컴포저가 목적지만 바꿉니다.
        </p>
      </section>

      <AiChatWorkspace
        initialThreads={chatThreads}
        initialMessages={chatMessages}
        initialSuggestions={chatSuggestions}
        initialAgents={agents}
        initialDraft={initialDraft}
      />

      <SectionCard
        kicker="Bridge"
        title="대화에서 오더로"
        description="챗이 한 번의 요청을 넘어 실행 단위가 되려면, 메시지가 곧바로 오더나 카운슬로 넘어갈 수 있어야 합니다."
      >
        <div className="template-grid">
          <div className="template-row">
            <div>
              <strong>선택한 메시지를 오더로 전환</strong>
              <p>챗 메시지 하단의 → Orders 버튼을 누르면 해당 요청이 오더 큐에 복제됩니다.</p>
            </div>
            <Link className="legend-chip" data-tone="blue" href="/dashboard/ai/orders">
              Orders
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>Claude ↔ Codex 협의가 필요해지면</strong>
              <p>하나의 스레드가 갈라질 때 바로 카운슬 세션으로 복제 — 쌍방 턴이 남습니다.</p>
            </div>
            <Link className="legend-chip" data-tone="muted" href="/dashboard/ai/council">
              Council
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>OS 상태 확인</strong>
              <p>/status 명령은 자동화·작업·콘텐츠 스냅샷을 이 대화로 끌어옵니다.</p>
            </div>
            <Link className="legend-chip" data-tone="green" href="/dashboard/ai">
              Overview
            </Link>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
