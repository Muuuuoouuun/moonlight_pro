"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Avatar, Kbd } from "../hub-primitives";
import { CHAT_THREAD, COUNCIL, ORDERS } from "../hub-data";

export function AgentsChat() {
  const [input, setInput] = React.useState('');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', overflow: 'hidden' }}>
      <aside style={{ borderRight: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>Conversations</span>
          <IconButton icon="plus" size={24} iconSize={13} />
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
          {[
            { name: '뉴스레터 #47 2번 섹션', agent: 'Writer', time: '지금', active: true },
            { name: '5월 로드맵 1차', agent: 'Council', time: '2h', active: false },
            { name: 'Gmail 태그 규칙 튜닝', agent: 'Operator', time: '어제', active: false },
            { name: '리드 레퍼럴 분석', agent: 'Analyst', time: '2d', active: false },
            { name: '가격 실험 가설', agent: 'Strategist', time: '3d', active: false },
          ].map((c, i) => (
            <button key={i} style={{
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
          <Avatar name="Writer" size={26} tone="moon" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>뉴스레터 #47 2번 섹션</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Writer · content·copy specialist</div>
          </div>
          <Button variant="outline" size="sm" icon="link">Pin to Brief</Button>
        </div>

        <div className="scroll-y" style={{ flex: 1, padding: '20px 20px 10px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {CHAT_THREAD.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                {m.role === 'agent' && <Avatar name="W" size={24} tone="moon" />}
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
                    {m.text}
                  </div>
                  {m.hasAction && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <Button variant="primary" size="xs" icon="arrowRight">Open in Studio</Button>
                      <Button variant="ghost" size="xs">View alternatives</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 10 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Message Writer…" style={{
              width: '100%', minHeight: 52, resize: 'none',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--fg)', fontSize: 13.5, lineHeight: 1.5,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Button variant="ghost" size="xs" icon="upload">Attach</Button>
              <Button variant="ghost" size="xs" icon="link">Link decision</Button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>Writer · Haiku 4.5</span>
              <Button variant="primary" size="xs" icon="send">Send</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentsCouncil() {
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Council</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, maxWidth: '60ch' }}>5명의 전문 에이전트가 함께 의논. 브리핑·결정에 근거 제공.</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="sparkle">Convene</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--gap)' }}>
        {COUNCIL.map(a => (
          <Card key={a.key} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 999,
                background: 'radial-gradient(circle at 35% 30%, var(--moon-200), var(--moon-500) 60%, var(--moon-700))',
                boxShadow: '0 0 10px oklch(0.78 0.008 250 / 0.2)',
              }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{a.role}</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', marginBottom: 5 }}>Recent</div>
              {a.last}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AgentsOrders() {
  const sTone = { done: 'success', review: 'warning', draft: 'neutral' };
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Agent orders</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>에이전트에게 내린 작업 · 자동 스케줄 + 온디맨드</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">New order</Button>
      </div>
      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 100px 1fr 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>When</span><span>Assignee</span><span>Task</span><span>Status</span><span style={{ textAlign: 'right' }} />
        </div>
        {ORDERS.map((o, i) => (
          <div key={o.id} style={{
            display: 'grid', gridTemplateColumns: '110px 100px 1fr 100px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < ORDERS.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{o.at}</span>
            <span style={{ fontSize: 12, color: 'var(--moon-300)' }}>{o.to}</span>
            <span style={{ fontSize: 13 }}>{o.what}</span>
            <Badge tone={sTone[o.status]} size="xs">{o.status}</Badge>
            <div style={{ textAlign: 'right' }}>
              <Button variant="ghost" size="xs" iconRight="arrowRight">Open</Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const OFFICE_AGENTS = [
  { key: 'writer', label: 'Writer', role: 'Content · Copy', color: '#d4b5ff', x: 1, y: 1, task: '뉴스레터 #47 2번 섹션', status: 'typing', mood: '몰입' },
  { key: 'analyst', label: 'Analyst', role: 'Data · 해석', color: '#8fd4ff', x: 2, y: 1, task: '리드 17건 태그 리뷰', status: 'thinking', mood: '집중' },
  { key: 'strategist', label: 'Strategist', role: '장기·우선순위', color: '#ffd68f', x: 3, y: 1, task: '5월 플랜 초안', status: 'reading', mood: '관조' },
  { key: 'operator', label: 'Operator', role: '자동화·실행', color: '#b4e8a8', x: 0, y: 3, task: 'Gmail 태그 규칙 튜닝', status: 'running', mood: '작업' },
  { key: 'council', label: 'Council', role: '합의·결정', color: '#ffaebb', x: 2, y: 3, task: 'Thread 예약 발행 검토', status: 'meeting', mood: '논의' },
  { key: 'you', label: 'Hyeon (나)', role: 'Founder', color: '#f0e6d8', x: 4, y: 3, task: '브리핑 읽는 중', status: 'idle', mood: '휴식' },
];

const ROOM = [
  [1,1,2,2,1,1],
  [1,0,0,0,0,1],
  [1,0,3,3,0,1],
  [1,0,3,3,0,1],
  [1,4,0,0,5,1],
];

const STATUS_DOT = { typing: '#8fd4ff', thinking: '#d4b5ff', reading: '#ffd68f', running: '#b4e8a8', meeting: '#ffaebb', idle: 'var(--fg-faint)' };

function PixelRoom({ selected, onSelect }) {
  const TILE = 56;
  const rows = ROOM.length, cols = ROOM[0].length;
  const [t, setT] = React.useState(0);
  React.useEffect(() => { const id = setInterval(() => setT(v => v + 1), 500); return () => clearInterval(id); }, []);

  const tileColor = (v) => ({ 0: '#2a2d3a', 1: '#1a1c25', 2: '#6fa9d4', 3: '#524061', 4: '#3a5d3a', 5: '#5a3a2a' })[v] || '#2a2d3a';

  return (
    <div style={{
      position: 'relative',
      width: cols * TILE, height: rows * TILE,
      background: '#14161e', borderRadius: 'var(--r)',
      imageRendering: 'pixelated',
      boxShadow: 'inset 0 0 0 1px var(--line)',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {ROOM.map((row, y) => row.map((v, x) => (
        <div key={`${x},${y}`} style={{
          position: 'absolute', left: x * TILE, top: y * TILE, width: TILE, height: TILE,
          background: tileColor(v),
          boxShadow: v === 0 || v === 3 ? 'inset 0 0 0 1px rgba(255,255,255,0.03)' : 'inset 0 0 0 1px rgba(0,0,0,0.3)',
        }}>
          {v === 2 && (
            <div style={{ position: 'absolute', inset: 4, background: 'linear-gradient(135deg, #9ec8e8, #6fa9d4 50%, #4a7a9a)', boxShadow: 'inset 0 0 0 2px #14161e' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#14161e' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#14161e' }} />
            </div>
          )}
          {v === 4 && (
            <div style={{ position: 'absolute', left: 10, bottom: 6, width: 36, height: 30 }}>
              <div style={{ position: 'absolute', left: 8, bottom: 0, width: 20, height: 8, background: '#6b3a1a' }} />
              <div style={{ position: 'absolute', left: 2, bottom: 6, width: 32, height: 22, background: '#3a7d3a', borderRadius: '50% 50% 30% 30%' }} />
              <div style={{ position: 'absolute', left: 8, bottom: 10, width: 10, height: 14, background: '#5aa05a', borderRadius: '50%' }} />
            </div>
          )}
          {v === 5 && (
            <div style={{ position: 'absolute', inset: 6, background: '#7a5030', boxShadow: 'inset 0 0 0 2px #5a3a1a' }}>
              <div style={{ position: 'absolute', right: 6, top: '50%', width: 3, height: 3, background: '#ffd68f' }} />
            </div>
          )}
        </div>
      )))}

      {OFFICE_AGENTS.map(a => {
        const px = a.x * TILE, py = a.y * TILE;
        const isSel = selected === a.key;
        const bob = (t + a.x + a.y) % 2 === 0 ? 0 : -1;
        return (
          <button key={a.key} onClick={() => onSelect(a.key)} style={{
            position: 'absolute', left: px, top: py, width: TILE, height: TILE,
            padding: 0, background: 'transparent', cursor: 'pointer',
          }}>
            <div style={{
              position: 'absolute', left: 6, top: 22, width: TILE - 12, height: 18,
              background: '#6a4a2a', boxShadow: 'inset 0 -3px 0 #4a2e1a, inset 0 1px 0 #8a6a3a',
            }} />
            <div style={{
              position: 'absolute', left: 14, top: 8, width: 20, height: 16,
              background: '#1a1c25', boxShadow: 'inset 0 0 0 1px #3a3d48',
            }}>
              <div style={{ position: 'absolute', inset: 2, background: a.color, opacity: a.status === 'idle' ? 0.3 : 0.9 }}>
                {a.status !== 'idle' && (
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(${(t * 37) % 360}deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)` }} />
                )}
              </div>
            </div>
            <div style={{ position: 'absolute', left: 36, top: 18 + bob, width: 12, height: 14 }}>
              <div style={{ position: 'absolute', left: 2, top: 0, width: 8, height: 7, background: '#f0c8a0', boxShadow: 'inset 0 -2px 0 #d0a880' }} />
              <div style={{ position: 'absolute', left: 1, top: 0, width: 10, height: 3, background: '#2a1a10' }} />
              <div style={{ position: 'absolute', left: 3, top: 3, width: 1, height: 1, background: '#14161e' }} />
              <div style={{ position: 'absolute', left: 7, top: 3, width: 1, height: 1, background: '#14161e' }} />
              <div style={{ position: 'absolute', left: 1, top: 7, width: 10, height: 7, background: a.color, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.3)' }} />
            </div>
            <div style={{
              position: 'absolute', left: 40, top: 2 + bob,
              width: 4, height: 4, borderRadius: 999,
              background: STATUS_DOT[a.status],
              boxShadow: `0 0 6px ${STATUS_DOT[a.status]}`,
              animation: a.status !== 'idle' ? 'mlMoonPulse 1.2s ease-in-out infinite' : 'none',
            }} />
            {a.status === 'typing' && t % 2 === 0 && (
              <div style={{ position: 'absolute', left: TILE - 14, top: 4, fontSize: 7, color: STATUS_DOT.typing, fontFamily: 'monospace' }}>▯</div>
            )}
            {isSel && (
              <div style={{
                position: 'absolute', inset: -2, border: '2px solid var(--moon-200)',
                borderRadius: 4, pointerEvents: 'none',
                boxShadow: '0 0 16px oklch(0.78 0.04 280 / 0.4)',
              }} />
            )}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: -2,
              textAlign: 'center', fontSize: 8.5, color: 'var(--fg-muted)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
              textShadow: '0 1px 0 #000',
            }}>{a.label}</div>
          </button>
        );
      })}

      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: 60 + (i * 23 + t * 3) % 200,
          top: 20 + ((i * 17 + t * 2) % 60),
          width: 2, height: 2, borderRadius: 999,
          background: 'rgba(255,220,180,0.25)',
        }} />
      ))}
    </div>
  );
}

const OFFICE_FEED = [
  { at: '지금', who: 'Writer', ev: '초안 2번 섹션 860자 작성 완료', tone: 'info' },
  { at: '2분 전', who: 'Analyst', ev: '리드 17건 중 4건에 "레퍼럴" 태그 추가', tone: 'moon' },
  { at: '5분 전', who: 'Operator', ev: 'Gmail 규칙 v3 배포 · 오탐 -82%', tone: 'success' },
  { at: '8분 전', who: 'Strategist', ev: '5월 플랜 초안에 3개 섹션 추가', tone: 'info' },
  { at: '12분 전', who: 'Council', ev: 'Thread 예약 발행 최종 승인 대기', tone: 'warning' },
  { at: '18분 전', who: 'Writer', ev: '제목 A/B 3안 생성', tone: 'info' },
  { at: '25분 전', who: 'Analyst', ev: '전환 대시보드 새로고침 · 주간 +3.2%', tone: 'success' },
];

export function AgentsOffice() {
  const [sel, setSel] = React.useState('writer');
  const agent = OFFICE_AGENTS.find(a => a.key === sel) || OFFICE_AGENTS[0];
  const liveCount = OFFICE_AGENTS.filter(a => a.status !== 'idle').length;

  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>VR Office</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>에이전트가 일하는 방을 한눈에. 실시간 신호·활동을 공간으로 느끼기.</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 12, fontSize: 12, color: 'var(--fg-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', boxShadow: '0 0 8px var(--success)', animation: 'mlMoonPulse 1.2s ease-in-out infinite' }} />
            <span className="mono">{liveCount} / {OFFICE_AGENTS.length} active</span>
          </div>
        </div>
        <Button variant="outline" size="sm" icon="eye">Fullscreen</Button>
        <Button variant="secondary" size="sm" icon="sparkle" style={{ marginLeft: 8 }}>Convene all</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 300px', gap: 'var(--gap)', alignItems: 'start' }}>
        <Card pad={false} style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: 'var(--surface-2)' }}>
          <PixelRoom selected={sel} onSelect={setSel} />
          <div style={{ display: 'flex', gap: 16, fontSize: 10.5, color: 'var(--fg-faint)' }}>
            {Object.entries(STATUS_DOT).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: v }} />
                <span className="mono">{k}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: agent.color,
              boxShadow: 'inset 0 0 0 2px var(--line)',
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 4, background: '#14161e', opacity: 0.15, borderRadius: 4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{agent.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{agent.role}</div>
            </div>
            <Badge tone={agent.status === 'idle' ? 'neutral' : 'moon'} size="xs">{agent.status}</Badge>
          </div>
          <div style={{ padding: '12px 0', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 4 }}>Current task</div>
              <div style={{ fontSize: 13 }}>{agent.task}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 4 }}>Mood</div>
              <div style={{ fontSize: 13 }}>{agent.mood}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last 10m</div>
            {OFFICE_FEED.filter(f => f.who === agent.label).slice(0, 3).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--fg-muted)' }}>
                <span className="mono" style={{ color: 'var(--fg-faint)', minWidth: 46 }}>{f.at}</span>
                <span style={{ flex: 1 }}>{f.ev}</span>
              </div>
            ))}
            {OFFICE_FEED.filter(f => f.who === agent.label).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>최근 활동 없음 · idle</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <Button variant="primary" size="sm" icon="chat">Open chat</Button>
            <Button variant="outline" size="sm" icon="orders">Give order</Button>
            <div style={{ flex: 1 }} />
            <IconButton icon="more" />
          </div>
        </Card>

        <Card pad={false}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>Live feed</div>
            <Kbd>L</Kbd>
          </div>
          <div className="scroll-y" style={{ maxHeight: 420 }}>
            {OFFICE_FEED.map((f, i) => (
              <div key={i} style={{
                padding: '10px 14px',
                borderBottom: i < OFFICE_FEED.length - 1 ? '1px solid var(--line-soft)' : 'none',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <Dot tone={f.tone} />
                  <span style={{ color: 'var(--moon-300)', fontWeight: 500 }}>{f.who}</span>
                  <div style={{ flex: 1 }} />
                  <span className="mono" style={{ color: 'var(--fg-faint)' }}>{f.at}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>{f.ev}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Room presets</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>방 분위기는 시간대·작업 모드에 따라 자동 전환.</div>
          </div>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>auto · 18:24</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { k: 'morning', label: 'Morning', sub: '05–09 · 조용 · 창 밝음', active: false },
            { k: 'focus', label: 'Focus', sub: '09–13 · 딥워크', active: false },
            { k: 'council', label: 'Council', sub: '회의 모드 · 중앙 테이블', active: false },
            { k: 'evening', label: 'Evening', sub: '17–22 · 램프 따뜻', active: true },
          ].map(p => (
            <button key={p.k} style={{
              padding: 12, textAlign: 'left',
              background: p.active ? 'var(--surface-3)' : 'var(--surface-2)',
              border: p.active ? '1px solid var(--moon-500)' : '1px solid var(--line-soft)',
              borderRadius: 'var(--r-sm)',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{p.sub}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
