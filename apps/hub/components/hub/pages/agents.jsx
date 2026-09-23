"use client";

import React from "react";
import { useSearchParams } from 'next/navigation';
import { CodexJobsPanel } from "./codex-jobs";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, Kbd, EmptyState, SegmentedControl, TruthBadge, Skeleton } from "../hub-primitives";
import { requestGuruCoaching, GURU_MODE_LABEL, GURU_PREVIEW_NOTE } from "../guru-client";
import { requestCouncilAdvice, councilChatPath } from "../council-client";
import { RECOMMENDED_TRIADS } from "../council-legends";
import { requestPersonaChat, PERSONA_MODE_LABEL, LEGEND_LENS_MAP } from "../persona-client";
import { QUICK_LOG_ACTIONS as WO_EXECUTE_ACTIONS } from "@/lib/sales-os/outcome-attribution";
import { PERSONA_CONTRACT } from "@/lib/sales-os/persona-contract";

const DEFAULT_PERSONA_KEY = PERSONA_CONTRACT[0]?.id || 'order';

const PERSONA_INTROS = {
  order: '오더(Dispatch)입니다. 운영 신호(딜·콘텐츠·고객·마일스톤)를 분석해 작업지시서와 우선순위를 조립합니다. 무엇을 우선순위화할까요?',
  sales: '세일즈 페르소나입니다. 딜 파이프라인 정체를 진단하고 고객 반론 대응 및 다음 행동을 설계합니다.',
  content: '콘텐츠 페르소나입니다. 독자 가치 중심의 앵글 기획과 발행 케이던스를 관리합니다.',
  production: '제작 페르소나입니다. 승인된 앵글을 채널별 포맷(카드뉴스 슬라이드, 스레드 분할, 숏폼 구조) 골격으로 조립합니다.',
  review: '검수 페르소나입니다. 사실 근거, 브랜드 가드레일, 상투적 과장 문구를 필터링하고 게이트 판정을 내립니다.',
};

const CHAT_PERSONAS = Object.fromEntries(PERSONA_CONTRACT.map((p) => [p.id, {
  name: p.nameKo,
  role: p.role,
  title: `${p.nameKo} · ${p.nameEn}`,
  model: 'Gemini 3.5 Flash',
  intro: [
    { role: 'agent', name: p.nameKo, text: PERSONA_INTROS[p.id] || `${p.nameKo} 업무 세션입니다.` },
  ],
}]));

CHAT_PERSONAS.guru = {
    name: 'Guru',
    role: '영업 멘토 · 딜 코칭',
    title: '영업 멘토 세션',
    model: 'Gemini 3.1 Pro (Thinking)',
    intro: [
      { role: 'agent', name: 'Guru', text: '영업 멘토입니다. Revenue 기록(딜·리드·계정)을 근거로 "지금 무엇을 놓치고 있고, 다음 한 수가 무엇인지"를 코칭합니다.\n\n무엇을 볼까요?\n· 이번 주 파이프라인 분류\n· 특정 딜 진단 (어느 단계에서 막혔는지)\n· 제안서/이메일/반론 대응 다듬기' },
    ],
};

CHAT_PERSONAS.council = {
  name: 'Council',
  role: 'Writer · Strategist · Analyst 종합 합의',
  title: 'Council Session',
  model: 'Gemini 3.1 Pro (Thinking)',
};

