"use client";

import React from 'react';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import { Button, CertaintyBadge, Skeleton, TruthBadge } from './hub-primitives';
import { SourceHeading, SourceInline, SourceMarkdown } from './source-markdown';
import './guidance-source-reader.css';

// Inline reader for the verbatim originals behind Guru and Legend cards.
//
// The card stays the reviewed entry point and its Moonlight reading article (GuidanceDetail)
// stays the primary read; this secondary reader shows the reference document text the card
// came from, verbatim, with its provenance (document, line range, character count) and an
// honest verification label, because that text still carries unreviewed quotes and figures.
// The library is large, so it loads with a dynamic import only when a reader mounts.
// Reading never generates advice, sends a notification or creates work.
//
// Props (one source is enough; the first one given wins, in this order):
//   entryIds      string[]   source entry ids, e.g. ['sales.keenan']
//   card          object     a GURU_CARDS / LEGEND_CARDS card (resolved by card id + section)
//   cardId        string     the same, looked up by id, e.g. 'sales-gap' or 'legend-buffett'
//   personId      string     a Guru person's own chapter, including people without cards
//   legendId      string     'buffett' or 'legend-buffett' → 2026-09-12 long card + 09-21 card
// Options:
//   focusHeading  string     open and scroll to the best-matching heading (overrides the card's)
//   onClose       function   shows "원문 닫기"
//   label         string     reader name (default: the first entry's person or title)
//   headingLevel  number     level of each entry title (default 5; sections one below; ≥ 3)
//   autoFocus     boolean    move focus into the reader once loaded (default true)
//   id, className
//   library / loadLibrary    a preloaded source-library module or a custom loader (tests)

let libraryPromise = null;

export function loadSourceLibrary() {
  if (!libraryPromise) {
    libraryPromise = import('@com-moon/guru-guidance/source-library').catch(error => {
      libraryPromise = null;
      throw error;
    });
  }
  return libraryPromise;
}

const ALL_CARDS = [...GURU_CARDS, ...LEGEND_CARDS];

export function findGuidanceCard(cardId) {
  return ALL_CARDS.find(card => card.id === cardId) ?? null;
}

const HR_LINE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

function hasReadableText(markdown) {
  return markdown.split('\n').some(line => line.trim() && !HR_LINE_RE.test(line));
}

// One entry split into an always-visible intro and collapsible sections at the shallowest
// sub-heading level. An entry without sub-headings is all intro.
export function buildEntryView(entry, index = 0, document = null, focus = null) {
  const lines = entry.markdown.split('\n');
  const slice = (from, to) => (from > to ? '' : lines.slice(from - entry.startLine, to - entry.startLine + 1).join('\n'));
  const top = entry.headings[0]?.line === entry.startLine ? entry.headings[0] : null;
  const subs = entry.headings.filter(heading => heading !== top);
  const sectionLevel = subs.length ? Math.min(...subs.map(heading => heading.level)) : null;
  const heads = sectionLevel == null ? [] : subs.filter(heading => heading.level === sectionLevel);
  const bodyStart = top ? entry.startLine + 1 : entry.startLine;
  const introMarkdown = slice(bodyStart, (heads[0]?.line ?? entry.endLine + 1) - 1);
  const sections = heads.map((heading, position) => {
    const endLine = position + 1 < heads.length ? heads[position + 1].line - 1 : entry.endLine;
    return { key: `${index}:${heading.line}`, heading, startLine: heading.line + 1, endLine, markdown: slice(heading.line + 1, endLine) };
  });
  const focusLine = focus && focus.entryId === entry.id ? focus.line : null;
  const focusSection = focusLine == null ? null
    : sections.find(section => focusLine >= section.heading.line && focusLine <= section.endLine) ?? null;
  return {
    index,
    entry,
    document,
    title: top ? top.text : entry.title,
    sectionLevel,
    intro: hasReadableText(introMarkdown) ? { markdown: introMarkdown, startLine: bodyStart } : null,
    sections,
    focusLine,
    focusSectionKey: focusSection ? focusSection.key : null,
  };
}

