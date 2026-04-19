"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Dot, Card, IconButton, Button, Progress, Tabs, Kbd, Placeholder, SectionTitle } from "../hub-primitives";
import { CONTENT_QUEUE, CAMPAIGNS } from "../hub-data";

export function Studio() {
  const [mode, setMode] = React.useState('blog');
  const [title, setTitle] = React.useState('결정을 기록하는 노트의 구조');
  const [body, setBody] = React.useState(
`1인 창업자에게 결정은 공기처럼 흐른다. 매일 수십 개. 그런데도 대부분 기억에
남지 않는다. 이 글에서 내가 쓰는 결정 노트의 네 칸 구조를 공유한다.

## 네 칸

1. 맥락 — 왜 지금 결정해야 하는가
2. 선택 — 무엇을 선택했는가 (그리고 무엇을 선택하지 않았는가)
3. 근거 — 어떤 데이터·직관·제약이 작용했는가
4. 회고 — 2주 후 이 결정은 어떻게 보이는가

## 한 가지 예시

지난달 가격 티어를 3개에서 2개로 줄였다. 맥락은 중간 티어 이탈률 38%. 선택은
단순화. 근거는 전환 분석과 '선택의 피로' 가설. 회고는 2주 후…`
  );
  const [slides, setSlides] = React.useState([
    { id: 's1', bg: 'oklch(0.35 0.04 280)', title: '결정 노트: 네 칸이면 충분하다', sub: '1인 창업자를 위한 기록법' },
    { id: 's2', bg: 'oklch(0.35 0.05 220)', title: '맥락', sub: '왜 지금 결정해야 하는가' },
    { id: 's3', bg: 'oklch(0.35 0.05 180)', title: '선택', sub: '무엇을 선택했고 무엇을 버렸나' },
    { id: 's4', bg: 'oklch(0.35 0.05 150)', title: '근거', sub: '데이터·직관·제약' },
    { id: 's5', bg: 'oklch(0.35 0.05 85)', title: '회고', sub: '2주 후 되돌아보기' },
    { id: 's6', bg: 'oklch(0.35 0.06 30)', title: '한 가지 예시', sub: '가격 티어 3→2' },
    { id: 's7', bg: 'oklch(0.28 0.01 250)', title: '저장하세요', sub: '@moonlight.pro' },
  ]);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [drag, setDrag] = React.useState(null);
  const [extraSuggestions, setExtraSuggestions] = React.useState([]);
  const [pendingSend, setPendingSend] = React.useState(null); // 'publish' | 'schedule' | null
  const [lastSentAt, setLastSentAt] = React.useState(null);

  const formatTime = (d) => {
    try {
      return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    } catch {
      return d.toISOString().slice(11, 19);
    }
  };

  async function dispatchEmail(action) {
    setPendingSend(action);
    const startedAt = Date.now();
    const dryRun = action === 'schedule';
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: dryRun ? 'dry-run' : 'send',
          channel: 'resend',
          to: 'me@moonlight.pro',
          recipientEmail: 'me@moonlight.pro',
          subject: title,
          body,
          dryRun,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const elapsed = Date.now() - startedAt;
      if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed));

      if (!response.ok && data.status !== 'preview' && data.status !== 'sent') {
        const msg = data.error || data.message || `HTTP ${response.status}`;
        setExtraSuggestions(s => [{ tone: 'danger', text: `발행 실패 — ${msg}` }, ...s]);
        return;
      }

      const now = new Date();
      setLastSentAt(now);
      if (dryRun) {
        const detail = data.message || data.status || 'ok';
        setExtraSuggestions(s => [{ tone: 'info', text: `dry-run · ${detail}` }, ...s]);
      } else {
        const id = data.id ?? data.preview?.id ?? 'preview';
        setExtraSuggestions(s => [{ tone: 'info', text: `발행 요청 — id: ${id}` }, ...s]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExtraSuggestions(s => [{ tone: 'danger', text: `발행 실패 — ${msg}` }, ...s]);
    } finally {
      setPendingSend(null);
    }
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(wordCount / 180));

  const moveSlide = (from, to) => {
    if (from === to) return;
    setSlides(s => { const n = s.slice(); const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    setActiveSlide(to);
  };
  const addSlide = () => setSlides(s => [...s, { id: 'new-' + Date.now(), bg: 'oklch(0.3 0.02 250)', title: 'New slide', sub: '' }]);
  const updateSlide = (i, patch) => setSlides(s => s.map((x, j) => j === i ? { ...x, ...patch } : x));
  const removeSlide = (i) => setSlides(s => s.filter((_, j) => j !== i));

  const cur = slides[activeSlide] || slides[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: 2 }}>
            {[{k:'blog',l:'Blog / Newsletter'},{k:'carousel',l:'Carousel'}].map(m => (
              <button key={m.k} onClick={() => setMode(m.k)} style={{
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4,
                color: mode === m.k ? 'var(--fg)' : 'var(--fg-faint)',
                background: mode === m.k ? 'var(--surface-3)' : 'transparent',
              }}>{m.l}</button>
            ))}
          </div>
          <Badge tone="warning" size="xs">Draft</Badge>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {mode === 'blog' ? <>Newsletter · <span className="mono">NL-047</span></> : <>Carousel · <span className="mono">CR-012</span> · {slides.length} slides</>}
          </span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {lastSentAt
              ? `sent · ${formatTime(lastSentAt)}`
              : mode === 'blog'
              ? `saved 12s ago · ${wordCount} words · ${readingTime}min read`
              : `saved 8s ago · ${slides.length} slides · Instagram 1080×1080`}
          </span>
          <IconButton icon="eye" tooltip="Preview" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatchEmail('schedule')}
          >
            {pendingSend === 'schedule' ? 'Sending…' : 'Schedule'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="send"
            onClick={() => dispatchEmail('publish')}
          >
            {pendingSend === 'publish' ? 'Sending…' : 'Publish'}
          </Button>
        </div>

        {mode === 'blog' && (
          <>
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 4, flexShrink: 0 }}>
              {[
                { i: 'sparkle', t: 'AI' }, { t: '|' }, { l: 'H1' }, { l: 'H2' }, { l: 'B', style: { fontWeight: 700 } },
                { l: 'i', style: { fontStyle: 'italic' } }, { t: '|' }, { i: 'link' }, { i: 'upload', t: 'Image' },
              ].map((b, i) => b.t === '|' ? <div key={i} style={{ width: 1, background: 'var(--line-soft)', margin: '0 2px' }} /> : (
                <button key={i} style={{ height: 26, padding: '0 9px', borderRadius: 4, fontSize: 11.5, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, ...(b.style || {}) }}>
                  {b.i && <Iconed name={b.i} size={12} />}
                  {b.l && <span>{b.l}</span>}
                  {b.t && <span>{b.t}</span>}
                </button>
              ))}
            </div>
            <div className="scroll-y" style={{ flex: 1, padding: '40px 20px' }}>
              <div style={{ maxWidth: 680, margin: '0 auto' }}>
                <input value={title} onChange={e => setTitle(e.target.value)} style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4,
                }} />
                <div style={{ fontSize: 13, color: 'var(--fg-faint)', marginBottom: 28 }}>By Hyeon Park · 4월 18일 · 오늘 18:00 발행 예정</div>
                <textarea value={body} onChange={e => setBody(e.target.value)} style={{
                  width: '100%', minHeight: 420, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                  color: 'var(--fg)', fontSize: 15, lineHeight: 1.7, fontFamily: 'var(--font-sans)', letterSpacing: '-0.005em',
                }} />
                <div style={{ marginTop: 24 }}>
                  <Placeholder label="inline figure — decision note 4-box" h={220} />
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 6 }}>Figure 1 · 네 칸 구조 다이어그램</div>
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'carousel' && (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
              {slides.map((s, i) => (
                <div key={s.id}
                  draggable onDragStart={() => setDrag(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => drag !== null && moveSlide(drag, i)}
                  onClick={() => setActiveSlide(i)}
                  style={{
                    width: 72, height: 72, flexShrink: 0, position: 'relative', cursor: 'grab',
                    borderRadius: 8, background: s.bg,
                    border: activeSlide === i ? '2px solid var(--moon-200)' : '1px solid var(--line-soft)',
                    display: 'flex', flexDirection: 'column', padding: 6, justifyContent: 'flex-end',
                    color: '#fff', fontSize: 8, lineHeight: 1.2,
                    opacity: drag === i ? 0.4 : 1,
                  }}>
                  <div style={{ fontWeight: 600 }}>{s.title.slice(0, 18)}</div>
                  <div style={{ position: 'absolute', top: 3, left: 6, fontSize: 8, color: 'rgba(255,255,255,0.6)' }} className="mono">{i + 1}</div>
                </div>
              ))}
              <button onClick={addSlide} style={{
                width: 72, height: 72, flexShrink: 0, border: '1px dashed var(--line)', borderRadius: 8,
                background: 'var(--surface-2)', color: 'var(--fg-muted)', fontSize: 20,
              }}>＋</button>
            </div>

            <div className="scroll-y" style={{ flex: 1, padding: 'var(--section-gap)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 420, height: 420, background: cur.bg, borderRadius: 12,
                  position: 'relative', overflow: 'hidden',
                  boxShadow: '0 20px 60px -20px oklch(0 0 0 / 0.5)',
                }}>
                  <div className="mono" style={{ position: 'absolute', top: 16, left: 18, fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em' }}>
                    {String(activeSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                  </div>
                  <div style={{ position: 'absolute', bottom: 28, left: 28, right: 28, color: '#fff' }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{cur.sub}</div>
                    <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{cur.title}</div>
                  </div>
                  <div style={{ position: 'absolute', top: 18, right: 18, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>@moonlight.pro</div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {slides.map((_, i) => (
                    <div key={i} style={{
                      width: i === activeSlide ? 16 : 6, height: 6, borderRadius: 999,
                      background: i === activeSlide ? 'var(--moon-200)' : 'var(--surface-3)',
                      transition: 'width .15s',
                    }} />
                  ))}
                </div>
              </div>

              <Card style={{ width: 320 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-faint)', marginBottom: 10 }}>Slide {activeSlide + 1}</div>
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Title</label>
                <input value={cur.title} onChange={e => updateSlide(activeSlide, { title: e.target.value })}
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none' }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Subtitle</label>
                <input value={cur.sub} onChange={e => updateSlide(activeSlide, { sub: e.target.value })}
                  style={{ width: '100%', marginTop: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none' }} />
                <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Background</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {['oklch(0.35 0.04 280)','oklch(0.35 0.05 220)','oklch(0.35 0.05 180)','oklch(0.35 0.05 150)','oklch(0.35 0.05 85)','oklch(0.35 0.06 30)','oklch(0.28 0.01 250)','oklch(0.95 0 0)'].map(c => (
                    <button key={c} onClick={() => updateSlide(activeSlide, { bg: c })}
                      style={{ width: 26, height: 26, borderRadius: 6, background: c, border: cur.bg === c ? '2px solid var(--moon-200)' : '1px solid var(--line-soft)' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="outline" size="xs" icon="upload">Photo</Button>
                  <div style={{ flex: 1 }} />
                  <Button variant="ghost" size="xs" onClick={() => removeSlide(activeSlide)}>Delete</Button>
                </div>
                <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  <Iconed name="sparkle" size={11} style={{ color: 'var(--moon-300)' }} /> 드래그로 순서 편집 · 썸네일 클릭으로 선택
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      <aside style={{ borderLeft: '1px solid var(--line-soft)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Iconed name="sparkle" size={14} style={{ color: 'var(--moon-300)' }} />
          <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>Writer · Studio Agent</div>
        </div>
        <div className="scroll-y" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>Suggestions</div>
          {[...extraSuggestions, ...(mode === 'blog' ? [
            { tone: 'info', text: '제목 A/B: "결정 노트: 네 칸이면 충분하다"' },
            { tone: 'moon', text: '"네 칸" 섹션 끝에 독자 질문 한 줄 추가 추천' },
            { tone: 'warning', text: '중복 표현 감지: "기억에 남지 않는다" (2회)' },
          ] : [
            { tone: 'info', text: '카드 1 훅 강화: 숫자를 앞에 — "4칸"' },
            { tone: 'moon', text: '카드 2–5 배경색 톤을 한 계열로 통일 추천' },
            { tone: 'warning', text: '마지막 카드 CTA 누락 — 저장/공유 유도' },
          ])].map((s, i) => (
            <div key={i} style={{
              padding: '10px 11px', background: 'var(--surface-2)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
              fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><Dot tone={s.tone} /></div>
              {s.text}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button variant="outline" size="xs">Apply</Button>
                <Button variant="ghost" size="xs">Skip</Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--fg-faint)', letterSpacing: '0.1em', marginTop: 8 }}>Settings</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Channel</span><span style={{ color: 'var(--fg)' }}>{mode === 'blog' ? 'Email (Resend)' : 'Instagram + X'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span>Audience</span><span style={{ color: 'var(--fg)' }}>{mode === 'blog' ? '2,143 subscribers' : '공개'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Schedule</span><span style={{ color: 'var(--fg)' }}>오늘 18:00</span>
            </div>
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)' }}>
            <Iconed name="sparkle" size={12} style={{ color: 'var(--moon-300)' }} />
            <input placeholder={mode === 'blog' ? 'Ask Writer…' : 'Ask Studio — slide copy, layout…'} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 12 }} />
            <Kbd>⏎</Kbd>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Queue() {
  const statusTone = { Draft: 'warning', Scheduled: 'info', Review: 'moon', Idea: 'neutral', Outline: 'neutral', Published: 'success' };
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Publishing queue</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{CONTENT_QUEUE.length} items in pipeline</div>
        </div>
        <div style={{ flex: 1 }} />
        <Tabs tabs={[{key:'all',label:'All',count:6},{key:'draft',label:'Draft',count:1},{key:'scheduled',label:'Scheduled',count:2}]} active="all" onChange={()=>{}} style={{ borderBottom: 'none' }} />
        <Button variant="primary" size="sm" icon="plus">Draft</Button>
      </div>

      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 130px 80px', padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span>Title</span><span>Kind</span><span>Channel</span><span>Status</span><span>When</span><span style={{ textAlign: 'right' }}>Author</span>
        </div>
        {CONTENT_QUEUE.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 130px 80px',
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < CONTENT_QUEUE.length - 1 ? '1px solid var(--line-soft)' : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Iconed name={c.kind === 'Newsletter' ? 'email' : c.kind === 'Blog' ? 'content' : c.kind === 'Reel' ? 'play' : 'send'} size={13} style={{ color: 'var(--fg-faint)' }} />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.kind}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{c.channel}</span>
            <span><Badge tone={statusTone[c.status]} size="xs">{c.status}</Badge></span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.when}</span>
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--fg-muted)' }}>{c.author}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function Campaigns() {
  const sTone = { Active: 'success', Planning: 'warning', Draft: 'neutral' };
  return (
    <div style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Campaigns</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{CAMPAIGNS.length} multi-channel initiatives</div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="plus">Campaign</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--gap)' }}>
        {CAMPAIGNS.map(c => (
          <Card key={c.id}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <Badge tone={sTone[c.status]} size="xs">{c.status}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ends {c.end}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>{c.name}</div>
              </div>
              <IconButton icon="moreV" />
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Goal · {c.goal}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>{c.current} <span style={{ color: 'var(--fg-faint)' }}>/ {c.goal.match(/\d+/)?.[0] || '—'}</span></span>
              </div>
              <Progress value={c.progress} tone="moon" />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {c.channels.map(ch => <Badge key={ch} tone="neutral" variant="outline" size="xs">{ch}</Badge>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
