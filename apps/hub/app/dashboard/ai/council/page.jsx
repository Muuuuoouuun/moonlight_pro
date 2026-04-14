import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAiConsolePageData } from "@/lib/server-data";

function getStanceTone(stance) {
  if (stance === "결정") return "green";
  if (stance === "반대" || stance === "보류") return "danger";
  if (stance === "보완" || stance === "검토") return "warning";
  return "blue";
}

function getAuthorTone(author) {
  if (author === "Claude") return "blue";
  if (author === "Codex") return "green";
  return "muted";
}

export default async function AiCouncilPage() {
  const { councilSessions, quickOrderTemplates } = await getAiConsolePageData();

  const activeCount = councilSessions.filter((session) => session.status !== "완료").length;
  const totalTurns = councilSessions.reduce((total, session) => total + session.turns.length, 0);
  const resolvedCount = councilSessions.filter((session) => session.status === "완료").length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Agent · Council</p>
        <h1>한 에이전트의 답으로 끝내지 않고, 둘을 붙여 결정하는 자리</h1>
        <p>
          Council은 단순 채팅이 아니라 합의 장치입니다. 전략과 구현을 부딪혀서, 무엇을 할지 하나의 결정으로
          좁히는 데 씁니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="Council summary">
        <SummaryCard
          title="진행 중 주제"
          value={String(activeCount)}
          detail="아직 결론으로 수렴되지 않은 카운슬 세션 수."
          badge="Active"
          tone="warning"
        />
        <SummaryCard
          title="누적 턴"
          value={String(totalTurns)}
          detail="모든 세션에서 오간 제안, 보완, 결정 메시지 수."
          badge="Turns"
          tone="blue"
        />
        <SummaryCard
          title="완료된 결정"
          value={String(resolvedCount)}
          detail="이미 결론이 난 주제 수. 이후 오더로 넘기기 좋습니다."
          badge="Resolved"
          tone="green"
        />
        <SummaryCard
          title="브리지 템플릿"
          value={String(quickOrderTemplates.length)}
          detail="카운슬을 바로 오더로 넘기기 위한 빠른 템플릿 수."
          badge="Bridge"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="When to use"
          title="카운슬을 여는 게 맞는 순간"
          description="정답을 받는 게 아니라, 둘의 충돌을 통해 더 좋은 결정을 얻고 싶을 때 엽니다."
        >
          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>전략과 구현이 다 엮여 있을 때</strong>
                <p>기능 범위, 사용자 경험, 구현 복잡도가 동시에 걸린 주제.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                Scope
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>리스크를 미리 부딪혀 보고 싶을 때</strong>
                <p>한 모델은 제안하고, 다른 모델은 반례와 비용을 잡아냅니다.</p>
              </div>
              <span className="legend-chip" data-tone="warning">
                Risk
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>결정 후 바로 오더로 보내고 싶을 때</strong>
                <p>합의가 나면 바로 실행 큐로 복제해 흐름을 끊지 않습니다.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                Action
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          kicker="New Council"
          title="카운슬 시작하기"
          description="주제와 참가자만 고르면 양쪽 에이전트가 교대로 턴을 씁니다."
        >
          <form className="ai-council-form" aria-label="Start a new council">
            <div className="ai-council-form-row">
              <label htmlFor="council-topic" className="section-kicker">
                주제
              </label>
              <input
                id="council-topic"
                name="topic"
                type="text"
                placeholder="예: Agent Orders 화면에서 quick dispatch 우선순위"
                disabled
              />
            </div>
            <div className="ai-council-form-row">
              <span className="section-kicker">참여</span>
              <div className="inline-legend">
                <label className="legend-chip" data-tone="blue">
                  <input type="checkbox" defaultChecked disabled /> Claude
                </label>
                <label className="legend-chip" data-tone="green">
                  <input type="checkbox" defaultChecked disabled /> Codex
                </label>
                <label className="legend-chip" data-tone="muted">
                  <input type="checkbox" disabled /> Engine
                </label>
              </div>
            </div>
            <div className="ai-council-form-row">
              <label htmlFor="council-context" className="section-kicker">
                컨텍스트
              </label>
              <textarea
                id="council-context"
                name="context"
                rows={3}
                placeholder="어떤 결정을 내리고 싶은지, 무엇이 아직 불확실한지 한 문단으로."
                disabled
              />
            </div>
            <div className="ai-chat-composer-actions">
              <p className="muted tiny">
                연결되면 `/api/ai/council` 로 POST 되고 첫 턴은 Claude가 엽니다.
              </p>
              <div className="hero-actions">
                <button type="button" className="button button-secondary" disabled>
                  초안 저장
                </button>
                <button type="button" className="button button-primary" disabled>
                  카운슬 열기
                </button>
              </div>
            </div>
          </form>
        </SectionCard>
      </div>

      <div className="ai-council-sessions">
        {councilSessions.map((session) => (
          <SectionCard
            key={session.id}
            kicker={session.status}
            title={session.topic}
            description={`${session.members.join(" ↔ ")} · ${session.turns.length}개의 턴`}
            action={
              <div className="hero-actions">
                <Link className="button button-ghost" href="/dashboard/ai/chat">
                  스레드로 복제
                </Link>
                <Link className="button button-secondary" href="/dashboard/ai/orders">
                  오더로 전환
                </Link>
              </div>
            }
          >
            <div className="ai-council-turns">
              {session.turns.map((turn, index) => (
                <article
                  className="ai-council-turn"
                  data-author={turn.author.toLowerCase()}
                  key={`${session.id}-${index}`}
                >
                  <header>
                    <span className="legend-chip" data-tone={getAuthorTone(turn.author)}>
                      {turn.author}
                    </span>
                    <span className="legend-chip" data-tone={getStanceTone(turn.stance)}>
                      {turn.stance}
                    </span>
                    <span className="muted tiny">{turn.time}</span>
                  </header>
                  <p>{turn.body}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