function noticeFor(resolution) {
  if (!resolution || resolution.kind !== 'guru') return null;
  const where = resolution.entry.name ?? resolution.entry.title;
  if (resolution.hosted) return `이 카드의 근거 절은 ${where} 원문 안에 있습니다.`;
  if (!resolution.heading) return '카드 출처 절과 같은 제목을 찾지 못해 원문 처음부터 보여 줍니다.';
  if (resolution.approximate) return '카드 출처 절과 같은 이름의 소제목이 없어 가장 가까운 제목으로 이동합니다.';
  return null;
}

export function buildReaderModel(library, { entryIds, card, cardId, personId, legendId, focusHeading } = {}) {
  let entries = [];
  let focus = null;
  let notice = null;
  const sourceCard = card || (cardId ? findGuidanceCard(cardId) : null);
  if (Array.isArray(entryIds) && entryIds.length) {
    entries = entryIds.map(id => library.getSourceEntry(id)).filter(Boolean);
  } else if (sourceCard) {
    const resolution = library.resolveCardSource(sourceCard);
    if (resolution) {
      entries = resolution.entries;
      if (resolution.heading) focus = { entryId: resolution.entry.id, line: resolution.heading.line };
      notice = noticeFor(resolution);
    }
  } else if (personId) {
    const entry = library.getPersonSource(personId);
    entries = entry ? [entry] : [];
  } else if (legendId) {
    entries = library.getLegendSources(legendId);
  }
  if (focusHeading && entries.length) {
    const found = library.findSourceHeading(entries, focusHeading);
    if (found) focus = { entryId: found.entry.id, line: found.heading.line };
  }
  const views = entries.map((entry, index) => buildEntryView(entry, index, library.getSourceDocument(entry.docPath), focus));
  return {
    key: `${views.map(view => view.entry.id).join('|')}${focus ? `@${focus.entryId}:${focus.line}` : ''}`,
    entries: views,
    focus,
    notice,
    sourceTitle: sourceCard?.source?.title ?? null,
  };
}

// The focused section of each entry, else its first section, starts open.
export function defaultOpenKeys(model) {
  return model.entries.filter(view => view.sections.length).map(view => view.focusSectionKey ?? view.sections[0].key);
}

export function allSectionKeys(model) {
  return model.entries.flatMap(view => view.sections.map(section => section.key));
}

export function toggleOpenKey(keys, key) {
  return keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key];
}

