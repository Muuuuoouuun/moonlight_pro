"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  getAiCouncilStatusLabel,
  normalizeAiCouncilMembers,
} from "@/lib/ai-console";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

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

export function AiCouncilWorkspace({ initialSessions, initialDraft = null }) {
  const [sessions, setSessions] = useState(initialSessions || []);
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [members, setMembers] = useState({
    claude: true,
    codex: true,
    engine: false,
  });
  const [pending, setPending] = useState(false);
  const [activityNote, setActivityNote] = useState(
    "이제 실제 /api/ai/council POST를 통해 세션이 생성됩니다. 저장이 안 되는 환경이면 preview 응답으로도 흐름을 확인할 수 있습니다.",
  );

  const activeCount = sessions.filter((session) => session.status !== "완료").length;
  const totalTurns = sessions.reduce((total, session) => total + session.turns.length, 0);
  const memberSet = new Set(sessions.flatMap((session) => session.members));
  const selectedMembers = [
    members.claude ? "Claude" : null,
    members.codex ? "Codex" : null,
    members.engine ? "Engine" : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    const nextMembers = {
      claude: false,
      codex: false,
      engine: false,
    };

    String(initialDraft.members || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .forEach((item) => {
        if (item === "claude" || item === "codex" || item === "engine") {
          nextMembers[item] = true;
        }
      });

    if (!nextMembers.claude && !nextMembers.codex && !nextMembers.engine) {
      nextMembers.claude = true;
      nextMembers.codex = true;
    }

    setTopic(initialDraft.topic || "");
    setContext(initialDraft.context || "");
    setMembers(nextMembers);
    setActivityNote(
      initialDraft.source
        ? `"${initialDraft.source}" 에서 넘어온 카운슬 초안을 채웠습니다. 멤버와 문맥을 바로 다듬어 열 수 있습니다.`
        : "외부에서 넘어온 카운슬 초안을 채웠습니다.",
    );
  }, [initialDraft]);

  function toggleMember(key) {
    setMembers((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleSaveDraft() {
    setActivityNote(
      topic.trim()
        ? `"${topic}" 카운슬 초안을 폼 상태로 유지했습니다. 바로 이어서 열거나 멤버만 바꿔볼 수 있습니다.`
        : "주제 없이도 멤버 조합만 먼저 잡아둘 수 있게 현재 상태를 초안으로 유지했습니다.",
    );
  }

  async function handleCreateCouncil() {
    if (!topic.trim() || !selectedMembers.length) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/ai/council", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          context,
          members: selectedMembers,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Council request failed.");
      }

      const nextSession = {
        ...data.session,
        members: normalizeAiCouncilMembers(data.session.members),
        status: data.session.status || getAiCouncilStatusLabel("active"),
      };

      setSessions((current) => [nextSession, ...current]);
      setTopic("");
      setContext("");
      setMembers({ claude: true, codex: true, engine: false });
      setActivityNote(data.message || `"${nextSession.topic}" 카운슬을 열었습니다.`);
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
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
          value={String(memberSet.size || selectedMembers.length)}
          detail="Claude · Codex · Engine 조합을 주제별로 바꿔가며 테스트할 수 있습니다."
          badge="Members"
          tone="muted"
        />
        <SummaryCard
          title="결정 → 오더"
          value={String(sessions.filter((session) => session.status === "완료").length)}
          detail="결정으로 굳어진 카운슬은 오더나 챗으로 바로 넘길 수 있습니다."
          badge="Bridge"
          tone="green"
        />
      </section>

      <SectionCard
        kicker="New Council"
        title="카운슬 시작하기"
        description="주제와 참가자만 고르면 실제 POST 응답으로 세션이 붙습니다. 저장이 불가한 환경에서도 preview로 흐름은 유지됩니다."
      >
        <form
          className="ai-council-form"
          aria-label="Start a new council"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreateCouncil();
          }}
        >
          <div className="ai-council-form-row">
            <label htmlFor="council-topic" className="section-kicker">
              주제
            </label>
            <input
              id="council-topic"
              name="topic"
              type="text"
              placeholder="예: AI 콘솔 오더 UX 범위"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="ai-council-form-row">
            <span className="section-kicker">참여</span>
            <div className="inline-legend">
              <label className="legend-chip" data-tone="blue">
                <input
                  type="checkbox"
                  checked={members.claude}
                  onChange={() => toggleMember("claude")}
                  disabled={pending}
                />{" "}
                Claude
              </label>
              <label className="legend-chip" data-tone="green">
                <input
                  type="checkbox"
                  checked={members.codex}
                  onChange={() => toggleMember("codex")}
                  disabled={pending}
                />{" "}
                Codex
              </label>
              <label className="legend-chip" data-tone="muted">
                <input
                  type="checkbox"
                  checked={members.engine}
                  onChange={() => toggleMember("engine")}
                  disabled={pending}
                />{" "}
                Engine
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
              value={context}
              onChange={(event) => setContext(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="ai-chat-composer-actions">
            <p className="muted tiny">{activityNote}</p>
            <div className="hero-actions">
              <button type="button" className="button button-secondary" onClick={handleSaveDraft} disabled={pending}>
                초안 저장
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={!topic.trim() || !selectedMembers.length || pending}
              >
                {pending ? "여는 중..." : "카운슬 열기"}
              </button>
            </div>
          </div>
        </form>
      </SectionCard>

      <div className="ai-council-sessions">
        {sessions.map((session) => (
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
    </>
  );
}
