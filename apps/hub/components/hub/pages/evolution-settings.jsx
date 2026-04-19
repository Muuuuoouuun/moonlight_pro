"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, Button, Avatar, Tabs, SectionTitle, Kbd } from "../hub-primitives";
import { EVOLUTION_LOG } from "../hub-data";

const PLAYBOOK_FAMILIES = [
  { key: 'delivery', label: 'Delivery',  tone: 'info',     count: 2, detail: 'GitHub PR · 이슈 압력 · 빠른 담당 지정' },
  { key: 'planning', label: 'Planning',  tone: 'moon',     count: 1, detail: '리듬 · 로드맵 · 주간 리셋 루프' },
  { key: 'content',  label: 'Content',   tone: 'success',  count: 1, detail: '브랜드 발행 루프 · 큐 분류 · Studio 핸드오프' },
  { key: 'revenue',  label: 'Revenue',   tone: 'warning',  count: 1, detail: '리드 후속 · 계정 관리 · 딜 이동 점검' },
  { key: 'recovery', label: 'Recovery',  tone: 'danger',   count: 1, detail: '로그 · 실패 · 사람의 빠른 개입' },
];

const PLAYBOOK_CATALOG = [
  { name: 'Daily Delivery Sweep',   family: 'delivery', cadence: 'Daily',    trigger: '09:00 · 열린 PR / stale review',  owner: 'Me' },
  { name: 'Incident Escalation',    family: 'recovery', cadence: 'On alert', trigger: 'Run log err · uptime drop',        owner: 'Operator' },
  { name: 'Weekly Planning Reset',  family: 'planning', cadence: 'Weekly',   trigger: '금 16:00 · Rhythm 4/5 미달 시',     owner: 'Me' },
  { name: 'Publish Review Loop',    family: 'content',  cadence: 'Daily',    trigger: 'Queue draft ≥ 2 · 발행 4h 전',      owner: 'Writer' },
  { name: 'Deal Movement Check',    family: 'revenue',  cadence: 'Weekly',   trigger: 'Neg 단계 ≥ 10일 정체',              owner: 'Me' },
  { name: 'Referral Follow-up',     family: 'revenue',  cadence: 'Daily',    trigger: 'Referral lead 무응답 ≥ 2일',         owner: 'Me' },
];

const QUICK_COMMANDS = [
  { slash: '/brief',     label: '아침 브리프 열기',    dest: 'dashboard/daily-brief',        tone: 'moon' },
  { slash: '/work',      label: 'Work OS 집중 모드',   dest: 'dashboard/work/projects',      tone: 'info' },
  { slash: '/studio',    label: 'Studio 드래프트',     dest: 'dashboard/content/studio',     tone: 'success' },
  { slash: '/pipeline',  label: 'Revenue 파이프라인',  dest: 'dashboard/revenue/overview',   tone: 'warning' },
  { slash: '/flows',     label: 'Flow 캔버스 열기',    dest: 'dashboard/automations/flows',  tone: 'moon' },
  { slash: '/council',   label: 'Council 소집',        dest: 'dashboard/agents/council',     tone: 'info' },
  { slash: '/office',    label: 'VR Office 라이브',    dest: 'dashboard/agents/office',      tone: 'moon' },
  { slash: '/runs',      label: '자동화 Run log',      dest: 'dashboard/automations/runs',   tone: 'danger' },
];