function extractTaskTitleFromText(text) {
  if (!text) return 'AI 추천 실행 태스크';
  const expMatch = text.match(/📌\s*다음\s*주\s*단\s*1가지\s*실험:\s*([^\n\r]+)/);
  if (expMatch && expMatch[1]?.trim()) {
    return '다음 주 실험: ' + expMatch[1].trim().replace(/^\[|\]$/g, '');
  }
  const taskMatch = text.match(/📌\s*추천\s*태스크:\s*([^\n\r]+)/);
  if (taskMatch && taskMatch[1]?.trim()) {
    return taskMatch[1].trim().replace(/^\[|\]$/g, '');
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[0-9\.\-\*\s🟢🔴🟡💡🎯📋#]+/.test(line)) {
      const cleaned = line.replace(/^[0-9\.\-\*\s🟢🔴🟡💡🎯📋#]+/, '').trim();
      if (cleaned.length >= 4 && cleaned.length <= 80) return cleaned;
    }
  }
  return (lines[0] || 'AI 추천 실행 태스크').slice(0, 60);
}

export function AgentsChat({ onNavigate }) {
  const [input, setInput] = React.useState('');
  const [agentKey, setAgentKey] = React.useState(DEFAULT_PERSONA_KEY);
  const [activeMode, setActiveMode] = React.useState('advice'); // 'advice' | 'critique' | 'sparring' | 'weekly-review'
  const [activeLens, setActiveLens] = React.useState(null);
  const [thread, setThread] = React.useState([]);
  const [conversations, setConversations] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [taskSavedMap, setTaskSavedMap] = React.useState({});
  const [copiedMap, setCopiedMap] = React.useState({});
  const busyRef = React.useRef(false);
  const persona = CHAT_PERSONAS[agentKey] || CHAT_PERSONAS[DEFAULT_PERSONA_KEY];

  // Run a real coaching pass against Guru
  const runGuru = React.useCallback(async (mode, { ref = null, draft = null, label } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const userText = label || draft || GURU_MODE_LABEL[mode] || '코칭 요청';
    setBusy(true);
    setThread(prev => [
      ...prev,
      { role: 'user', text: userText },
      { role: 'agent', name: 'Guru', pending: true },
    ]);
    const r = await requestGuruCoaching({ mode, ref, draft });
    setThread(prev => {
      const next = prev.slice();
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].pending) {
          next[i] = {
            role: 'agent',
            name: 'Guru',
            text:
              r.state === 'done'
                ? r.text
                : r.state === 'preview'
                ? GURU_PREVIEW_NOTE
                : `코칭을 생성하지 못했어요: ${r.note || ''}`,
          };
          break;
        }
      }
      return next;
    });
    busyRef.current = false;
    setBusy(false);
  }, []);

  // Run a real execution or advice pass against Persona / Council
  const runPersona = React.useCallback(async (personaId, mode, userText, { lens = null, draft = null } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const agentName = CHAT_PERSONAS[personaId]?.name || personaId;
    setThread(prev => [
      ...prev,
      { role: 'user', text: userText },
      { role: 'agent', name: agentName, pending: true },
    ]);
    const r = await requestPersonaChat({
      personaId,
      mode,
      lens,
      message: userText,
      draft,
    });
    setThread(prev => {
      const next = prev.slice();
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].pending) {
          next[i] = {
            role: 'agent',
            name: agentName,
            text:
              r.state === 'done'
                ? r.text
                : r.state === 'preview'
                ? (r.note || 'Engine이 연결되지 않아 preview 상태입니다.')
                : `응답을 생성하지 못했어요: ${r.note || ''}`,
          };
          break;
        }
      }
      return next;
    });
    busyRef.current = false;
    setBusy(false);
  }, []);

  const handleSaveTask = React.useCallback(async (text, index) => {
    const title = extractTaskTitleFromText(text);
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setTaskSavedMap(prev => ({ ...prev, [index]: true }));
        setTimeout(() => {
          setTaskSavedMap(prev => ({ ...prev, [index]: false }));
        }, 3000);
      }
    } catch (e) {
      console.error('Failed to create task', e);
    }
  }, []);

  const handleCopyMessage = React.useCallback((text, index) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedMap(prev => ({ ...prev, [index]: true }));
    setTimeout(() => {
      setCopiedMap(prev => ({ ...prev, [index]: false }));
    }, 2000);
  }, []);

  const handleHandoff = React.useCallback((targetAgentKey, targetMode, handoffPrompt) => {
    setAgentKey(targetAgentKey);
    setActiveMode(targetMode);
    runPersona(targetAgentKey, targetMode, handoffPrompt);
  }, [runPersona]);

  // Persona is selected via ?agent=<key>; ?mode=&ref= auto-runs live coaching.
  // ?prompt=council runs real Council convene synthesis.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const a = q.get('agent');
    const prompt = q.get('prompt');

    if (prompt === 'council') {
      setAgentKey('council');
      setActiveMode('sparring');
      setThread([{ role: 'agent', name: 'Council', pending: true }]);
      setConversations(prev => [
        { name: 'Council Convene 회의', agent: 'Council', time: '지금', active: true },
        ...prev.map(c => ({ ...c, active: false })),
      ]);
      requestPersonaChat({
        personaId: 'council',
        mode: 'sparring',
        message: '현재 5대 페르소나 현황 및 비즈니스 기록을 종합 진단하고 전략적 합의를 도출하라.',
      }).then(r => {
        setThread([
          {
            role: 'agent',
            name: 'Council',
            text: r.state === 'done'
              ? `【Council 종합 회의 (Convene)】\n5개 실행 페르소나 및 기록 상황을 종합 검토했습니다.\n\n${r.text}`
              : `【Council 종합 회의】\n${r.note || '자문을 생성하지 못했습니다.'}`,
          },
        ]);
      });
      return;
    }

    if (a && CHAT_PERSONAS[a] && a !== DEFAULT_PERSONA_KEY) {
      const p = CHAT_PERSONAS[a];
      setAgentKey(a);
      if (p.intro) setThread(p.intro);
      setConversations(prev => [
        { name: p.title, agent: p.name, time: '지금', active: true },
        ...prev.map(c => ({ ...c, active: false })),
      ]);
      const mode = q.get('mode');
      const ref = q.get('ref');
      if (mode) setActiveMode(mode);
      if (a === 'guru' && mode && GURU_MODE_LABEL[mode]) {
        const label = ref ? `${GURU_MODE_LABEL[mode]}: ${ref}` : GURU_MODE_LABEL[mode];
        runGuru(mode, { ref, label });
      } else if (a === 'council' && mode === 'sparring') {
        runPersona('council', 'sparring', '비즈니스 전략 및 브랜드에 대해 추진 논거 vs 맹점 비판 vs 1단계 검증 행동으로 3자 격돌해줘.');
      } else if (a === 'council' && mode === 'weekly-review') {
        runPersona('council', 'weekly-review', '이번 주 실행 팩트 요약, 병목 진단, 다음 주 실험 1가지를 사실 기반으로 평가해줘.');
      } else if (a === 'order' && mode === 'dispatch') {
        runPersona('order', 'advice', '오늘 긴급 및 중요 신호를 분석해 작업지시서(work_order) 우선순위를 조립해줘.');
      }
    }
  }, [runGuru, runPersona]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    if (agentKey === 'guru') {
      runGuru(activeMode === 'sparring' ? 'sparring' : 'proposal-critique', { draft: text, label: text });
      return;
    }
    runPersona(agentKey, activeMode, text, { lens: activeLens });
  };

  const startConversation = () => {
    setConversations(prev => [
      { name: '새 대화', agent: persona.name, time: '지금', active: true },
      ...prev.map(c => ({ ...c, active: false })),
    ]);
    setThread(persona.intro || []);
  };
  return (
    <div className="hub-chat-shell" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', overflow: 'hidden' }}>
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>Conversations</span>
          <IconButton icon="plus" size={24} iconSize={13} tooltip="New conversation" onClick={startConversation} />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {conversations.map((c, i) => (
            <button key={i} onClick={() => setConversations(prev => prev.map((item, idx) => ({ ...item, active: idx === i })))} style={{
              width: '100%', padding: '9px 10px', marginBottom: 1,
              background: c.active ? 'var(--surface-3)' : 'transparent',
              border: c.active ? '1px solid var(--line)' : '1px solid transparent',
              borderRadius: 'var(--r-sm)', textAlign: 'left',
            }}>
              <div style={{ fontSize: 12.5, color: c.active ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: c.active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.agent}</span>
                <div style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.time}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={persona.name} size={26} tone="moon" />
          <div style={{ flex: 1 }}>
            {/* §11: 페이지당 정확히 하나의 h2 페이지 타이틀(20px/500) — 채팅 메인 페인의 페르소나 스트립이 그 자리다. */}
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>코칭·대화</h2>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{persona.name} · {persona.role}</div>
          </div>
          {/* "Pin to Brief"는 로컬 state만 뒤집고 "Pinned" 영수증을 내던 가짜 크로스-표면
              약속이었다(7차 정체성) — Daily Brief 배선이 생기기 전까지 렌더하지 않는다. */}
        </div>

        <div className="scroll-y" style={{ flex: 1, padding: '20px 20px 10px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {thread.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                {m.role === 'agent' && <Avatar name={(m.name || persona.name).slice(0, 1)} size={24} tone="moon" />}
                {m.role === 'user' && <Avatar name="H" size={24} />}
                <div style={{ maxWidth: '75%' }}>
                  {m.role === 'agent' && <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginBottom: 4 }}>{m.name}</div>}
                  <div style={{
                    padding: '10px 13px',
                    background: m.role === 'user' ? 'var(--surface-3)' : 'var(--surface)',
                    border: '1px solid var(--line-soft)',
                    borderRadius: 'var(--r-lg)',
                    fontSize: 13, lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.pending ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)' }}>
                        {/* glow 그림자 제거(§4 calibrated, not decorated — 19차 아바타 glow와 동일 클래스) */}
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', animation: 'mlMoonPulse 1.4s ease-in-out infinite' }} />
                        기록을 읽고 코칭을 정리하는 중…
                      </span>
                    ) : m.text}
                  </div>
                  {m.role === 'agent' && !m.pending && m.text && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={copiedMap[i] ? "check" : "copy"}
                        onClick={() => handleCopyMessage(m.text, i)}
                      >
                        {copiedMap[i] ? "복사됨 ✓" : "복사"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={taskSavedMap[i] ? "check" : "plus"}
                        onClick={() => handleSaveTask(m.text, i)}
                      >
                        {taskSavedMap[i] ? "태스크 등록됨 ✓" : agentKey === 'council' && activeMode === 'weekly-review' ? "실험 태스크로 등록" : "태스크로 등록"}
                      </Button>

                      {agentKey === 'order' && (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            icon="sparkle"
                            disabled={busy}
                            onClick={() => handleHandoff('sales', 'advice', `오더 지시서에 따라 딜 다음 행동 및 반론 대응을 설계해줘:\n\n[오더 내용]:\n${m.text.slice(0, 600)}`)}
                          >
                            👉 세일즈로 전달
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            icon="sparkle"
                            disabled={busy}
                            onClick={() => handleHandoff('content', 'advice', `오더 지시서에 따라 신규 앵글 및 발행 케이던스를 기획해줘:\n\n[오더 내용]:\n${m.text.slice(0, 600)}`)}
                          >
                            👉 콘텐츠로 전달
                          </Button>
                        </>
                      )}

                      {agentKey === 'content' && (
                        <Button
                          variant="outline"
                          size="xs"
                          icon="sparkle"
                          disabled={busy}
                          onClick={() => handleHandoff('production', 'advice', `기획된 앵글을 채널별 포맷 골격(카드뉴스 5장 또는 스레드)으로 변환해줘:\n\n[기획 내용]:\n${m.text.slice(0, 600)}`)}
                        >
                          👉 제작으로 골격화 요청
                        </Button>
                      )}

                      {agentKey === 'production' && (
                        <Button
                          variant="outline"
                          size="xs"
                          icon="sparkle"
                          disabled={busy}
                          onClick={() => handleHandoff('review', 'critique', `제작된 초안에 대해 사실 근거 검수 및 브랜드 가드레일 판정(PASS/REVISE/NEEDS_HUMAN)을 내려줘:\n\n[초안 내용]:\n${m.text.slice(0, 600)}`)}
                        >
                          👉 검수로 게이트 판정 요청
                        </Button>
                      )}

                      {agentKey === 'review' && (
                        <Button
                          variant="outline"
                          size="xs"
                          icon="check"
                          onClick={() => handleSaveTask(`검수 승인 완료: ${m.text.slice(0, 100)}`, i)}
                        >
                          승인 결과 태스크 저장
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--line-soft)', background: 'var(--surface)' }}>
          {/* Mode & Lens Toolbar */}
          <div style={{ maxWidth: 720, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            {/* Modes: Advice / Critique / Sparring / Weekly */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)', marginRight: 2 }}>모드:</span>
              {[
                ['advice', '💡 조언'],
                ['critique', '🔍 평가'],
                ['sparring', '⚖️ 토의'],
                ['weekly-review', '📊 주간정리'],
              ].map(([m, l]) => (
                <button
                  key={m}
                  onClick={() => setActiveMode(m)}
                  style={{
                    padding: '3px 7px',
                    fontSize: 11,
                    borderRadius: 'var(--r-xs)',
                    border: activeMode === m ? '1px solid var(--moon-line)' : '1px solid transparent',
                    background: activeMode === m ? 'var(--surface-3)' : 'transparent',
                    color: activeMode === m ? 'var(--moon-200)' : 'var(--fg-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Lens Switcher */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)', marginRight: 2 }}>렌즈:</span>
              <button
                onClick={() => setActiveLens(null)}
                style={{
                  padding: '3px 6px',
                  fontSize: 10.5,
                  borderRadius: 'var(--r-xs)',
                  border: activeLens === null ? '1px solid var(--line-strong)' : '1px solid transparent',
                  background: activeLens === null ? 'var(--surface-3)' : 'transparent',
                  color: activeLens === null ? 'var(--fg)' : 'var(--fg-muted)',
                  cursor: 'pointer',
                }}
              >
                기본
              </button>
              {['jobs', 'bezos', 'chouinard', 'voss', 'ogilvy', 'carnegie', 'hill'].map((lid) => {
                const l = LEGEND_LENS_MAP[lid];
                const active = activeLens === lid;
                return (
                  <button
                    key={lid}
                    onClick={() => setActiveLens(active ? null : lid)}
                    style={{
                      padding: '3px 6px',
                      fontSize: 10.5,
                      borderRadius: 'var(--r-xs)',
                      border: active ? '1px solid var(--moon-line)' : '1px solid transparent',
                      background: active ? 'var(--surface-3)' : 'transparent',
                      color: active ? 'var(--moon-200)' : 'var(--fg-muted)',
                      cursor: 'pointer',
                    }}
                    title={l.label}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Action Chips per Persona */}
          <div style={{ maxWidth: 720, margin: '0 auto 8px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {agentKey === 'order' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('order', activeMode, '오늘 긴급 및 중요 신호를 분석해 작업지시서(work_order) 우선순위를 조립해줘.', { lens: activeLens })}>우선순위 지시서 조립</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('order', activeMode, '현재 지연된 파이프라인과 오늘 활성화할 최소 페르소나 집합을 진단해줘.', { lens: activeLens })}>병목 신호 진단</Button>
              </>
            )}
            {agentKey === 'sales' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('sales', activeMode, '고객의 도입 지연 및 가격 저항에 대응하는 맞춤 스크립트를 제안해줘.', { lens: activeLens })}>반론 대응 스크립트</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('sales', activeMode, '현재 딜 파이프라인에서 즉시 실행할 다음 한 수와 후속 일정을 설계해줘.', { lens: activeLens })}>다음 행동 설계</Button>
              </>
            )}
            {agentKey === 'content' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('content', activeMode, '독자 가치 중심의 신규 콘텐츠 앵글과 훅 가설 3가지를 기획해줘.', { lens: activeLens })}>아이디어 앵글 기획</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('content', activeMode, '현재 발행 큐와 케이던스 공백을 점검하고 보강안을 제시해줘.', { lens: activeLens })}>발행 케이던스 점검</Button>
              </>
            )}
            {agentKey === 'production' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('production', activeMode, '승인된 핵심 메시지를 카드뉴스 5장 슬라이드 포맷 골격으로 변환해줘.', { lens: activeLens })}>카드뉴스 5장 골격</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('production', activeMode, '긴 글을 3~5단락 스레드 포맷으로 분할 구조화해줘.', { lens: activeLens })}>스레드 분할 골격</Button>
              </>
            )}
            {agentKey === 'review' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('review', 'critique', '작성된 초안의 사실 근거, 브랜드 가드레일 준수 여부를 검수하고 과장 표현을 걸러줘.', { lens: activeLens })}>사실/가드레일 검수</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('review', 'critique', '현재 산출물에 대해 PASS / REVISE / NEEDS_HUMAN 게이트 판정과 수정안을 내려줘.', { lens: activeLens })}>게이트 판정</Button>
              </>
            )}
            {agentKey === 'council' && (
              <>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('council', 'sparring', '현재 비즈니스 전략에 대해 추진 논거 vs 맹점 비판 vs 1단계 검증 행동으로 3자 격돌해줘.', { lens: activeLens })}>3자 스파링 토론</Button>
                <Button variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runPersona('council', 'weekly-review', '이번 주 실행 팩트 요약, 병목 진단, 다음 주 실험 1가지를 사실 기반으로 평가해줘.', { lens: activeLens })}>한 주 정리 & 사실 평가</Button>
              </>
            )}
            {agentKey === 'guru' && (
              <>
                {[['pipeline-triage', '파이프라인 분류'], ['weekly-retro', '주간 회고']].map(([m, l]) => (
                  <Button key={m} variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runGuru(m, {})}>{l}</Button>
                ))}
              </>
            )}
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginLeft: 'auto' }}>
              {activeMode === 'critique' ? '· 맹점과 리스크를 엄격히 검수합니다' : activeMode === 'sparring' ? '· 3단 구조로 찬반 토론합니다' : activeMode === 'weekly-review' ? '· 한 주 기록 팩트를 분석합니다' : '· 실천 가능한 조언을 제공합니다'}
            </span>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 10 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={`Message ${persona.name}…`} style={{
              width: '100%', minHeight: 52, resize: 'none',
              background: 'transparent', border: 'none',
              color: 'var(--fg)', fontSize: 13.5, lineHeight: 1.5,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Button variant="ghost" size="xs" icon="upload" onClick={() => setInput(v => v ? `${v}\n[첨부: context]` : '[첨부: context]')}>Attach</Button>
              <Button variant="ghost" size="xs" icon="link" onClick={() => onNavigate?.('dashboard/work/decisions?new=decision')}>Link decision</Button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{persona.name} · {persona.model}</span>
              <Button variant="primary" size="xs" icon="send" onClick={send} disabled={busy}>Send</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Real seeded persona roster (order/sales/content/production/review) + each one's
// most recent agent_runs row. Was previously the static COUNCIL array — a fictional
// 6-persona roster (strategist/analyst/writer/operator/coach/guru) with fabricated
// "last output" quotes that had no backend at all.
function useAgentRoster() {
  const [state, setState] = React.useState({ status: 'loading', personas: [] });

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/agents', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        setState({
          status: d?.status === 'live' ? 'live' : 'preview',
          personas: Array.isArray(d?.personas) ? d.personas : [],
        });
      })
      .catch(() => active && setState({ status: 'preview', personas: [] }));
    return () => { active = false; };
  }, []);

  return state;
}