export function readerAnchorId(idPrefix, entryIndex, line) {
  return `${idPrefix}-e${entryIndex}-l${line}`;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

export function provenanceText(view) {
  const { entry, document } = view;
  return `원문 그대로 · ${document?.title ?? entry.docPath} ${entry.startLine}–${entry.endLine}줄 · ${numberFormat.format(entry.charCount)}자`;
}

export function honestyText(document) {
  return document?.verification?.status === 'partial'
    ? '원전 대조 일부 · 인용·수치는 확인 전'
    : '출처 점검 전 · 인용·수치는 확인 전';
}

function EntryView({ view, headingLevel, idPrefix, openKeys, onToggle, onJump }) {
  const { entry, document } = view;
  const verification = document?.verification;
  const anchorFor = line => readerAnchorId(idPrefix, view.index, line);
  const sectionHeadingLevel = headingLevel + 1;
  const bodyHeadingLevel = docLevel => sectionHeadingLevel + Math.max(1, docLevel - (view.sectionLevel ?? docLevel));
  return <article className="source-reader__entry" aria-labelledby={anchorFor(entry.startLine)}>
    <SourceHeading level={headingLevel} id={anchorFor(entry.startLine)} className="source-reader__title" focusable>
      <SourceInline text={view.title} />
    </SourceHeading>
    <p className="source-reader__provenance">{provenanceText(view)}</p>
    <div className="source-reader__honesty">
      <CertaintyBadge state="unknown" label="확인 필요" />
      <span>{honestyText(document)}</span>
    </div>
    {verification && <details className="source-reader__scope">
      <summary>확인 범위</summary>
      {verification.checked.length > 0 && <ul>{verification.checked.map(item => <li key={item}>{item}</li>)}</ul>}
      <p>{verification.unverified}</p>
      <p className="source-reader__basis">기준 · {verification.basisTitle ?? '출처 점검 기록'}</p>
    </details>}

    {view.sections.length >= 2 && <nav className="source-reader__toc" aria-label={`${entry.name ?? view.title} 목차`}>
      <span className="source-reader__toc-label">목차</span>
      <ol>
        {view.sections.map((section, position) => <li key={section.key}>
          <button type="button" className="source-reader__toc-item hub-row" aria-controls={`${anchorFor(section.heading.line)}-body`} onClick={() => onJump(section.key, anchorFor(section.heading.line))}>
            <span className="source-reader__toc-number mono">{position + 1}</span>
            <span><SourceInline text={section.heading.text} /></span>
          </button>
        </li>)}
      </ol>
    </nav>}

    {view.intro && <SourceMarkdown
      className="source-reader__intro"
      markdown={view.intro.markdown}
      lineOffset={view.intro.startLine}
      headingLevel={() => sectionHeadingLevel}
      anchorFor={anchorFor}
      focusableHeadings
    />}

    {view.sections.length > 0 && <div className="source-reader__sections">
      {view.sections.map(section => {
        const open = openKeys.includes(section.key);
        const anchor = anchorFor(section.heading.line);
        return <section key={section.key} className="source-reader__section" data-open={open ? 'true' : 'false'}>
          <SourceHeading level={sectionHeadingLevel} className="source-reader__section-heading">
            <button type="button" id={anchor} className="source-reader__toggle hub-row" aria-expanded={open} aria-controls={`${anchor}-body`} onClick={() => onToggle(section.key)}>
              <span className="source-reader__chevron" aria-hidden="true">›</span>
              <span className="source-reader__toggle-text"><SourceInline text={section.heading.text} /></span>
            </button>
          </SourceHeading>
          <div id={`${anchor}-body`} className="source-reader__body" hidden={!open}>
            {open && <SourceMarkdown
              markdown={section.markdown}
              lineOffset={section.startLine}
              headingLevel={bodyHeadingLevel}
              anchorFor={anchorFor}
              focusableHeadings
            />}
          </div>
        </section>;
      })}
    </div>}
  </article>;
}

// Pure view: every state renders from props, so it can be rendered on the server in tests.
export function SourceReaderView({
  status, model, openKeys = [], onToggle, onToggleAll, onJump, onRetry, onClose,
  label, headingLevel = 5, idPrefix = 'source-reader', id, className, rootRef,
}) {
  const level = Math.max(3, Math.round(headingLevel));
  const views = model?.entries ?? [];
  const readerName = label || views[0]?.entry.name || views[0]?.title || '원문';
  const allKeys = model ? allSectionKeys(model) : [];
  const allOpen = allKeys.length > 0 && allKeys.every(key => openKeys.includes(key));
  return <section
    ref={rootRef}
    id={id}
    tabIndex={-1}
    className={['source-reader', className].filter(Boolean).join(' ')}
    aria-label={`${readerName} 원문`}
    aria-busy={status === 'loading' ? 'true' : undefined}
    data-status={status}
  >
    <div className="source-reader__head">
      <div className="source-reader__heading">
        <span className="source-reader__eyebrow">참고 문서 원문 · 글자 그대로</span>
        <p className="source-reader__name">{readerName}</p>
      </div>
      {status === 'ready' && allKeys.length >= 2 && <Button variant="ghost" size="sm" className="source-reader__toggle-all" onClick={onToggleAll}>
        {allOpen ? '모두 접기' : '모두 펼치기'}
      </Button>}
    </div>

    {status === 'loading' && <div className="source-reader__state">
      <TruthBadge state="loading" />
      <Skeleton lines={4} label="원문 불러오는 중" />
    </div>}

    {status === 'error' && <div className="source-reader__state" role="alert">
      <TruthBadge state="error" reason="원문을 불러오지 못했습니다" />
      <Button variant="outline" size="sm" onClick={onRetry}>다시 불러오기</Button>
    </div>}

    {status === 'ready' && !views.length && <p className="source-reader__empty">
      연결된 원문을 찾지 못했습니다{model?.sourceTitle ? ` · ${model.sourceTitle}` : ''}
    </p>}

    {status === 'ready' && model?.notice && <p className="source-reader__notice">{model.notice}</p>}

    {status === 'ready' && views.map(view => <EntryView
      key={view.entry.id}
      view={view}
      headingLevel={level}
      idPrefix={idPrefix}
      openKeys={openKeys}
      onToggle={onToggle}
      onJump={onJump}
    />)}

    {onClose && <div className="source-reader__foot">
      <Button variant="ghost" size="sm" onClick={onClose}>원문 닫기</Button>
    </div>}
  </section>;
}

export function GuidanceSourceReader({
  entryIds, card, cardId, personId, legendId, focusHeading, onClose, label,
  headingLevel = 5, autoFocus = true, id, className, library, loadLibrary = loadSourceLibrary,
}) {
  const [loaded, setLoaded] = React.useState(() => ({ status: library ? 'ready' : 'loading', library: library ?? null }));
  const [attempt, setAttempt] = React.useState(0);
  const [openState, setOpenState] = React.useState({ key: null, keys: [] });
  const [scrollTarget, setScrollTarget] = React.useState(null);
  const rootRef = React.useRef(null);
  const settledKey = React.useRef(null);
  const idPrefix = `source-reader-${React.useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const activeLibrary = library ?? loaded.library;
  const status = library ? 'ready' : loaded.status;

  React.useEffect(() => {
    if (library) return undefined;
    let alive = true;
    setLoaded(current => (current.library ? current : { status: 'loading', library: null }));
    loadLibrary().then(
      module => { if (alive) setLoaded({ status: 'ready', library: module }); },
      () => { if (alive) setLoaded({ status: 'error', library: null }); },
    );
    return () => { alive = false; };
  }, [library, loadLibrary, attempt]);

  const entryKey = Array.isArray(entryIds) ? entryIds.join('|') : '';
  const model = React.useMemo(
    () => (activeLibrary ? buildReaderModel(activeLibrary, { entryIds, card, cardId, personId, legendId, focusHeading }) : null),
    // entryIds by value, so a fresh array literal from the caller does not rebuild the model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLibrary, entryKey, card, cardId, personId, legendId, focusHeading],
  );
  const openKeys = model ? (openState.key === model.key ? openState.keys : defaultOpenKeys(model)) : [];
  const setOpenKeys = keys => setOpenState({ key: model.key, keys });

  // Once per loaded model: scroll to the card's section, or bring the reader into view.
  React.useEffect(() => {
    if (status !== 'ready' || !model || settledKey.current === model.key) return;
    settledKey.current = model.key;
    const view = model.focus ? model.entries.find(item => item.entry.id === model.focus.entryId) : null;
    if (view) {
      setScrollTarget(current => ({ anchor: readerAnchorId(idPrefix, view.index, model.focus.line), focus: autoFocus, block: 'start', seq: (current?.seq ?? 0) + 1 }));
    } else if (autoFocus) {
      setScrollTarget(current => ({ anchor: null, focus: true, block: 'nearest', seq: (current?.seq ?? 0) + 1 }));
    }
  }, [status, model, autoFocus, idPrefix]);

  React.useEffect(() => {
    if (!scrollTarget) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = scrollTarget.anchor ? document.getElementById(scrollTarget.anchor) : rootRef.current;
      if (!node) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      node.scrollIntoView?.({ block: scrollTarget.block, behavior: reduce ? 'auto' : 'smooth' });
      if (scrollTarget.focus) node.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTarget]);

  const allKeys = model ? allSectionKeys(model) : [];
  return <SourceReaderView
    status={status}
    model={model}
    openKeys={openKeys}
    onToggle={key => setOpenKeys(toggleOpenKey(openKeys, key))}
    onToggleAll={() => setOpenKeys(allKeys.every(key => openKeys.includes(key)) ? [] : allKeys)}
    onJump={(key, anchor) => {
      if (!openKeys.includes(key)) setOpenKeys([...openKeys, key]);
      setScrollTarget(current => ({ anchor, focus: true, block: 'start', seq: (current?.seq ?? 0) + 1 }));
    }}
    onRetry={() => setAttempt(value => value + 1)}
    onClose={onClose}
    label={label}
    headingLevel={headingLevel}
    idPrefix={idPrefix}
    id={id}
    className={className}
    rootRef={rootRef}
  />;
}
