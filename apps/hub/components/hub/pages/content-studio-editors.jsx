"use client";

import React from 'react';
import { Button, TextField, TextAreaField, SegmentedControl } from '../hub-primitives';
import { parseStudioStructure } from '@/lib/content-workflow-client';

export function StructuredEditor({ draft, onChange, disabled }) {
  let data, error;
  try { data = parseStudioStructure(draft.body, draft.variantType); } catch (caught) { error = caught.message; }
  if (error) return <div className="studio-stack">
    <p className="studio-error" role="alert">{error}</p>
    <TextAreaField label="원본 JSON 수정" value={draft.body} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={14} />
  </div>;
  const isCards = draft.variantType === 'card_news', key = isCards ? 'slides' : 'scenes', entries = data[key];
  const commit = (next) => onChange(JSON.stringify({ ...data, [key]: next }));
  const update = (index, patch) => commit(entries.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  const move = (index, offset) => {
    const next = [...entries];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    commit(next);
  };
  const add = () => commit([...entries, isCards ? { id: crypto.randomUUID(), title: '', sub: '' } :
    { id: crypto.randomUUID(), visual: '', spoken: '', subtitle: '', duration: 10, notes: '' }]);
  return <div className="studio-stack">
    {entries.length === 0 && <div className="studio-empty">{isCards ? '첫 카드를 추가하거나 원문에서 카드뉴스 초안을 만들어보세요.' : '장면을 추가하거나 원문에서 쇼츠 대본을 만들어보세요.'}</div>}
    {entries.map((entry, index) => <section key={entry.id || index} className="studio-structure-entry">
      <div className="studio-row">
        <strong>{isCards ? '카드' : '장면'} {index + 1}</strong>
        <div className="studio-actions">
          <Button size="xs" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={(index + 1) + '번 위로 이동'}>위로</Button>
          <Button size="xs" disabled={disabled || index === entries.length - 1} onClick={() => move(index, 1)} aria-label={(index + 1) + '번 아래로 이동'}>아래로</Button>
          <Button size="xs" disabled={disabled} onClick={() => commit(entries.filter((_, i) => i !== index))} aria-label={(index + 1) + '번 삭제'}>삭제</Button>
        </div>
      </div>
      {isCards ? <>
        <TextField label={(index + 1) + '번 카드 제목'} value={entry.title || ''} disabled={disabled} onChange={(event) => update(index, { title: event.target.value })} />
        <TextAreaField label={(index + 1) + '번 카드 본문'} value={entry.sub || ''} disabled={disabled} onChange={(event) => update(index, { sub: event.target.value })} rows={3} />
      </> : <>
        <TextAreaField label={(index + 1) + '번 화면 설명'} value={entry.visual || ''} disabled={disabled} onChange={(event) => update(index, { visual: event.target.value })} rows={2} />
        <TextAreaField label={(index + 1) + '번 대사'} value={entry.spoken || ''} disabled={disabled} onChange={(event) => update(index, { spoken: event.target.value })} rows={3} />
        <TextField label={(index + 1) + '번 자막'} value={entry.subtitle || ''} disabled={disabled} onChange={(event) => update(index, { subtitle: event.target.value })} />
        <div className="studio-fields-two">
          <TextField label={(index + 1) + '번 길이 (초)'} type="number" min={1} max={180} value={entry.duration ?? 10} disabled={disabled} onChange={(event) => update(index, { duration: Number(event.target.value) })} />
          <TextField label={(index + 1) + '번 제작 메모'} value={entry.notes || ''} disabled={disabled} onChange={(event) => update(index, { notes: event.target.value })} />
        </div>
      </>}
    </section>)}
    <Button variant="outline" icon="plus" onClick={add} disabled={disabled || entries.length >= 30}>{isCards ? '카드 추가' : '장면 추가'}</Button>
  </div>;
}

export function ResultPreview({ body, type }) {
  let data;
  try { data = parseStudioStructure(body, type); } catch { return <pre className="studio-text-preview">{body}</pre>; }
  if (!body.trim()) return <div className="studio-empty">작성한 결과물이 여기에 표시됩니다.</div>;
  if (data?.slides) return <div className="studio-preview-cards">
    {data.slides.map((slide, i) => <article key={slide.id || i} className="studio-preview-card">
      <span className="studio-eyebrow">{i + 1} / {data.slides.length}</span>
      <h3>{slide.title}</h3><p>{slide.sub}</p>
    </article>)}
  </div>;
  if (data?.scenes) return <div className="studio-stack">{data.scenes.map((scene, i) => <article key={scene.id || i} className="studio-preview-scene">
    <strong>장면 {i + 1} · {scene.duration || '—'}초</strong>
    <p className="studio-muted">{scene.visual}</p><p>{scene.spoken}</p>
    {scene.subtitle && <blockquote>{scene.subtitle}</blockquote>}
  </article>)}</div>;
  // Threads·X는 빈 줄이 이어지는 글의 경계다(엔진 계약: 'Blank lines separate thread blocks').
  if (['threads_post', 'x_thread', 'social_post'].includes(type)) return <div className="studio-thread-preview">{body.split(/\n\s*\n/).filter(Boolean).map((part, i) => <article key={i}>
    <span className="studio-thread-number num">{i + 1}</span><p>{part}</p>
  </article>)}</div>;
  // Render text directly: user or model markdown never becomes untrusted HTML.
  return <article className="studio-article-preview">{body.split(/\n\s*\n/).map((part, i) => {
    const heading = part.match(/^(#{1,3})\s+(.+)$/);
    return heading ? <h3 key={i}>{heading[2]}</h3> : <p key={i}>{part}</p>;
  })}</article>;
}

export function DraftEditor({ draft, edit, disabled, onSelect }) {
  const [view, setView] = React.useState('edit');
  const structured = ['card_news', 'reels_script'].includes(draft.variantType);
  const supported = ['threads_post', 'x_thread', 'social_post', 'blog', 'blog_insight', 'landing_copy', 'newsletter', 'card_news', 'reels_script'].includes(draft.variantType);
  const chars = [...draft.body].length;
  return <div className="studio-stack">
    <div className="studio-row studio-editor-heading">
      <span className="studio-eyebrow">{structured ? '구성' : '본문'}</span>
      <SegmentedControl label="결과물 보기" value={view} onChange={setView} options={[{ key: 'edit', label: '편집' }, { key: 'preview', label: '미리보기' }]} />
    </div>
    {!supported && <p className="studio-error" role="alert">이전 형식의 결과물입니다. 원본을 복사·내보내기한 뒤 지원하는 채널의 새 결과물을 만들어주세요.</p>}
    {view === 'preview' ? <ResultPreview body={draft.body} type={draft.variantType} /> : structured
      ? <StructuredEditor draft={draft} disabled={disabled} onChange={(body) => edit({ body })} />
      : <TextAreaField aria-label="본문" placeholder={draft.channel === 'threads' ? '생각을 짧은 글로 시작해보세요.\n\n빈 줄로 연결할 글을 나눌 수 있습니다.' : '초안을 직접 작성하거나 원문·기획에서 AI로 시작해보세요.'}
          className="studio-body-input" rows={8} autoResize value={draft.body} disabled={disabled || !supported}
          onChange={(event) => edit({ body: event.target.value })}
          onSelect={(event) => onSelect({ start: event.target.selectionStart, end: event.target.selectionEnd, body: draft.body })} />}
    {!structured && <div className="studio-row studio-muted studio-small studio-body-meta"><span className="mono">{chars.toLocaleString()}자</span></div>}
  </div>;
}
