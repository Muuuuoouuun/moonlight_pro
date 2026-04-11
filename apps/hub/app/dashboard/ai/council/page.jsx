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
  const { councilSessions } = await getAiConsolePageData();

  const activeCount = councilSessions.filter((session) => session.status !== "완료").length;
  const totalTurns = councilSessions.reduce((total, session) => total + session.turns.length, 0);

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Council</p>
        <h1>에이전트가 서로 검토하고 결정하는 자리</h1>
        <p>
          하나의 주제에 Claude와 Codex를 같이 앉히고, 제안 → 보완 → 결정까지 턴을 남기는 공간입니다. 혼자 답을
          받는 것보다 두 모델이 부딪힐 때 더 좋은 결론이 나옵니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="Council summary">
        <SummaryCard
          title="진행 중 주제"
          value={String(activeCount)}
          detail="아직 결론으로 수렴되지 않은 카운슬 세션."
          badge="Active"
          tone="warning"
        />
        <SummaryCard
          title="누적 턴"
          value={String(totalTurns)}
          detail="모든 세션에서 주고받은 메시지 수."
          badge="Turns"
          tone="blue"
        />
        <SummaryCard
          title="참여 에이전트"
          value="2"
          detail="Claude (Opus 4.6) · Codex (GPT-5). 추후 Engine 합류 예정."
          badge="Members"
          tone="muted"
        />
        <SummaryCard
          title="결정 → 오더"
          value="1"
          detail="결정으로 굳어진 카운슬은 오더로 바로 복제됩니다."
          badge="Bridge"
          tone="green"
        />
      </section>

      <SectionCard
        kicker="New Council"
        title="카운슬 시작하기"
        description="주제와 참가자만 고르면 양쪽 에이전트가 교대로 턴을 씁니다. 빈 입력은 프론트 단계에서 비활성 상태입니다."
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
              placeholder="예: AI 콘솔 오더 UX 범위"
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
              placeholder="어떤 결정을 내리고 싶은지, 어떤 제약이 있는지 한 문단으로."
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
                  챗으로 복제
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