// Council advisory panel — the brand-side counterpart of GuruCoachPanel (revenue.jsx). Calls
// the Hub proxy (/api/hub/brand-mentor) which enriches the request with the content/project
// ledger and forwards to the Engine; renders the idle/loading/done/preview/error states the
// same way Guru does. Default mode is 브랜드 전략 (brand-strategy).
function CouncilCoachPanel({ onNavigate }) {
  const [state, setState] = React.useState('idle'); // idle | loading | done | preview | error
  const [text, setText] = React.useState('');
  const [note, setNote] = React.useState('');
  const [councilData, setCouncilData] = React.useState(null);
  const [selectedTriadId, setSelectedTriadId] = React.useState(null);
  const [requestedTriadId, setRequestedTriadId] = React.useState(null);
  const [showFullText, setShowFullText] = React.useState(false);

  const [currentMode, setCurrentMode] = React.useState('brand-strategy');

  const runMode = async (mode = 'brand-strategy', triadId = selectedTriadId) => {
    setCurrentMode(mode);
    setState('loading');
    setText('');
    setNote('');
    setCouncilData(null);
    setShowFullText(false);
    const triad = RECOMMENDED_TRIADS.find((t) => t.id === triadId);
    setRequestedTriadId(triad?.id || null);
    const legendIds = triad ? triad.legendIds : undefined;
    const r = await requestCouncilAdvice({ mode, legendIds });
    if (r.state === 'done') {
      setText(r.text);
      setCouncilData(r.council || null);
      setState('done');
    } else {
      setNote(r.note || '');
      setState(r.state);
    }
  };

  const activeTriad = RECOMMENDED_TRIADS.find((t) => t.id === (state === 'idle' ? selectedTriadId : requestedTriadId));

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Council 자문 & 토의</div>
            <Badge tone="neutral" size="xs">브랜드 카운슬</Badge>
            {activeTriad && (
              <Badge tone="moon" size="xs">{activeTriad.label} 트라이어드</Badge>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>
            {currentMode === 'sparring' ? '3자 스파링 — 추진 논거 vs 맹점 비판 vs 검증 행동' : currentMode === 'weekly-review' ? '한 주 정리 — 사실 기반 패턴 진단 및 다음 주 실험' : '이번 주 브랜드 전략 — 무엇부터 손댈지'}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="outline" size="xs" icon="sparkle" onClick={() => runMode('sparring')} disabled={state === 'loading'}>
            3자 토의
          </Button>
          <Button variant="primary" size="xs" icon="sparkle" onClick={() => runMode('brand-strategy')} disabled={state === 'loading'}>
            {state === 'loading' ? '분석 중…' : '전략 자문'}
          </Button>
        </div>
      </div>

      {/* Recommended Triads Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginRight: 2 }}>다음 자문의 트라이어드:</span>
        {RECOMMENDED_TRIADS.map((t) => {
          const isSelected = selectedTriadId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className="hub-btn hub-btn--subtle"
              aria-pressed={isSelected}
              disabled={state === 'loading'}
              onClick={() => {
                if (state === 'loading') return;
                const next = isSelected ? null : t.id;
                setSelectedTriadId(next);
              }}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 999,
                border: isSelected ? '1px solid var(--moon-500)' : '1px solid var(--line)',
                background: isSelected ? 'var(--moon-bg)' : 'transparent',
                color: isSelected ? 'var(--moon-100)' : 'var(--fg-muted)',
                cursor: state === 'loading' ? 'not-allowed' : 'pointer',
              }}
              title={t.desc}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {state === 'idle' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          Council에게 브랜드/프로젝트 기록 기준의 자문을 요청하세요. 정체된 프로젝트·발행 케이던스 공백·
          다음 마일스톤을 근거로 먼저 손댈 액션 3건과 이유를 우선순위로 제시합니다. 트라이어드를 선택하면 해당 레전드의 가치관·비용 판단 프레임이 적용됩니다.
        </div>
      )}

      {state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <Dot tone="moon" size={6} style={{ animation: 'mlMoonPulse 1.4s ease-in-out infinite' }} />
          브랜드 기록을 읽고 자문을 정리하는 중…
        </div>
      )}

      {state === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {councilData && (councilData.lenses?.length > 0 || councilData.dissent || councilData.conditionalVerdict || councilData.nextAction || councilData.tacticalTip) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Lenses Grid */}
              {Array.isArray(councilData.lenses) && councilData.lenses.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {councilData.lenses.map((l, idx) => (
                    <div key={idx} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', marginBottom: 4 }}>
                        {l.lens || `렌즈 ${idx + 1}`}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5, marginBottom: l.cost ? 6 : 0 }}>
                        {l.verdict}
                      </div>
                      {l.cost && (
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', borderTop: '1px dashed var(--line)', paddingTop: 4 }}>
                          <span style={{ color: 'var(--fg-dim)' }}>감수할 비용:</span> {l.cost}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Dissent / Preservation of Dissent */}
              {councilData.dissent && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', boxShadow: 'inset 1px 0 0 var(--line-strong)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone="neutral" size="xs">이견 보존 (Dissent)</Badge>
                    <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>합의보다 반대 논거 중시</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                    {councilData.dissent}
                  </div>
                </div>
              )}

              {/* Conditional Verdict */}
              {councilData.conditionalVerdict && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone="neutral" size="xs">조건부 판정</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                    {councilData.conditionalVerdict}
                  </div>
                </div>
              )}

              {/* Next Action */}
              {councilData.nextAction && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone="neutral" size="xs">즉시 실행 1단계</Badge>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.5 }}>
                    {councilData.nextAction}
                  </div>
                </div>
              )}

              {/* Tactical Tip */}
              {councilData.tacticalTip && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--moon-line)', boxShadow: 'inset 2px 0 0 var(--moon-500)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Badge tone="moon" size="xs">💡 거장의 실전 팁</Badge>
                    <span style={{ fontSize: 10.5, color: 'var(--moon-200)' }}>30초 즉시 적용</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                    {councilData.tacticalTip}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Button variant="ghost" size="xs" onClick={() => setShowFullText(!showFullText)}>
                  {showFullText ? '원문 접기' : '자문 원문 보기'}
                </Button>
              </div>

              {showFullText && (
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {text}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</div>
          )}

          <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(councilChatPath())}>코칭·대화에서 이어가기</Button>
          </div>
        </div>
      )}

      {(state === 'preview' || state === 'error') && (
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          <Badge tone={state === 'preview' ? 'neutral' : 'danger'} size="xs">{state === 'preview' ? 'preview' : 'error'}</Badge>
          <span style={{ marginLeft: 8 }}>
            {state === 'preview'
              ? 'Engine이 아직 연결되지 않아 자문을 생성할 수 없습니다. (COM_MOON_ENGINE_URL 미설정)'
              : note}
          </span>
        </div>
      )}
    </Card>
  );
}

