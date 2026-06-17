"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, SectionTitle, Button, Checkbox, Progress, Sparkline } from "../hub-primitives";
import { BRIEF_SIGNALS, TODAY_BLOCKS, METRICS } from "../hub-data";

function formatBriefDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date).replace(',', ' ·').replace(',', ' ·');
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function SignalCard({ s }) {
  const [expanded, setExpanded] = React.useState(s.id === 's1');
  const [decided, setDecided] = React.useState(null);
  const borderTone = { danger: 'oklch(0.5 0.1 25 / 0.5)', warning: 'oklch(0.5 0.09 85 / 0.5)', success: 'oklch(0.5 0.08 155 / 0.5)', info: 'oklch(0.5 0.06 230 / 0.5)' }[s.tone] || 'var(--line)';

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderLeft: `2px solid ${borderTone}`,
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      opacity: decided ? 0.55 : 1,
      transition: 'opacity .2s',
    }}>
      <div className="hub-stackable-row" onClick={() => setExpanded(e => !e)} style={{ padding: 'var(--card-pad)', cursor: 'pointer', display: 'flex', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
          <Dot tone={s.tone} size={8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Badge tone={s.tone} size="xs">{s.kind}</Badge>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{s.meta}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>from {s.source.from} · <span className="mono">{s.source.ref}</span></span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: decided ? 'var(--fg-muted)' : 'var(--fg)', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {s.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: '70ch' }}>{s.summary}</div>
          {decided && (
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--success)' }}>
              <Iconed name="check" size={12} />
              <span>Decision · {decided}</span>
            </div>
          )}
        </div>
        <Iconed name="chevronD" size={14} style={{ color: 'var(--fg-faint)', transform: expanded ? '' : 'rotate(-90deg)', transition: 'transform .15s' }} />
      </div>
      {expanded && !decided && (
        <div style={{ padding: '0 var(--card-pad) var(--card-pad)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.decisions.map((d, i) => (
            <Button key={i} variant={d.primary ? 'primary' : 'secondary'} size="sm" icon={d.primary ? 'bolt' : null}
              onClick={() => setDecided(d.label)}>
              {d.label}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="moreV">More context</Button>
        </div>
      )}
    </div>
  );
}

function MetricCard({ m }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line-soft)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--card-pad)',
      boxShadow: 'var(--shadow-soft)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{m.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }} className="mono">{m.value}</div>
        <div style={{ flex: 1 }} />
        <Sparkline values={m.spark} tone={m.tone === 'warning' ? 'warning' : m.tone === 'success' ? 'success' : 'moon'} width={70} height={22} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: m.tone === 'success' ? 'var(--success)' : m.tone === 'warning' ? 'var(--warning)' : 'var(--fg-faint)' }}>{m.delta}</div>
    </div>
  );
}

