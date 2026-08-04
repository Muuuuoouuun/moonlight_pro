"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, Kbd, EmptyState } from "../hub-primitives";
import { requestGuruCoaching, GURU_MODE_LABEL, GURU_PREVIEW_NOTE } from "../guru-client";
import { requestCouncilAdvice, councilChatPath } from "../council-client";
import { QUICK_LOG_ACTIONS as WO_EXECUTE_ACTIONS } from "@/lib/sales-os/outcome-attribution";
import { PERSONA_CONTRACT } from "@/lib/sales-os/persona-contract";

const DEFAULT_PERSONA_KEY = PERSONA_CONTRACT[0]?.id || 'order';

// Persona-registry's 5 configured personas don't yet have individual chat endpoints.
// Their roster is real configuration; chat stays explicitly unavailable until an
// execution route exists. Guru is the only live coaching endpoint here.
const CHAT_PERSONAS = Object.fromEntries(PERSONA_CONTRACT.map((p) => [p.id, {
  name: p.nameKo,
  role: p.role,
  title: `${p.nameKo} · ${p.nameEn}`,
  model: 'Haiku 4.5',
}]));

CHAT_PERSONAS.guru = {
    name: 'Guru',
    role: '영업 멘토 · 딜 코칭',
    title: '영업 멘토 세션',
    model: 'Opus 4.8',
    intro: [
      { role: 'agent', name: 'Guru', text: '영업 멘토입니다. Revenue 기록(딜·리드·계정)을 근거로 "지금 무엇을 놓치고 있고, 다음 한 수가 무엇인지"를 코칭합니다.\n\n무엇을 볼까요?\n· 이번 주 파이프라인 분류\n· 특정 딜 진단 (어느 단계에서 막혔는지)\n· 제안서/이메일/반론 대응 다듬기' },
    ],
};

// Pseudo-persona for "Convene" — not a 6th chat target with its own replies, just the
// identity the header/composer show while the intro synthesizes real /api/hub/agents
// data (roster status + last run per persona). No new AI generation involved.
CHAT_PERSONAS.council = {
  name: 'Council',
  role: '5개 페르소나 현황 종합',
  title: 'Council session',
  model: 'Synthesis',
};