export function AgentsCouncil({ onNavigate }) {
  const roster = useAgentRoster();

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>브랜드 자문</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch' }}>
            {roster.personas.length}명의 페르소나가 함께 의논. 브리핑·결정에 근거 제공.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge tone="neutral" size="xs">{roster.status === 'live' ? 'live' : 'preview'}</Badge>
        <Button variant="outline" size="sm" icon="sparkle" onClick={() => onNavigate?.('dashboard/agents/chat?prompt=council')}>자문 대화 열기</Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-muted)' }}>
        <span>Codex 코드 작업과 진행 상태는 작업·실행에서 확인합니다.</span>
        <Button variant="ghost" size="sm" onClick={() => onNavigate?.('dashboard/agents/orders?view=jobs')}>코드 작업 열기</Button>
      </div>
      <CouncilCoachPanel onNavigate={onNavigate} />
      {roster.status === 'loading' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>페르소나 로스터 불러오는 중…</div>
      )}
      {roster.status !== 'loading' && roster.personas.length === 0 && (
        <EmptyState
          icon="agents"
          title="페르소나 로스터가 비어 있습니다"
          description="Supabase agents 기록이 준비되지 않았습니다."
        />
      )}
      <div className="hub-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--gap)' }}>
        {roster.personas.map(a => (
          <Card
            key={a.id}
            role="button"
            tabIndex={0}
            aria-label={`${a.nameKo || a.id} 채팅 열기`}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate?.(`dashboard/agents/chat?agent=${a.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(`dashboard/agents/chat?agent=${a.id}`); } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {/* §4/§13: 컬러 라디얼 그라디언트·glow 금지 — 단색 서피스 + 헤어라인으로 교체(7차 디자인) */}
              <div style={{
                width: 36, height: 36, borderRadius: 999,
                background: 'var(--surface-3)',
                border: '1px solid var(--line)',
                flexShrink: 0,
              }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.nameKo || a.id}</span>
                  <Dot tone={a.status === 'idle' ? 'neutral' : 'moon'} size={6} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role}</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', marginBottom: 5 }}>Recent</div>
              {a.lastRun
                ? <>{shortWhen(a.lastRun.ranAt)} · {a.lastRun.summary || `${a.emits} 산출`}</>
                : (a.status === 'idle' ? '아직 실행 기록 없음' : '실행 대기')}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// lifecycle은 §5.3 중립 — 라벨이 상태를 말한다.
const WO_STATUS_TONE = { proposed: 'neutral', approved: 'neutral', executed: 'neutral', dismissed: 'neutral', done: 'neutral', review: 'neutral', draft: 'neutral' };

function shortWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return '방금';
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(d);
}

// Live render: real work_orders (the semi-auto queue) + the configured persona roster.
export function AgentsOrders({ onNavigate }) {
  const search = useSearchParams();
  const view = search.get('view') === 'jobs' ? 'jobs' : 'orders';
  return <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
    <header><h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>작업·실행</h2>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.7, color: 'var(--fg-muted)' }}>작업 지시의 승인과 코드 작업의 실행 결과를 각각 확인합니다.</p>
    </header>
    <SegmentedControl label="작업·실행 보기" options={[{ key: 'orders', label: '작업 지시' }, { key: 'jobs', label: '코드 작업' }]} value={view}
      onChange={next => onNavigate?.(next === 'jobs' ? 'dashboard/agents/orders?view=jobs' : 'dashboard/agents/orders')} />
    {view === 'jobs' ? <><p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--fg-muted)' }}>현재 연결 계정과 등록 프로젝트의 작업입니다. 회사·개인 필터는 적용되지 않습니다. 작업 성공은 배포 완료를 뜻하지 않습니다.</p><CodexJobsPanel /></> : <WorkOrdersQueue onNavigate={onNavigate} />}
  </div>;
}

function WorkOrdersQueue({ onNavigate }) {
  const [orders, setOrders] = React.useState(null); // null = loading
  const [personas, setPersonas] = React.useState([]);
  const [live, setLive] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);
  const [readError, setReadError] = React.useState(null);
  const [copiedId, setCopiedId] = React.useState(null);

  // 딜 채널이 카톡/전화 중심이라 "복사"가 실제 발송 경로 — 초안을 클립보드로 옮겨 보내는 흐름.
  const copyDraft = async (o) => {
    const subject = o.body?.subject || o.body?.title || '';
    const text = [subject, o.body?.body || ''].filter(Boolean).join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(o.id);
      window.setTimeout(() => setCopiedId((v) => (v === o.id ? null : v)), 1600);
    } catch { /* clipboard unavailable — silent */ }
  };

  React.useEffect(() => {
    let active = true;
    fetch('/api/hub/work-orders', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok || !d || d.status === 'error') {
          // read 실패를 빈 큐("대기 제안 없음")로 위장하지 않는다 — 후속 누락 0건 계약.
          setReadError('승인 큐를 읽지 못했습니다 — 대기 제안이 있을 수 있습니다. 새로고침으로 재시도하세요.');
          setOrders([]);
          setLive(false);
          return;
        }
        if (Array.isArray(d.orders) && d.source === 'supabase') {
          setOrders(d.orders);
          setLive(true);
        } else {
          setOrders([]);
          setLive(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setReadError('승인 큐를 읽지 못했습니다 — 대기 제안이 있을 수 있습니다. 새로고침으로 재시도하세요.');
        setOrders([]);
        setLive(false);
      });
    fetch('/api/hub/agents', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => { if (active && d && Array.isArray(d.personas)) setPersonas(d.personas); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function decide(id, status) {
    if (busyId) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      else setActionError(`처리 실패 (${res.status}) — 스테일 전이면 새로고침 후 다시 시도하세요.`);
    } catch {
      setActionError('처리 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      setBusyId(null);
    }
  }

  // Approved → executed with the realized outcome, closing the outcome-attribution loop.
  async function execute(id, action) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: 'executed', outcome: { action } }),
      });
      if (res.ok) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'executed' } : o)));
      else setActionError(`처리 실패 (${res.status}) — 다시 시도하세요.`);
    } catch {
      setActionError('처리 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      setBusyId(null);
    }
  }

  // Approved dm/lead capture → executed with no outcome payload, closing the lead-capture
  // loop instead (work_orders.lead_id back-fill — see work-orders.js promoteCaptureToLead).
  async function promote(id) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: 'executed' }),
      });
      if (res.ok) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'executed' } : o)));
      else setActionError(`처리 실패 (${res.status}) — 다시 시도하세요.`);
    } catch {
      setActionError('처리 실패 — 네트워크를 확인하고 다시 시도하세요.');
    } finally {
      setBusyId(null);
    }
  }

  const rows = Array.isArray(orders)
    ? orders.map((o) => ({ id: o.id, at: shortWhen(o.proposedAt), to: o.persona, what: o.title, status: o.status, kind: o.kind, body: o.body, live: true }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>작업 지시</h3>
          {actionError && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{actionError}</div>}
          {readError && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{readError}</div>}
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>페르소나·인박스가 올린 제안 큐 · 승인은 실행 완료가 아닙니다.</div>
        </div>
        <div style={{ flex: 1 }} />
        <TruthBadge state={orders === null ? 'loading' : readError ? 'error' : live ? 'live' : 'preview'} />
      </div>

      {personas.length > 0 && (
        <Card pad={false} style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface-2)' }}>
          <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Personas</span>
          {personas.map((p) => (
            <Badge key={p.id} tone={p.status === 'idle' ? 'neutral' : 'moon'} variant="outline" size="xs">
              {p.nameKo || p.id} · {p.emits}
            </Badge>
          ))}
        </Card>
      )}

      <Card pad={false} className="hub-table-card">
        <div style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 90px 120px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>When</span><span>Persona</span><span>Proposal</span><span>Status</span><span style={{ textAlign: 'right' }} />
        </div>
        {rows.length === 0 && (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--fg-muted)' }}>
            {orders === null ? <Skeleton lines={3} label="작업 지시 불러오는 중" /> : readError ? '작업 지시를 확인하지 못했습니다.' : !live ? '작업 지시 저장소를 연결하면 제안을 확인할 수 있습니다.' : '대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기에 쌓입니다.'}
          </div>
        )}
        {rows.map((o, i) => (
          <div key={o.id} style={{
            opacity: busyId === o.id ? 0.5 : 1,
            borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '100px 90px 1fr 90px 120px',
              padding: '12px 16px', alignItems: 'center',
            }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{o.at}</span>
              <span style={{ fontSize: 12, color: 'var(--moon-300)' }}>{o.to}</span>
              <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.what}</span>
              <Badge tone={WO_STATUS_TONE[o.status] || 'neutral'} size="xs">{o.status}</Badge>
              <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {o.live && o.status === 'proposed' ? (
                  <>
                    <Button variant="primary" size="xs" onClick={() => decide(o.id, 'approved')}>승인</Button>
                    <Button variant="ghost" size="xs" onClick={() => decide(o.id, 'dismissed')}>보류</Button>
                  </>
                ) : null /* 결정 끝난 행의 "Open"은 ?order= 제거 후 맥락 없는 빈 채팅에
                  착지하는 死 어포던스였다(7차 사용성) — 행 자체가 기록이라 액션 불필요 */}
              </div>
            </div>
            {/* AI-drafted message preview — operator reads it before the 1-click approve. No auto-send.
                복사 = 카톡/전화 채널의 실제 발송 경로 (클립보드로 옮겨 보낸다). */}
            {o.live && (o.kind === 'followup-draft' || o.kind === 'content-draft') && o.body?.body && (
              <div style={{ padding: '0 16px 12px 116px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {o.body.body}
                </div>
                <Button variant="ghost" size="xs" onClick={() => copyDraft(o)} style={{ flexShrink: 0 }}>
                  {copiedId === o.id ? '복사됨' : '복사'}
                </Button>
              </div>
            )}
            {o.live && o.status === 'approved' && (o.kind === 'dm' || o.kind === 'lead' ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '0 16px 12px 116px' }}>
                {/* 완료 확인은 check + 중립 텍스트 (§5.2 — green 축하 금지). */}
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Iconed name="check" size={11} /> 신규 리드
                </span>
                <Button variant="outline" size="xs" onClick={() => promote(o.id)}>리드로 등록</Button>
              </div>
            ) : o.kind === 'content-draft' ? (
              // 승인 = Studio 파이프라인으로 구체화(서버가 idea→draft 승격 + variant 생성).
              // 콘텐츠 초안은 영업 퍼널 outcome을 절대 남기지 않는다 — 완료는 무-outcome executed.
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '0 16px 12px 116px' }}>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Iconed name="check" size={11} /> Studio 초안 생성
                </span>
                <Button variant="outline" size="xs" onClick={() => onNavigate?.('dashboard/content/studio')}>Studio 열기</Button>
                <Button variant="ghost" size="xs" onClick={() => promote(o.id)}>완료</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '0 16px 12px 116px' }}>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Iconed name="check" size={11} /> 실행 결과
                </span>
                {WO_EXECUTE_ACTIONS.map((a) => (
                  <Button key={a.action} variant="outline" size="xs" onClick={() => execute(o.id, a.action)}>{a.label}</Button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
