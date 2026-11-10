"use client";

import React from 'react';
import { Button, TextField, TextAreaField, SegmentedControl } from '../hub-primitives';
import { parseStudioStructure } from '@/lib/content-workflow-client';
import {
  THREADS_MAX_POSTS, THREADS_POST_LIMIT, joinThreadBlocks, mergeThreadBlockWithPrevious, postLength, replaceThreadBlock,
  threadBlockOffsets, threadBlocks,
} from '@/lib/thread-posts';

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

/** Threads 연결 글 편집기 — 블록마다 번호와 `n / 500`. Enter 두 번 = 다음 연결 글, 블록 맨 앞 Backspace = 앞 글과 잇기. */
export function ThreadPostsEditor({ body, onChange, disabled, onSelect, navRef, onFocusPost }) {
  const [blocks, setBlocks] = React.useState(() => threadBlocks(body));
  const emitted = React.useRef(body);
  const fields = React.useRef([]);
  const pendingFocus = React.useRef(null);
  // 밖에서 본문이 바뀌면(AI 적용 · 복원 · 다른 결과물) 블록을 다시 나눈다. 가운데 빈 블록은 편집기 안에만 산다.
  React.useEffect(() => { if (body !== emitted.current) { emitted.current = body; setBlocks(threadBlocks(body)); } }, [body]);
  // 커서 이동은 그 블록 상태가 실제로 그려진 렌더에서만 — studio.edit이 부모를 먼저 다시 그리면
  // 새 블록이 아직 없는 렌더가 끼어든다.
  React.useEffect(() => {
    const focus = pendingFocus.current;
    if (!focus || focus.blocks !== blocks) return;
    pendingFocus.current = null;
    const el = fields.current[focus.index]?.current;
    if (el) { el.focus(); el.setSelectionRange(focus.caret, focus.caret); }
  });
  // 객체 ref여야 TextAreaField의 자동 높이가 동작한다(함수 ref에는 .current가 없다).
  const fieldRef = (index) => (fields.current[index] ||= React.createRef());
  if (navRef) navRef.current = { focus(index) { const el = fields.current[index]?.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } };
  const commit = (next, focus) => {
    const text = joinThreadBlocks(next);
    emitted.current = text;
    pendingFocus.current = focus ? { ...focus, blocks: next } : null;
    setBlocks(next);
    onChange(text);
  };
  const offsets = threadBlockOffsets(blocks);
  const count = blocks.parts.length;
  return <div className="studio-posts" aria-label="연결 글">
    {blocks.parts.map((part, index) => {
      const length = postLength(part.trim());
      const over = length > THREADS_POST_LIMIT;
      return <div key={index} className="studio-post" data-over={over ? 'true' : undefined} data-last={index === count - 1 ? 'true' : undefined}>
        <span className="studio-post__no mono" aria-hidden="true">{index + 1}</span>
        <TextAreaField ref={fieldRef(index)} aria-label={`연결 글 ${index + 1} / ${count}`}
          aria-describedby={`studio-post-count-${index}`} className="studio-post-input" rows={1} autoResize value={part} disabled={disabled}
          placeholder={index === 0 ? '첫 줄 — 여기서 멈추게 할 한 문장' : '이어서 쓰기…'}
          onFocus={() => onFocusPost?.(index)}
          onChange={(event) => {
            const result = replaceThreadBlock(blocks, index, event.target.value, event.target.selectionStart);
            commit(result.blocks, result.split ? { index: result.focusIndex, caret: result.focusCaret } : null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Backspace' || event.nativeEvent?.isComposing || index === 0) return;
            if (event.target.selectionStart !== 0 || event.target.selectionEnd !== 0) return;
            event.preventDefault();
            const merged = mergeThreadBlockWithPrevious(blocks, index);
            commit(merged.blocks, { index: merged.focusIndex, caret: merged.focusCaret });
          }}
          onSelect={(event) => onSelect?.({ start: offsets[index] + event.target.selectionStart, end: offsets[index] + event.target.selectionEnd, body: joinThreadBlocks(blocks) })} />
        <span id={`studio-post-count-${index}`} className="studio-post__count mono">{over ? `${length} / ${THREADS_POST_LIMIT} · 나눠야 올라가요` : `${length} / ${THREADS_POST_LIMIT}`}</span>
      </div>;
    })}
    <button type="button" className="studio-post-add" disabled={disabled || count >= THREADS_MAX_POSTS}
      onClick={() => commit({ parts: [...blocks.parts, ''], seps: [...blocks.seps, '\n\n'] }, { index: count, caret: 0 })}>
      + 연결 글 <span className="mono">Enter</span> 두 번
    </button>
  </div>;
}

export function DraftEditor({ draft, edit, disabled, onSelect, navRef, onFocusPost }) {
  const [view, setView] = React.useState('edit');
  // Threads 글은 연결 글 블록이 곧 미리보기라 편집/미리보기 전환을 두지 않는다(16a 원고 책상).
  if (draft.variantType === 'threads_post') return <ThreadPostsEditor body={draft.body} disabled={disabled}
    onChange={(body) => edit({ body })} onSelect={onSelect} navRef={navRef} onFocusPost={onFocusPost} />;
  const structured = ['card_news', 'reels_script'].includes(draft.variantType);
  const supported = ['base_text', 'threads_post', 'x_thread', 'social_post', 'blog', 'blog_insight', 'landing_copy', 'newsletter', 'card_news', 'reels_script'].includes(draft.variantType);
  const chars = [...draft.body].length;
  return <div className="studio-stack">
    <div className="studio-row studio-editor-heading">
      <span className="studio-eyebrow">{structured ? '구성' : '본문'}</span>
      <SegmentedControl label="결과물 보기" value={view} onChange={(next) => { setView(next); onSelect?.(null); }} options={[{ key: 'edit', label: '편집' }, { key: 'preview', label: '미리보기' }]} />
    </div>
    {!supported && <p className="studio-error" role="alert">이전 형식의 결과물입니다. 원본을 복사·내보내기한 뒤 지원하는 채널의 새 결과물을 만들어주세요.</p>}
    {view === 'preview' ? <ResultPreview body={draft.body} type={draft.variantType} /> : structured
      ? <StructuredEditor draft={draft} disabled={disabled} onChange={(body) => edit({ body })} />
      : <TextAreaField aria-label="본문" placeholder={draft.channel === 'threads' ? '생각을 짧은 글로 시작해보세요.\n\n빈 줄로 연결할 글을 나눌 수 있습니다.' : '초안을 직접 작성하거나 원문·기획에서 AI로 시작해보세요.'}
          className="studio-body-input" rows={8} autoResize value={draft.body} disabled={disabled || !supported}
          onChange={(event) => edit({ body: event.target.value })}
          onSelect={(event) => onSelect({ start: event.target.selectionStart, end: event.target.selectionEnd, body: draft.body })} />}
    {!structured && <div className="studio-row studio-muted studio-small studio-body-meta"><span><span className="mono">{chars.toLocaleString()}</span>자</span></div>}
  </div>;
}
