"use client";

import React from "react";
import { useSearchParams } from 'next/navigation';
import { CodexJobsPanel } from "./codex-jobs";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, Kbd, EmptyState, SegmentedControl, TruthBadge, Skeleton, LifecycleBadge, Checkbox, TextAreaField } from "../hub-primitives";
import { useUndoableAction } from '../use-undoable-action';
import { ContactRecordDrawer } from '../contact-record-form';
import { requestGuruCoaching, GURU_MODE_LABEL, GURU_PREVIEW_NOTE } from "../guru-client";
import { GURU_CARDS } from '@com-moon/guru-guidance';
import { GuruGuidanceCard } from '../guru-guidance-card';
import { requestCouncilAdvice, councilChatPath } from "../council-client";
import { COUNCIL_HANDOFF_DRAFT_LIMIT, consumeCouncilDesktopHandoff, createCouncilDraftState, reduceCouncilDraft } from '../council-desktop-handoff';
import { RECOMMENDED_TRIADS } from "../council-legends";
import { requestPersonaChat, PERSONA_MODE_LABEL, LEGEND_LENS_MAP } from "../persona-client";
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
      { role: 'agent', name: 'Guru', text: '필요한 순간에만 관점을 빌려드릴게요. 아래 카드는 읽고 지나가도 됩니다.' },
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
  const [guruGuidanceId, setGuruGuidanceId] = React.useState(null);
  const guruInputRef = React.useRef(null);
  const [taskSavedMap, setTaskSavedMap] = React.useState({});
  const [copiedMap, setCopiedMap] = React.useState({});
  const busyRef = React.useRef(false);
  const persona = CHAT_PERSONAS[agentKey] || CHAT_PERSONAS[DEFAULT_PERSONA_KEY];

  // Run a real coaching pass against Guru
  const runGuru = React.useCallback(async (mode, { ref = null, draft = null, label, guidanceId = null } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const userText = label || draft || GURU_MODE_LABEL[mode] || '코칭 요청';
    setBusy(true);
    setThread(prev => [
      ...prev,
      { role: 'user', text: userText },
      { role: 'agent', name: 'Guru', pending: true },
    ]);
    const r = await requestGuruCoaching({ mode, ref, draft, guidanceId });
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
      const guidanceId = q.get('guidanceId');
      const guidanceCard = a === 'guru' ? GURU_CARDS.find(card => card.id === guidanceId) : null;
      if (guidanceCard) {
        setGuruGuidanceId(guidanceCard.id);
        setInput(guidanceCard.question);
      }
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
      const mode = activeMode === 'advice' ? 'open-question'
        : activeMode === 'critique' ? 'proposal-critique'
        : activeMode === 'weekly-review' ? 'weekly-retro'
        : 'sparring';
      runGuru(mode, { draft: text, label: text, guidanceId: guruGuidanceId });
      setGuruGuidanceId(null);
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
    setGuruGuidanceId(null);
    setInput('');
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
            {agentKey === 'guru' && thread.length <= 1 && (
              <GuruGuidanceCard allowDomains onBrowse={() => setGuruGuidanceId(null)} onAsk={card => {
                setGuruGuidanceId(card.id);
                setInput(card.question);
                guruInputRef.current?.focus();
              }} />
            )}
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
            <textarea ref={guruInputRef} value={input} onChange={e => setInput(e.target.value)} placeholder={`Message ${persona.name}…`} style={{
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
  const [draftState, dispatchDraft] = React.useReducer(reduceCouncilDraft, undefined, createCouncilDraftState);
  const requestInFlight = React.useRef(false);
  React.useEffect(() => {
    const receive = () => {
      const result = consumeCouncilDesktopHandoff(window);
      if (result?.ok) dispatchDraft({ type: 'receive', payload: result.payload });
      else if (result) dispatchDraft({ type: 'error', error: result.error });
    };
    // replaceState removes only our fragment. StrictMode's next setup sees no new input.
    receive();
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, []);
  const [state, setState] = React.useState('idle'); // idle | loading | done | preview | error
  const [text, setText] = React.useState('');
  const [note, setNote] = React.useState('');
  const [councilData, setCouncilData] = React.useState(null);
  const [selectedTriadId, setSelectedTriadId] = React.useState(null);
  const [requestedTriadId, setRequestedTriadId] = React.useState(null);
  const [showFullText, setShowFullText] = React.useState(false);

  const [currentMode, setCurrentMode] = React.useState('brand-strategy');

  const runMode = async (mode = 'brand-strategy', triadId = selectedTriadId) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const draft = draftState.draft.trim() ? draftState.draft : null;
    setCurrentMode(mode);
    setState('loading');
    setText('');
    setNote('');
    setCouncilData(null);
    setShowFullText(false);
    const triad = RECOMMENDED_TRIADS.find((t) => t.id === triadId);
    setRequestedTriadId(triad?.id || null);
    const legendIds = triad ? triad.legendIds : undefined;
    const r = await requestCouncilAdvice({ mode, legendIds, draft, createWorkOrder: false });
    requestInFlight.current = false;
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

      <TextAreaField
        label="검토할 안건"
        value={draftState.draft}
        onChange={event => dispatchDraft({ type: 'edit', draft: event.target.value })}
        rows={4}
        maxLength={COUNCIL_HANDOFF_DRAFT_LIMIT}
        showCount
        hint="내용을 확인한 뒤 ‘전략 자문’ 또는 ‘3자 토의’를 누르세요. 비워 두면 브랜드·프로젝트 기록으로 자문합니다."
        error={draftState.error || undefined}
        fieldStyle={{ marginBottom: 12 }}
      />
      {draftState.notice && <p role="status" style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>{draftState.notice}</p>}
      {draftState.pending.length > 0 && (
        <div style={{ paddingBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
            가져올 안건 <span className="num">{draftState.pending.length}</span>건 · 기존 입력을 유지하고 뒤에 붙일 수 있습니다.
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflowY: 'auto', margin: '0 0 8px' }}>{draftState.pending[0].draft}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Button variant="outline" size="xs" onClick={() => dispatchDraft({ type: 'append' })}>기존 입력 뒤에 붙이기</Button>
            <Button variant="ghost" size="xs" onClick={() => dispatchDraft({ type: 'dismiss' })}>이 안건 닫기</Button>
          </div>
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

const ORDER_FILTERS = [
  { key: 'proposed', label: '대기' },
  { key: 'approved', label: '실행 전' },
  { key: 'executed', label: '완료' },
  { key: 'dismissed', label: '보류' },
  { key: 'all', label: '전체' },
];
const ORDER_LIFECYCLE = {
  proposed: ['queued', '대기'],
  approved: ['waiting', '실행 전'],
  executing: ['active', '실행 중'],
  executed: ['done', '완료'],
  dismissed: ['cancelled', '보류'],
};

export function AgentsOrders({ onNavigate }) {
  const search = useSearchParams();
  const view = search.get('view') === 'jobs' ? 'jobs' : 'orders';
  const requestedStatus = search.get('status') || 'proposed';
  const status = ORDER_FILTERS.some((option) => option.key === requestedStatus) ? requestedStatus : 'proposed';
  return <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
    <header><h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>작업·실행</h2>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.7, color: 'var(--fg-muted)' }}>작업 지시와 코드 작업의 현재 상태를 확인합니다.</p>
    </header>
    <SegmentedControl label="작업·실행 보기" options={[{ key: 'orders', label: '작업 지시' }, { key: 'jobs', label: '코드 작업' }]} value={view}
      onChange={next => onNavigate?.(next === 'jobs' ? `dashboard/agents/orders?view=jobs&status=${status}` : `dashboard/agents/orders?status=${status}`)} />
    {view === 'jobs' ? <><p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--fg-muted)' }}>현재 연결 계정과 등록 프로젝트의 작업입니다. 회사·개인 필터는 적용되지 않습니다. 작업 성공은 배포 완료를 뜻하지 않습니다.</p><CodexJobsPanel /></> :
      <WorkOrdersQueue status={status} onStatusChange={(next) => onNavigate?.(`dashboard/agents/orders?status=${next}`)} />}
  </div>;
}

function WorkOrdersQueue({ status, onStatusChange }) {
  const [orders, setOrders] = React.useState(null);
  const [counts, setCounts] = React.useState(null);
  const [listState, setListState] = React.useState('loading');
  const [countState, setCountState] = React.useState('loading');
  const [actionError, setActionError] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());
  const [locked, setLocked] = React.useState(new Set());
  const [notices, setNotices] = React.useState([]);
  const [copiedId, setCopiedId] = React.useState(null);
  const [recordTarget, setRecordTarget] = React.useState(null);
  const lockedRef = React.useRef(new Set());
  const readSeq = React.useRef(0);
  const statusRef = React.useRef(status);
  statusRef.current = status;
  const { schedule, cancel } = useUndoableAction();

  const refresh = React.useCallback(async () => {
    const seq = ++readSeq.current;
    const requestedStatus = statusRef.current;
    const read = (url) => fetch(url, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }));
    const [list, summary] = await Promise.allSettled([
      read(`/api/hub/work-orders?scope=proposals&status=${requestedStatus}`),
      read('/api/hub/work-orders?summary=1&scope=proposals'),
    ]);
    if (readSeq.current !== seq || statusRef.current !== requestedStatus) return;
    const listResponse = list.status === 'fulfilled' ? list.value : null;
    const listData = listResponse?.d;
    if (!listResponse?.ok || !listData || listData.status === 'error' || listData.source === 'error') {
      setOrders([]);
      setListState('error');
    } else {
      setOrders(Array.isArray(listData.orders) ? listData.orders : []);
      setListState(listData.source === 'supabase' ? 'live' : 'preview');
    }
    const countResponse = summary.status === 'fulfilled' ? summary.value : null;
    const countData = countResponse?.d;
    if (!countResponse?.ok || !countData || countData.status === 'error' || countData.source === 'error') {
      setCounts(null);
      setCountState('error');
    } else {
      setCounts(countData.source === 'supabase' ? countData.counts : null);
      setCountState(countData.source === 'supabase' ? 'live' : 'preview');
    }
  }, []);

  React.useEffect(() => {
    setOrders(null);
    setListState('loading');
    setSelected(new Set());
    refresh();
    return () => { readSeq.current += 1; };
  }, [status, refresh]);

  const lockIds = (ids) => {
    ids.forEach((id) => lockedRef.current.add(id));
    setLocked(new Set(lockedRef.current));
  };
  const unlockIds = (ids) => {
    ids.forEach((id) => lockedRef.current.delete(id));
    setLocked(new Set(lockedRef.current));
  };

  const scheduleAction = (ids, targetStatus = null) => {
    const eligible = ids.filter((id) => orders?.some((order) => order.id === id) && !lockedRef.current.has(id));
    if (!eligible.length) return;
    lockIds(eligible);
    setSelected(new Set());
    setActionError(null);
    const key = `order-${Date.now()}-${Math.random()}`;
    const label = targetStatus === 'approved' ? '승인 예정' : targetStatus === 'dismissed' ? '보류 예정'
      : targetStatus === 'executed' ? '완료 표시 예정' : targetStatus === 'proposed' ? '다시 열기 예정' : '삭제 예정';
    setNotices((current) => [...current, { key, ids: eligible, label }]);
    schedule(key, async () => {
      try {
        if (targetStatus) {
          const response = await fetch('/api/hub/work-orders', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: eligible[0], status: targetStatus }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || data.persisted === false) {
            if (data?.reason === 'open-followup-exists') throw new Error('같은 딜에 열린 후속 제안이 이미 있습니다.');
            throw new Error('상태를 저장하지 못했습니다. 새로고침 후 다시 시도하세요.');
          }
        } else {
          const response = await fetch('/api/hub/work-orders', {
            method: 'DELETE', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: eligible }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.ok) throw new Error('제안을 삭제하지 못했습니다. 다시 시도하세요.');
        }
        await refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : '작업 지시를 저장하지 못했습니다.');
      } finally {
        unlockIds(eligible);
        setNotices((current) => current.filter((notice) => notice.key !== key));
      }
    });
  };

  const undo = (notice) => {
    if (!cancel(notice.key)) return;
    unlockIds(notice.ids);
    setNotices((current) => current.filter((item) => item.key !== notice.key));
  };

  const copyDraft = async (order) => {
    const text = [order.body?.subject, order.body?.body].filter(Boolean).join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(order.id);
    } catch { setActionError('초안을 복사하지 못했습니다.'); }
  };

  const visibleOrders = (orders || []).filter((order) => !locked.has(order.id));
  const selectedIds = visibleOrders.filter((order) => selected.has(order.id)).map((order) => order.id).slice(0, 50);
  const countFor = (key) => {
    if (!counts) return null;
    if (key === 'approved') return counts.approved + counts.executing;
    if (key === 'all') return Object.values(counts).reduce((sum, value) => sum + value, 0);
    return counts[key];
  };
  const options = ORDER_FILTERS.map((option) => ({ ...option, count: countFor(option.key) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>작업 지시</h3>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>승인은 실행 완료가 아닙니다. 캡처 메모는 메모 &gt; 받은함에서 정리합니다.</div>
        </div>
        <TruthBadge state={listState} />
      </div>
      <SegmentedControl label="작업 지시 상태" options={options} value={status} onChange={onStatusChange} />
      {countState === 'error' && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>상태별 건수를 읽지 못했습니다. 목록은 별도로 확인해 주세요.</div>}
      {actionError && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{actionError}</div>}
      {notices.map((notice) => <div key={notice.key} role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
        <span>{notice.label} · 3.5초 뒤 저장</span>
        <Button variant="ghost" size="xs" onClick={() => undo(notice)}>되돌리기</Button>
      </div>)}
      {listState === 'live' && visibleOrders.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="xs" onClick={() => setSelected(selectedIds.length === Math.min(visibleOrders.length, 50) ? new Set() : new Set(visibleOrders.slice(0, 50).map((order) => order.id)))}>
          {selectedIds.length === Math.min(visibleOrders.length, 50) ? '선택 해제' : '이 목록 모두 선택'}
        </Button>
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>한 번에 50건까지</span>
        {selectedIds.length > 0 && <Button variant="danger" size="xs" onClick={() => scheduleAction(selectedIds)}>선택 삭제 {selectedIds.length}건</Button>}
      </div>}
      <Card pad={false} className="hub-table-card">
        {orders === null ? <div style={{ padding: 16 }}><Skeleton lines={3} label="작업 지시 불러오는 중" /></div>
          : listState === 'error' ? <div role="alert" style={{ padding: 16, color: 'var(--danger)', fontSize: 12.5 }}>작업 지시를 읽지 못했습니다. 대기 제안이 있을 수 있습니다.</div>
          : listState === 'preview' ? <EmptyState icon="agents" title="작업 지시 연결 필요" description="저장소가 연결되면 제안을 확인할 수 있습니다." />
          : visibleOrders.length === 0 ? <EmptyState icon="agents" title={status === 'proposed' ? '대기 중인 제안이 없습니다' : '이 상태의 제안이 없습니다'} description="다른 상태는 위 필터에서 확인할 수 있습니다." />
          : visibleOrders.map((order, index) => {
            const [lifecycle, label] = ORDER_LIFECYCLE[order.status] || ORDER_LIFECYCLE.proposed;
            return <div className="hub-row" key={order.id} style={{ padding: '12px 14px', borderBottom: index < visibleOrders.length - 1 ? '1px solid var(--line-soft)' : undefined, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <Checkbox label={`${order.title} 선택`} checked={selected.has(order.id)} onChange={(checked) => setSelected((current) => {
                const next = new Set(current);
                if (checked && next.size < 50) next.add(order.id);
                else if (!checked) next.delete(order.id);
                return next;
              })} />
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{shortWhen(order.proposedAt)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{order.persona || '미지정'}</span>
                  <LifecycleBadge state={lifecycle} label={label} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg)' }}>{order.title}</div>
                {(order.kind === 'followup-draft' || order.kind === 'content-draft') && order.body?.body &&
                  <details style={{ marginTop: 7, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                    <summary>초안 보기</summary>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{order.body.body}</div>
                    <Button variant="ghost" size="xs" onClick={() => copyDraft(order)}>{copiedId === order.id ? '복사됨' : '초안 복사'}</Button>
                  </details>}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                {order.status === 'proposed' && <>
                  <Button variant="primary" size="xs" onClick={() => scheduleAction([order.id], 'approved')}>승인</Button>
                  <Button variant="ghost" size="xs" onClick={() => scheduleAction([order.id], 'dismissed')}>보류</Button>
                </>}
                {order.status === 'approved' && <Button variant="outline" size="xs" onClick={() => scheduleAction([order.id], 'executed')}>완료로 표시</Button>}
                {['approved', 'dismissed'].includes(order.status) && <Button variant="ghost" size="xs" onClick={() => scheduleAction([order.id], 'proposed')}>다시 열기</Button>}
                {order.dealId && <Button variant="ghost" size="xs" onClick={() => setRecordTarget({ kind: 'deal', id: order.dealId, name: order.title })}>연락 기록 열기</Button>}
                <IconButton icon="trash" size={28} iconSize={13} tooltip="제안 삭제 (되돌리기 지원)" aria-label="제안 삭제" onClick={() => scheduleAction([order.id])} />
              </div>
            </div>;
          })}
      </Card>
      {recordTarget && <ContactRecordDrawer target={recordTarget} onClose={() => setRecordTarget(null)} />}
    </div>
  );
}