function ContentCadenceCard({ onNavigate }) {
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState("loading");

  React.useEffect(() => {
    let active = true;
    fetch("/api/hub/content", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (!active) return;
        if (d && d.source === "supabase" && d.cadence) {
          setData({ cadence: d.cadence, ideas: Array.isArray(d.ideaQueue) ? d.ideaQueue : [] });
          setState("live");
        } else {
          setState("mock");
        }
      })
      .catch(() => active && setState("mock"));
    return () => { active = false; };
  }, []);

  const syncTone = state === "live" ? "var(--success)" : state === "loading" ? "var(--warning)" : "var(--fg-faint)";
  const syncLabel = state === "live" ? "live" : state === "loading" ? "syncing" : "mock";
  const cadence = data?.cadence;
  const ideas = data?.ideas || [];
  const pct = cadence ? Math.min(100, Math.round((cadence.published / Math.max(cadence.goal, 1)) * 100)) : 0;

  return (
    <div>
      <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: syncTone }}>{syncLabel}</span>}>
        콘텐츠 발행
      </SectionTitle>
      <Card>
        {state === "live" && cadence ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
                {cadence.published}<span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>/{cadence.goal}</span>
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>이번 주</span>
              <div style={{ flex: 1 }} />
              <Badge tone={cadence.behind ? "warning" : "success"} size="xs">
                {cadence.behind ? `${cadence.remaining}건 남음` : "목표 달성"}
              </Badge>
            </div>
            <div style={{ marginTop: 10 }}>
              <Progress value={pct} tone={cadence.behind ? "warning" : "success"} />
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>오늘의 아이디어</span>
              <span className="mono" style={{ fontSize: 10.5, color: cadence.queueDepth >= 10 ? "var(--fg-faint)" : "var(--warning)" }}>큐 {cadence.queueDepth}</span>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {ideas.slice(0, 3).map((idea) => (
                <button
                  key={idea.id}
                  onClick={() => onNavigate("dashboard/content/queue")}
                  style={{
                    textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 9px", background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)",
                  }}
                >
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--moon-300)", flexShrink: 0 }}>{Math.round(idea.rank)}</span>
                  <span style={{ fontSize: 12, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idea.title}</span>
                </button>
              ))}
              {ideas.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>큐에 아이디어가 없습니다. Studio에서 추가하세요.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              Supabase 콘텐츠 원장이 연결되면 이번 주 발행 진척과 아이디어 큐가 여기에 표시됩니다.
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" size="sm" icon="queue" onClick={() => onNavigate("dashboard/content/queue")}>Queue 열기</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function DailyBrief({ onNavigate }) {
  const [now, setNow] = React.useState(() => new Date());
  const [blocks, setBlocks] = React.useState(TODAY_BLOCKS);
  const toggle = (i) => setBlocks(bs => bs.map((b, j) => j === i ? { ...b, done: !b.done } : b));

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hub-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', padding: 'var(--section-gap)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{formatBriefDate(now)}</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em' }}>{greetingFor(now)}, <span style={{ color: 'var(--moon-300)' }}>Hyeon</span></h1>
          <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: '60ch', lineHeight: 1.55 }}>
            5개의 신호가 오늘 결정이 필요해요. 그중 <span style={{ color: 'var(--danger)' }}>1개는 매출 리스크</span>, <span style={{ color: 'var(--warning)' }}>2개는 오늘 마감</span>.
          </div>
        </div>
        <div className="hub-page-actions" style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon="sparkle" onClick={() => onNavigate('dashboard/agents/chat')}>Ask Council</Button>
          <Button variant="outline" size="md" icon="clock">Start 15m focus</Button>
        </div>
      </div>

      <div className="hub-grid--metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        {METRICS.map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      <div className="hub-grid--split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--section-gap)' }}>
        <div>
          <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
            <Badge tone="danger" size="xs">1 urgent</Badge>
            <Badge tone="warning" size="xs">2 today</Badge>
            <Badge tone="success" size="xs">1 ok</Badge>
          </div>}>
            Signal feed
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BRIEF_SIGNALS.map(s => <SignalCard key={s.id} s={s} />)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
          <div>
            <SectionTitle right={<span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{blocks.filter(b => b.done).length}/{blocks.length}</span>}>Today</SectionTitle>
            <Card pad={false}>
              {blocks.map((b, i) => (
                <div key={i} onClick={() => toggle(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: i < blocks.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}>
                  <Checkbox checked={!!b.done} onChange={() => toggle(i)} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 38 }}>{b.time}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: b.done ? 'var(--fg-faint)' : 'var(--fg)', textDecoration: b.done ? 'line-through' : 'none' }}>{b.title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 2 }}>{b.kind}</div>
                  </div>
                  {b.tag === 'personal' && <Badge tone="personal" size="xs">Personal</Badge>}
                  {b.tag === 'company' && <Badge tone="company" size="xs">Company</Badge>}
                </div>
              ))}
            </Card>
          </div>

          <ContentCadenceCard onNavigate={onNavigate} />

          <div>
            <SectionTitle>This week rhythm</SectionTitle>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>4/5 rituals done</div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>80%</span>
              </div>
              <div style={{ marginTop: 10 }}><Progress value={80} /></div>
              <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
                {['월','화','수','목','금'].map((d, i) => (
                  <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: 28, borderRadius: 6,
                      background: i < 4 ? 'var(--moon-600)' : 'var(--surface-3)',
                      border: i === 4 ? '1px dashed var(--warning)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i < 4 && <Iconed name="check" size={12} style={{ color: 'var(--moon-100)' }} />}
                      {i === 4 && <Iconed name="clock" size={11} style={{ color: 'var(--warning)' }} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>{d}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