export function Evolution({ onNavigate }) {
  const tagTone = { upgrade: 'moon', bug: 'danger', insight: 'info', note: 'neutral' };
  return (
    <div style={{ padding: 'var(--section-gap)', maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Evolution</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch', lineHeight: 1.5 }}>시스템이 어떻게 변하고 있는지 · 바꾸는 법(Playbooks) · 실행하는 법(Commands) · 기록(Log)</div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs tabs={[{key:'all',label:'All'},{key:'up',label:'Upgrades'},{key:'issue',label:'Issues'},{key:'insight',label:'Insights'}]} active="all" onChange={()=>{}} style={{ borderBottom: 'none' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--gap)' }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>System version</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 8 }}>v2.3.1</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>shipped 오늘 07:12</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Open issues</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 500 }}>2</div>
            <Badge tone="warning" size="xs">1 bug · 1 watch</Badge>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Uptime · 30d</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: 'var(--success)' }}>99.96%</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>1 incident · 7m</div>
        </Card>
      </div>

      {/* Playbooks — how the system changes */}
      <div>
        <SectionTitle subtitle="운영 절차 · 시스템을 바꾸는 방법" right={<Button variant="outline" size="xs" icon="plus">Playbook</Button>}>
          Playbooks
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
          {PLAYBOOK_FAMILIES.map(f => (
            <Card key={f.key} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Dot tone={f.tone} size={8} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{f.count}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{f.detail}</div>
            </Card>
          ))}
        </div>
        <Card pad={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 1fr 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span>Playbook</span><span>Family</span><span>Cadence</span><span>Trigger</span><span>Owner</span><span style={{ textAlign: 'right' }} />
          </div>
          {PLAYBOOK_CATALOG.map((p, i) => {
            const fam = PLAYBOOK_FAMILIES.find(f => f.key === p.family);
            return (
              <div key={p.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 110px 1fr 100px 80px',
                padding: '12px 16px', alignItems: 'center', gap: 10,
                borderBottom: i < PLAYBOOK_CATALOG.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Iconed name="folder" size={13} style={{ color: 'var(--fg-faint)' }} />
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                </div>
                <Badge tone={fam.tone} size="xs">{fam.label}</Badge>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{p.cadence}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.trigger}</span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{p.owner}</span>
                <div style={{ textAlign: 'right' }}>
                  <Button variant="ghost" size="xs" iconRight="arrowRight">Run</Button>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Commands — how the system is operated */}
      <div>
        <SectionTitle
          subtitle="빠른 이동 + 슬래시 커맨드 · 시스템을 실행하는 방법"
          right={<span style={{ fontSize: 10.5, color: 'var(--fg-faint)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>⌘</Kbd><Kbd>K</Kbd> palette</span>}
        >
          Commands
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap)' }}>
          {QUICK_COMMANDS.map(c => (
            <button key={c.slash} onClick={() => onNavigate?.(c.dest)} style={{
              textAlign: 'left', padding: 'var(--card-pad)',
              background: 'var(--surface)', border: '1px solid var(--line-soft)',
              borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)',
              display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
              transition: 'border-color .15s ease, transform .1s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-soft)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot tone={c.tone} />
                <span className="mono" style={{ fontSize: 12, color: 'var(--moon-300)' }}>{c.slash}</span>
                <div style={{ flex: 1 }} />
                <Iconed name="arrowRight" size={12} style={{ color: 'var(--fg-faint)' }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg)' }}>{c.label}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>→ /{c.dest}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Log — what's actually changing */}
      <div>
        <SectionTitle>Log</SectionTitle>
        <Card pad={false}>
          {EVOLUTION_LOG.map((e, i) => (
            <div key={i} style={{ padding: '14px 18px', borderBottom: i < EVOLUTION_LOG.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 100, flexShrink: 0, paddingTop: 2 }}>{e.at}</span>
              <Badge tone={tagTone[e.tag]} size="xs" style={{ flexShrink: 0 }}>{e.tag}</Badge>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, flex: 1 }}>{e.msg}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function CopyRow({ value, mono }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
      padding: '5px 6px 5px 10px',
    }}>
      <span className={mono ? 'mono' : ''} style={{ flex: 1, fontSize: 12, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
      <button onClick={copy} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 8px',
        background: copied ? 'var(--success)' : 'var(--surface)',
        color: copied ? '#fff' : 'var(--fg-muted)',
        border: '1px solid var(--line)', borderRadius: 4,
        fontSize: 11, fontFamily: 'var(--font-sans)',
        transition: 'background .15s, color .15s',
      }}>
        <Iconed name={copied ? 'check' : 'copy'} size={11} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function KeyRow({ item, last, kind }) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const displayValue = (() => {
    if (kind === 'key') return revealed ? item.id : `mk_live_${'•'.repeat(28)}${item.id.slice(-4)}`;
    if (kind === 'webhook') return `https://hooks.moonlight.pro/v1/in/wsp_2k9f4/${item.slug}`;
    if (kind === 'outgoing') return item.url;
    return '';
  })();

  const copy = () => {
    navigator.clipboard?.writeText(displayValue).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div style={{
      padding: '12px 18px',
      borderBottom: last ? 'none' : '1px solid var(--line-soft)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: kind === 'key' ? 'oklch(0.40 0.008 250 / 0.25)' : kind === 'outgoing' ? 'oklch(0.30 0.05 155 / 0.25)' : 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: kind === 'key' ? 'var(--moon-300)' : kind === 'outgoing' ? 'var(--success)' : 'var(--fg-muted)',
        }}>
          <Iconed name={kind === 'key' ? 'lock' : kind === 'outgoing' ? 'send' : 'webhook'} size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            {kind === 'key' ? item.name : (
              <>
                <span className="mono" style={{ fontSize: 12.5 }}>/{item.slug}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontWeight: 400 }}>· {item.source}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
            {kind === 'key' && (<>
              <span>scope: <span className="mono">{item.scopes}</span></span>
              <span>·</span>
              <span className="mono">{item.created}</span>
              <span>·</span>
              <span>last used {item.lastUsed}</span>
            </>)}
            {kind !== 'key' && (<>
              <span className="mono">{item.events}</span>
              <span>·</span>
              <span>{item.hits24} hits / 24h</span>
              <span>·</span>
              <span>{item.last}</span>
            </>)}
          </div>
        </div>
        {kind !== 'key' && <Badge tone={item.active ? 'success' : 'neutral'} size="xs">{item.active ? 'active' : 'paused'}</Badge>}
        {kind === 'key' && (
          <button onClick={() => setRevealed(r => !r)} title={revealed ? 'Hide' : 'Reveal'} style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
            color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Iconed name="eye" size={12} />
          </button>
        )}
        <button onClick={copy} title="Copy" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 10px',
          background: copied ? 'var(--success)' : 'var(--surface-2)',
          color: copied ? '#fff' : 'var(--fg-muted)',
          border: '1px solid var(--line-soft)', borderRadius: 6,
          fontSize: 11, transition: 'background .15s, color .15s',
        }}>
          <Iconed name={copied ? 'check' : 'copy'} size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mono" style={{
        fontSize: 11.5, color: 'var(--fg-muted)',
        background: 'var(--surface-2)', border: '1px dashed var(--line-soft)', borderRadius: 'var(--r-sm)',
        padding: '6px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{displayValue}</div>
    </div>
  );
}

export function Settings() {
  return (
    <div style={{ padding: 'var(--section-gap)', maxWidth: 900, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Settings</h2>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>Workspace · integrations · profile</div>
      </div>

      <div>
        <SectionTitle>Profile</SectionTitle>
        <Card>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name="Hyeon Park" size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Hyeon Park</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>hyeon@moonlight.pro · Founder · KST</div>
            </div>
            <Button variant="outline" size="sm">Edit</Button>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Integrations</SectionTitle>
        <Card pad={false}>
          {[
            { n: 'Google Calendar', s: 'Connected', t: 'success', i: 'calendar' },
            { n: 'Gmail', s: 'Connected', t: 'success', i: 'inbox' },
            { n: 'Resend', s: 'Connected', t: 'success', i: 'send' },
            { n: 'Stripe', s: 'Connected', t: 'success', i: 'revenue' },
            { n: 'Notion', s: 'Read-only', t: 'warning', i: 'content' },
            { n: 'Slack', s: 'Not connected', t: 'neutral', i: 'chat' },
          ].map((it, i, arr) => (
            <div key={it.n} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
                <Iconed name={it.i} size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.n}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{it.s}</div>
              </div>
              <Badge tone={it.t} size="xs">{it.s}</Badge>
              <Button variant="ghost" size="sm">{it.s === 'Not connected' ? 'Connect' : 'Manage'}</Button>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionTitle>API keys</SectionTitle>
        <Card pad={false}>
          {[
            { name: 'Default (personal)', id: 'mk_live_9f2c7a31b4e88d05c1a3b9e7f4d6a28b', scopes: 'read · write', created: '2025-02-14', lastUsed: '3분 전' },
            { name: 'Gmail automation', id: 'mk_live_b41e7f0d2a9c4683de5f1b7a9c02e3d4', scopes: 'automations', created: '2025-03-02', lastUsed: '12분 전' },
            { name: 'Newsletter pipeline', id: 'mk_live_c83d1a9e5f2b46078e41d37c92b5a6f8', scopes: 'content · automations', created: '2025-03-19', lastUsed: '어제' },
            { name: 'Claude Code (local)', id: 'mk_live_4e71f2c806a9d34b7c1f8e25ad09b6c3', scopes: 'read-only', created: '2025-04-01', lastUsed: '5일 전' },
          ].map((k, i, arr) => (
            <KeyRow key={k.id} item={k} last={i === arr.length - 1} kind="key" />
          ))}
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
            <Iconed name="plus" size={12} style={{ color: 'var(--fg-faint)' }} />
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>새 API 키 발급</span>
            <div style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="plus">Create key</Button>
          </div>
        </Card>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Iconed name="eye" size={11} /> 키는 발급 직후 한 번만 전체 노출됩니다. 이후에는 마지막 4자리만 표시돼요.
        </div>
      </div>

      <div>
        <SectionTitle>Webhooks</SectionTitle>
        <Card pad={false}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)' }}>Incoming base URL</div>
              <div style={{ flex: 1 }} />
              <Badge tone="success" size="xs">live</Badge>
            </div>
            <CopyRow value="https://hooks.moonlight.pro/v1/in/wsp_2k9f4" mono />
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
              외부 서비스에서 이 기본 URL에 <code className="mono" style={{ fontSize: 10.5, padding: '1px 5px', background: 'var(--surface-3)', borderRadius: 4 }}>/{'<slug>'}</code>를 붙여 POST 요청을 보냅니다.
            </div>
          </div>
          {[
            { slug: 'stripe-payments', source: 'Stripe', events: 'payment_succeeded · refunded', hits24: 4, last: '1시간 전', active: true },
            { slug: 'calendly-invites', source: 'Calendly', events: 'invitee.created · canceled', hits24: 2, last: '3시간 전', active: true },
            { slug: 'github-deploys', source: 'GitHub', events: 'deployment_status', hits24: 11, last: '14분 전', active: true },
            { slug: 'ghost-newsletter', source: 'Ghost', events: 'post.published', hits24: 0, last: '3일 전', active: false },
          ].map((w, i, arr) => (
            <KeyRow key={w.slug} item={w} last={i === arr.length - 1} kind="webhook" />
          ))}
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
            <Iconed name="webhook" size={12} style={{ color: 'var(--fg-faint)' }} />
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Outgoing webhooks · 발생 이벤트를 외부로 푸시</span>
            <div style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="plus">Add endpoint</Button>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Outgoing webhooks</SectionTitle>
        <Card pad={false}>
          {[
            { slug: 'zapier-leads', source: 'Zapier', events: 'lead.created', hits24: 7, last: '22분 전', active: true, url: 'https://hooks.zapier.com/hooks/catch/1823945/b2k9f4' },
            { slug: 'slack-revenue', source: 'Slack', events: 'payment.succeeded', hits24: 4, last: '1시간 전', active: true, url: 'https://hooks.slack.com/services/T01/B02/xPlBk9f4q1' },
            { slug: 'make-content', source: 'Make', events: 'content.published', hits24: 1, last: '어제', active: true, url: 'https://hook.eu2.make.com/a7f3b29c4e1d' },
          ].map((w, i, arr) => (
            <KeyRow key={w.slug} item={w} last={i === arr.length - 1} kind="outgoing" />
          ))}
        </Card>
      </div>

      <div>
        <SectionTitle>Labels</SectionTitle>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            리드 · 딜 · 계정에서 사용하는 구분 라벨. Personal은 개인 단위, Company는 법인/팀 단위.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge tone="personal"><Iconed name="user" size={10} /> Personal</Badge>
            <Badge tone="company"><Iconed name="building" size={10} /> Company</Badge>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Danger zone</SectionTitle>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Export workspace</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 3 }}>모든 데이터를 JSON + Markdown으로 내보내기</div>
            </div>
            <Button variant="outline" size="sm" icon="download">Export</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