export function AgentsChat({ onNavigate }) {
  const [input, setInput] = React.useState('');
  const [agentKey, setAgentKey] = React.useState(DEFAULT_PERSONA_KEY);
  const [thread, setThread] = React.useState([]);
  const [conversations, setConversations] = React.useState([]);
  const [pinned, setPinned] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const persona = CHAT_PERSONAS[agentKey] || CHAT_PERSONAS[DEFAULT_PERSONA_KEY];

  // Run a real coaching pass against the Engine and stream it into the thread.
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

  // Persona is selected via ?agent=<key>; ?mode=&ref= auto-runs live coaching.
  // ?prompt=council (the Council page's "Convene" button) synthesizes real roster
  // status into an intro instead of just silently landing on the default persona.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const a = q.get('agent');
    const prompt = q.get('prompt');

    if (prompt === 'council') {
      setAgentKey('council');
      setThread([{ role: 'agent', name: 'Council', pending: true }]);
      setConversations(prev => [
        { name: 'Council session', agent: 'Council', time: '지금', active: true },
        ...prev.map(c => ({ ...c, active: false })),
      ]);
      fetch('/api/hub/agents', { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then((d) => {
          const personas = Array.isArray(d?.personas) ? d.personas : [];
          const lines = personas.map((p) => {
            const last = p.lastRun
              ? `${shortWhen(p.lastRun.ranAt)} · ${p.lastRun.summary || `${p.emits} 산출`}`
              : '아직 실행 기록 없음';
            return `· ${p.nameKo}(${p.nameEn}) — ${p.status === 'idle' ? '대기' : '활성'} · ${last}`;
          }).join('\n');
          const header = d?.status === 'live' ? '5개 페르소나 현황을 기록에서 모았습니다.' : '기록이 아직 연결되지 않았습니다. 실행 기록 없는 페르소나 정의만 표시합니다.';
          setThread([
            { role: 'agent', name: 'Council', text: `${header}\n\n${lines || '로스터를 불러오지 못했습니다.'}\n\n무엇을 우선 볼까요?` },
          ]);
        })
        .catch(() => {
          setThread([{ role: 'agent', name: 'Council', text: '페르소나 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }]);
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
      if (a === 'guru' && mode && GURU_MODE_LABEL[mode]) {
        const label = ref ? `${GURU_MODE_LABEL[mode]}: ${ref}` : GURU_MODE_LABEL[mode];
        runGuru(mode, { ref, label });
      }
    }
  }, [runGuru]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    if (agentKey === 'guru') {
      // A typed message to the mentor is treated as a draft to critique.
      setInput('');
      runGuru('proposal-critique', { draft: text, label: text });
      return;
    }
    setThread(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'agent', name: persona.name, text: '이 페르소나는 아직 채팅 실행에 연결되지 않았습니다.' },
    ]);
    setInput('');
  };
  const startConversation = () => {
    setConversations(prev => [
      { name: '새 대화', agent: 'Council', time: '지금', active: true },
      ...prev.map(c => ({ ...c, active: false })),
    ]);
    setThread([]);
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
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{c.time}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={persona.name} size={26} tone="moon" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{persona.title}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{persona.name} · {persona.role}</div>
          </div>
          <Button variant={pinned ? 'secondary' : 'outline'} size="sm" icon="link" onClick={() => setPinned(v => !v)}>{pinned ? 'Pinned' : 'Pin to Brief'}</Button>
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
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--moon-300)', boxShadow: '0 0 8px var(--moon-300)', animation: 'mlMoonPulse 1.4s ease-in-out infinite' }} />
                        기록을 읽고 코칭을 정리하는 중…
                      </span>
                    ) : m.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--line-soft)' }}>
          {agentKey === 'guru' && (
            <div style={{ maxWidth: 720, margin: '0 auto 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['pipeline-triage', '파이프라인 분류'], ['weekly-retro', '주간 회고']].map(([m, l]) => (
                <Button key={m} variant="outline" size="xs" icon="sparkle" disabled={busy} onClick={() => runGuru(m, {})}>{l}</Button>
              ))}
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', alignSelf: 'center' }}>· 메시지를 보내면 제안/이메일 초안으로 보고 검토합니다</span>
            </div>
          )}
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

  const run = async () => {
    setState('loading');
    setText('');
    setNote('');
    const r = await requestCouncilAdvice({ mode: 'brand-strategy' });
    if (r.state === 'done') {
      setText(r.text);
      setState('done');
    } else {
      setNote(r.note || '');
      setState(r.state);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Council 자문</div>
            <Badge tone="moon" size="xs">브랜드 카운슬</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>이번 주 브랜드 전략 — 무엇부터 손댈지</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="sparkle" onClick={run} disabled={state === 'loading'}>
          {state === 'loading' ? '분석 중…' : state === 'done' ? '다시 자문' : '브랜드 전략 자문'}
        </Button>
      </div>

      {state === 'idle' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          Council에게 브랜드/프로젝트 기록 기준의 자문을 요청하세요. 정체된 프로젝트·발행 케이던스 공백·
          다음 마일스톤을 근거로 먼저 손댈 액션 3건과 이유를 우선순위로 제시합니다.
        </div>
      )}

      {state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          <Dot tone="moon" size={6} style={{ animation: 'mlMoonPulse 1.4s ease-in-out infinite' }} />
          브랜드 기록을 읽고 자문을 정리하는 중…
        </div>
      )}

      {state === 'done' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <Button variant="outline" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(councilChatPath())}>Chat에서 이어가기</Button>
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Council</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch' }}>
            {roster.personas.length}명의 페르소나가 함께 의논. 브리핑·결정에 근거 제공.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge tone={roster.status === 'live' ? 'success' : 'neutral'} size="xs">{roster.status === 'live' ? 'live' : 'preview'}</Badge>
        <Button variant="primary" size="sm" icon="sparkle" onClick={() => onNavigate?.('dashboard/agents/chat?prompt=council')}>Convene</Button>
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
          <Card key={a.id} style={{ cursor: 'pointer' }} onClick={() => onNavigate?.(`dashboard/agents/chat?agent=${a.id}`)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 999,
                background: 'radial-gradient(circle at 35% 30%, var(--moon-200), var(--moon-500) 60%, var(--moon-700))',
                boxShadow: '0 0 10px color-mix(in oklch, var(--moon-300) 20%, transparent)',
                flexShrink: 0,
              }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.nameKo || a.id}</span>
                  <Dot tone={a.status === 'idle' ? 'neutral' : 'success'} size={6} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role}</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', marginBottom: 5 }}>Recent</div>
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

const WO_STATUS_TONE = { proposed: 'warning', approved: 'info', executed: 'success', dismissed: 'neutral', done: 'success', review: 'warning', draft: 'neutral' };

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
  const [orders, setOrders] = React.useState(null); // null = loading
  const [personas, setPersonas] = React.useState([]);
  const [live, setLive] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
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
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && Array.isArray(d.orders) && d.source === 'supabase') {
          setOrders(d.orders);
          setLive(true);
        } else {
          setOrders([]);
          setLive(false);
        }
      })
      .catch(() => active && (setOrders([]), setLive(false)));
    fetch('/api/hub/agents', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((d) => { if (active && d && Array.isArray(d.personas)) setPersonas(d.personas); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function decide(id, status) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/hub/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
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
    } finally {
      setBusyId(null);
    }
  }

  const rows = Array.isArray(orders)
    ? orders.map((o) => ({ id: o.id, at: shortWhen(o.proposedAt), to: o.persona, what: o.title, status: o.status, kind: o.kind, body: o.body, live: true }))
    : [];

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Agent orders</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>페르소나·인박스가 올린 제안 큐 · 1클릭 승인</div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge tone={live ? 'success' : 'neutral'} size="xs">{live ? 'live' : 'preview'}</Badge>
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
            {orders === null ? '큐 확인 중…' : '대기 중인 제안이 없습니다. /inbox·/team이 제안을 올리면 여기에 쌓입니다.'}
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
                ) : (
                  <Button variant="ghost" size="xs" iconRight="arrowRight" onClick={() => onNavigate?.(`dashboard/agents/chat?order=${o.id}`)}>Open</Button>
                )}
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
