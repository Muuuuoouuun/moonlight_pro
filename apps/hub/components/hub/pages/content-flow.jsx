"use client";

// 콘텐츠 › 소재·제작의 만들기(13b, 기본)·보드(13a) 보기 — 2026-10-21 운영자 확정 "13b 기본 + 13a 보드 보기".
// 목록 보기(예전 화면)는 content.jsx의 ContentQueueList가 그대로 그린다.
// 저장은 기존 경로만 쓴다: 한 줄 담기 = 소재 저장(POST /api/hub/content · idea), 계획 6칸 = 원고 작성과 같은 workflow save.
// 형식 추가·대본 쓰기·예약·발행은 원고 작성에서 한다 — 여기서는 뼈대를 읽기만 한다.
import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, CertaintyBadge, SegmentedControl, SelectField, Skeleton, TextAreaField, TruthBadge } from '../hub-primitives';
import { useContentLedger, readContentLedger, refreshContentLedger } from '../use-content-ledger';
import { filterBrandsByWorkspace, filterContentByWorkspace, getWorkspace } from '../workspace-map';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { contentQueueScope } from '@/lib/content-workflow';
import { studioErrorMessage } from '@/lib/content-workflow-client';
import { buildPublishLog } from '@/lib/content-publish-log';
import { formatKstShort } from '@/lib/content-schedule';
import {
  CONTENT_VIEWS, DEFAULT_CONTENT_VIEW, FLOW_FORMATS, FLOW_STAGES, PLAN_FIELDS, bodyWritten, buildFlow, buildPlanSave, flowWeek,
  formatOfType, formatOutline, isReadyToMake, pickableCards, planSaveConfirmed, publishedDays, studioHref,
} from '@/lib/content-flow';
import { useContentSchedule } from './use-content-schedule';
import { ContentIdeaCapture } from './content-idea-capture';
import { postStudio } from './content-studio-api';
import './content-flow.css';

const LANE_LIMIT = 8;
const STAGE = Object.fromEntries(FLOW_STAGES.map((stage) => [stage.key, stage]));
const EYEBROW = { make: '콘텐츠 · 만들기', board: '콘텐츠 · 보드', list: '콘텐츠 · 목록' };
const clock = (date) => date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function useViewNavigation() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  return React.useCallback((patch) => {
    const query = new URLSearchParams(params?.toString() || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || (key === 'view' && value === DEFAULT_CONTENT_VIEW)) query.delete(key);
      else query.set(key, value);
    }
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
}

export function ContentViewSwitch({ view }) {
  const go = useViewNavigation();
  return <SegmentedControl label="콘텐츠 보기" options={CONTENT_VIEWS} value={view} onChange={(next) => go({ view: next })} />;
}

// 세 보기가 같은 머리를 쓴다 — 제목 44px/200(DESIGN §11 콘텐츠 예외), 보기 전환은 페이지 안 SegmentedControl.
export function ContentPageHead({ view, note, actions }) {
  return (
    <header className="hub-page-header cflow-head">
      <div className="cflow-head__text">
        <span className="cflow-head__eyebrow">{EYEBROW[view]}</span>
        <h2 className="cflow-title">{view === 'make' ? '오늘 하나 만들기' : '콘텐츠'}</h2>
        {note && <div className="cflow-head__note">{note}</div>}
      </div>
      <div className="cflow-head__actions">{actions}<ContentViewSwitch view={view} /></div>
    </header>
  );
}

function WeekCells({ week, scheduleUnknown }) {
  return (
    <div className="cflow-weekbox">
      <span className="cflow-dim">이번 주 · 하루 1개 <span className="mono cflow-fg">{publishedDays(week)}/7</span></span>
      <ol className="cflow-week" aria-label="이번 주 발행">
        {week.map((day) => (
          <li key={day.key} className="cflow-day" aria-label={day.aria} title={day.aria}
            data-done={day.done ? '' : undefined} data-sched={day.scheduled ? '' : undefined}
            data-today={day.today ? '' : undefined} data-future={day.future && !day.scheduled ? '' : undefined}>
            <span>{day.label}</span><b aria-hidden="true">{day.done ? '✓' : day.scheduled ? '◷' : ''}</b>
          </li>
        ))}
      </ol>
      {scheduleUnknown && <TruthBadge state="partial" reason="예약 확인 실패" />}
    </div>
  );
}

function PlanDots({ count }) {
  return <span className="cflow-dots" aria-hidden="true">{PLAN_FIELDS.map((field, index) => <i key={field.key} data-on={index < count ? '' : undefined} />)}</span>;
}

// ── 만들기(13b) ─────────────────────────────────────────────────────────────
const primaryVariant = (card) => card.variants.find((variant) => variant.id === card.item.variantId) || card.variants[0] || null;
const variantFor = (card, format) => {
  const primary = primaryVariant(card);
  return primary?.type === format.type ? primary : card.variants.find((variant) => variant.type === format.type) || null;
};

function usePlanDrafts() {
  // 콘텐츠마다 { edits, saved: { brief, updatedAt }, status, message, at } — 다른 아이디어를 골랐다 돌아와도 쓰던 칸이 남는다.
  const [plans, setPlans] = React.useState({});
  const patch = React.useCallback((id, next) => setPlans((current) => ({ ...current, [id]: { ...current[id], ...(typeof next === 'function' ? next(current[id] || {}) : next) } })), []);
  return [plans, patch];
}

function PlanPane({ card, plan, patchPlan, format, onFormat }) {
  const { item } = card;
  const saved = plan.saved && Date.parse(item.updatedAt) < Date.parse(plan.saved.updatedAt) ? plan.saved.brief : null;
  const base = (key) => (saved ? saved[key] : item.brief?.[key]) ?? '';
  const value = (key) => plan.edits?.[key] ?? base(key);
  const dirty = Object.fromEntries(Object.entries(plan.edits || {}).filter(([key, text]) => text !== base(key)));
  const saving = plan.status === 'saving';
  const memo = isReadyToMake({ ...item, sourceUrl: null }) ? item.sourceIdea : '';

  const save = async () => {
    if (saving || !Object.keys(dirty).length) return;
    patchPlan(item.id, { status: 'saving', message: '' });
    try {
      // 버전은 방금 읽은 상세에서 — 응답을 못 받았으면 다시 눌러 같은 값을 다시 보내면 된다.
      const response = await fetch('/api/hub/content/workflow?item=' + encodeURIComponent(item.id), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const detail = await response.json();
      if (!response.ok || detail?.status !== 'live') throw new Error(studioErrorMessage(detail, '저장할 글을 다시 읽지 못했어요. 쓴 칸은 그대로예요.'));
      const command = buildPlanSave(detail, dirty, crypto.randomUUID());
      if (!command) throw new Error('이 글은 원고 작성의 더보기 → 기획 구체화에서 채워 주세요.');
      const result = await postStudio('workflow', command);
      if (result.status === 'preview') { patchPlan(item.id, { status: 'preview', message: '저장소가 연결되지 않아 저장하지 않았어요.' }); return; }
      if (!planSaveConfirmed(result, command)) {
        patchPlan(item.id, { status: 'error', message: result.status === 'conflict' ? '다른 곳에서 방금 바뀌었어요. 다시 저장하면 최신 내용 위에 이 칸만 씁니다.' : studioErrorMessage(result, '저장을 확인하지 못했어요. 쓴 칸은 그대로예요 — 다시 저장해 주세요.') });
        return;
      }
      patchPlan(item.id, (current) => ({
        status: 'saved', message: '', at: new Date(), saved: { brief: result.item.meta.brief, updatedAt: result.item.updated_at },
        // 저장하는 동안 더 쓴 칸은 남긴다.
        edits: Object.fromEntries(Object.entries(current.edits || {}).filter(([key, text]) => command.item.brief[key] !== text)),
      }));
      void refreshContentLedger();
    } catch (error) {
      patchPlan(item.id, { status: 'error', message: error?.message || '저장을 확인하지 못했어요. 다시 저장해 주세요.' });
    }
  };

  const filledMessage = Boolean(String(value('message')).trim());
  const filled = PLAN_FIELDS.filter(({ key }) => String(value(key)).trim()).length;
  return (
    <section className="cflow-pane" aria-label="계획">
      <div className="cflow-pane__head"><h3>② 계획</h3><span className="cflow-dim"><PlanDots count={filled} /> <span className="mono">{filled}/6</span></span></div>
      <p className="cflow-plan__title">{item.title}</p>
      <div className="cflow-memo" data-empty={memo ? undefined : ''}>
        <span className="cflow-memo__label">원문 메모</span>
        {memo ? <p>{memo}</p> : <p className="cflow-dim">제목 한 줄만 담았어요 — 메모는 원고 작성에서 더할 수 있어요.</p>}
        {item.sourceUrl && <a className="cflow-memo__link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">참고 링크 ↗</a>}
      </div>
      <div className="cflow-brief">
        {PLAN_FIELDS.map((field) => (
          <TextAreaField key={field.key} label={field.key === 'message' ? `${field.label} · 이것만 있으면 시작` : field.label}
            placeholder={field.placeholder} value={value(field.key)} rows={2} autoResize disabled={saving}
            onChange={(event) => patchPlan(item.id, (current) => ({ edits: { ...current.edits, [field.key]: event.target.value }, status: 'idle', message: '' }))}
            onCmdEnter={save} className="cflow-bf__input"
            fieldClassName={`cflow-bf${String(value(field.key)).trim() ? '' : ' is-empty'}${field.key === 'message' || field.key === 'ending' ? ' is-wide' : ''}`} />
        ))}
      </div>
      <div className="cflow-save">
        <Button variant="outline" size="sm" onClick={save} disabled={saving || !Object.keys(dirty).length}>{saving ? '저장 중…' : '계획 저장'}</Button>
        <span aria-live="polite" className="cflow-save__state">
          {plan.status === 'saved' && !Object.keys(dirty).length && <>저장됨 <span className="mono">{clock(plan.at)}</span></>}
          {plan.status === 'error' && <TruthBadge state="error" label="저장 못 함" />}
          {plan.status === 'preview' && <TruthBadge state="preview" label="저장소 연결 필요" />}
        </span>
        {plan.message && <p role="alert" className="cflow-save__msg">{plan.message}</p>}
      </div>
      <div className="cflow-format">
        <SegmentedControl label="대본 형식" value={format.key} onChange={onFormat}
          options={FLOW_FORMATS.map((option) => ({ key: option.key, label: card.formats.includes(option) ? `${option.label} ✓` : option.label }))} />
        <span className="cflow-dim">✓ 이미 만든 결과물 · 새 형식은 원고 작성에서 만들어요</span>
      </div>
      {!filledMessage && <p className="cflow-tip"><CertaintyBadge state="recommended" /> 핵심 메시지 한 줄부터 — 나머지는 쓰면서 채워요</p>}
    </section>
  );
}

function ScriptPane({ card, format, onOpen }) {
  const variant = variantFor(card, format);
  const outline = formatOutline(format.key, variant, card.item.sourceIdea);
  const measure = outline.measure;
  return (
    <section className="cflow-pane" aria-label="대본">
      <div className="cflow-pane__head"><h3>③ 대본</h3><span className="cflow-dim">{format.label} · 뼈대 <span className="mono">{outline.written}/{outline.total}</span></span></div>
      {measure?.of && (
        <div className="cflow-len">
          <div className="cflow-len__row"><span className="cflow-dim">길이</span><span className="mono cflow-dim">{measure.value} / {measure.of}{measure.unit}</span></div>
          <div className="cflow-len__track" role="img" aria-label={`길이 ${measure.value}${measure.unit}, ${measure.of}${measure.unit} 중`}><i style={{ width: `${Math.min(100, Math.round((measure.value / measure.of) * 100))}%` }} /></div>
        </div>
      )}
      <ol className="cflow-beats">
        {outline.rows.map((row, index) => (
          <li key={`${row.label}-${index}`} className="cflow-beat">
            <span className="cflow-beat__label">{row.label}</span>
            <span className="cflow-beat__text" data-empty={row.text ? undefined : ''}>{row.text || '비어 있음'}</span>
            <span className="mono cflow-beat__meta">{row.meta || '—'}</span>
          </li>
        ))}
      </ol>
      {!variant && <p className="cflow-dim">{card.variants.length
        ? `아직 ${format.label} 결과물이 없어요 — 원고 작성의 형식 탭에서 만들어요.`
        : '이 목록에서는 결과물을 확인하지 못했어요 — 원고 작성에서 열어 보세요.'}</p>}
      {measure && !measure.of && outline.written > 0 && <p className="cflow-dim">지금 <span className="mono">{measure.value}{measure.unit}</span></p>}
      <div className="cflow-pane__foot">
        <span className="cflow-dim">대본은 원고 작성에서 써요</span>
        <Button variant="primary" size="sm" onClick={() => onOpen(studioHref(card.item.id, variant?.id))}>원고 작성 열기</Button>
      </div>
    </section>
  );
}

function MakeView({ lanes, capture, week, scheduleUnknown, partial, onBoard }) {
  const router = useRouter(), params = useSearchParams(), go = useViewNavigation();
  const pickable = pickableCards(lanes);
  const readyCount = pickable.filter((card) => card.ready).length;
  const urlPick = pickable.find((card) => card.item.id === params.get('item')) || null;
  const [filter, setFilter] = React.useState(null);
  const activeFilter = filter ?? (readyCount && (!urlPick || urlPick.ready) ? 'ready' : 'all');
  const visible = activeFilter === 'ready' ? pickable.filter((card) => card.ready) : pickable;
  const picked = urlPick || visible[0] || null;
  const [plans, patchPlan] = usePlanDrafts();
  const [formats, setFormats] = React.useState({});
  const format = picked ? FLOW_FORMATS.find((option) => option.key === formats[picked.item.id])
    || formatOfType(primaryVariant(picked)?.type) || FLOW_FORMATS[0] : FLOW_FORMATS[0];
  const counts = Object.fromEntries(FLOW_STAGES.map(({ key }) => [key, lanes[key].length]));
  const missed = lanes.ship.filter((card) => card.schedule?.state === 'missed').length;

  return (
    <>
      <div className="cflow-miller">
        <section className="cflow-pane" aria-label="아이디어 고르기">
          <div className="cflow-pane__head"><h3>① 고르기</h3><span className="cflow-dim">고를 것 <span className="mono">{pickable.length}</span></span></div>
          {capture({ onSaved: (id) => { setFilter('all'); go({ item: id }); } })}
          <SegmentedControl label="아이디어 거르기" fill value={activeFilter} onChange={setFilter}
            options={[{ key: 'ready', label: '바로 가능', count: readyCount }, { key: 'all', label: '전체', count: pickable.length }]} />
          {visible.length > 0 ? (
            <ul className="cflow-ideas">
              {visible.map((card) => (
                <li key={card.item.id}>
                  <button type="button" className="cflow-idea" aria-pressed={card === picked} onClick={() => go({ item: card.item.id })}>
                    <span className="cflow-idea__title">{card.item.title}</span>
                    <span className="cflow-idea__meta">
                      <span aria-hidden="true">{STAGE[card.stage].glyph}</span> {STAGE[card.stage].label}
                      {card.stage === 'plan' && <> · 계획 <span className="mono">{card.plan}/6</span></>}
                      {card.ready && <> · 바로 가능</>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cflow-empty">{pickable.length ? '바로 가능한 아이디어가 없어요. 전체에서 골라 보세요.' : partial ? '확인한 기록에는 고를 아이디어가 없어요.' : '아직 담은 아이디어가 없어요. 떠오른 것 한 줄부터 담아 보세요.'}</p>
          )}
          <p className="cflow-foot">바로 가능 = 원문 메모나 참고 링크가 있어 지금 시작할 수 있는 것 · 점수 없음</p>
        </section>
        {picked ? (
          <>
            <PlanPane key={picked.item.id} card={picked} plan={plans[picked.item.id] || {}} patchPlan={patchPlan}
              format={format} onFormat={(key) => setFormats((current) => ({ ...current, [picked.item.id]: key }))} />
            <ScriptPane card={picked} format={format} onOpen={(href) => router.push(href)} />
          </>
        ) : (
          <section className="cflow-pane cflow-pane--wide cflow-pane--empty" aria-label="계획과 대본">
            <p>아이디어를 하나 고르면 여기에 계획과 대본 뼈대가 열려요.</p>
          </section>
        )}
      </div>
      <section className="cflow-strip" aria-label="흐름 중">
        <div><span className="cflow-eyebrow">흐름 중</span><span className="cflow-dim">고른 뒤의 일은 보드에서</span></div>
        <div className="cflow-chips">
          {['plan', 'make', 'polish', 'ship'].map((key) => (
            <span key={key} className="cflow-chip"><span aria-hidden="true">{STAGE[key].glyph}</span>{STAGE[key].label} <b className="num">{counts[key]}</b></span>
          ))}
          {missed > 0 && <span className="cflow-missed">놓침 <b className="num">{missed}</b></span>}
          <Button variant="ghost" size="sm" onClick={onBoard}>보드에서 보기</Button>
        </div>
        <WeekCells week={week} scheduleUnknown={scheduleUnknown} />
      </section>
    </>
  );
}

// ── 보드(13a) ──────────────────────────────────────────────────────────────
function scheduleLine(schedule) {
  const at = formatKstShort(schedule.scheduledAt);
  if (schedule.state === 'missed') return <><span className="cflow-danger">놓침</span> · <span className="mono">{at}</span> 예약 · 밤 정리 때 안 올림</>;
  if (schedule.state === 'due') return <>올릴 차례 · <span className="mono">{at}</span></>;
  return <span className="cflow-when">◷ <span className="mono">{at}</span> 예약</span>;
}

function CardBody({ card }) {
  const { item, stage, schedule } = card;
  if (stage === 'idea') return <span className="cflow-card__meta">{item.brandName && item.brandName !== 'No brand' ? `${item.brandName} · ` : ''}<span className="mono">{item.when}</span>{card.ready && <span className="cflow-ready">바로 가능</span>}</span>;
  if (stage === 'plan') {
    return (
      <>
        <span className="cflow-card__meta">계획 <span className="mono cflow-fg">{card.plan}/6</span> <PlanDots count={card.plan} /></span>
        {!String(item.brief?.message || '').trim() && <span className="cflow-gate"><CertaintyBadge state="recommended" /> 대본 전에 핵심 메시지 한 줄 — 막지는 않아요</span>}
      </>
    );
  }
  if (stage === 'make') {
    const format = card.formats.find((option) => formatOutline(option.key, variantFor(card, option), item.sourceIdea).written) || formatOfType(primaryVariant(card)?.type);
    if (!format) return <span className="cflow-card__meta">쓰는 중</span>;
    const outline = formatOutline(format.key, variantFor(card, format), item.sourceIdea);
    return (
      <>
        <span className="cflow-card__meta">{format.label} 대본 <span className="mono cflow-fg">{outline.written}/{outline.total}</span>{outline.measure && <span className="mono"> · {outline.measure.value}{outline.measure.unit}</span>}</span>
        <span className="cflow-beatbar" aria-hidden="true">{outline.rows.map((row, index) => <i key={index} data-on={row.text ? '' : undefined} />)}</span>
      </>
    );
  }
  if (stage === 'ship') return <span className="cflow-card__meta">{schedule ? scheduleLine(schedule) : '전달됨 · 예약 없음'}</span>;
  return <span className="cflow-card__meta"><span className="mono">{item.when}</span></span>;
}

function BoardCard({ card, onOpen }) {
  const missed = card.schedule?.state === 'missed';
  const next = card.stage === 'idea' ? '고르기' : card.stage === 'plan' ? '계획 이어 쓰기' : '원고 작성 열기';
  return (
    <button type="button" className="hub-kanban-card cflow-card" data-stage={card.stage} data-missed={missed ? '' : undefined}
      aria-label={`${card.item.title} · ${STAGE[card.stage].label}${missed ? ' · 놓침' : ''} · ${next}`} onClick={() => onOpen(card)}>
      <span className="cflow-card__title">{card.item.title}</span>
      <CardBody card={card} />
      <span className="cflow-card__foot">
        <span className="cflow-fmts">{card.formats.map((format) => <span key={format.key} className="cflow-fmt">{format.label}</span>)}</span>
        <span className="cflow-card__next">{next} →</span>
      </span>
    </button>
  );
}

function BoardView({ lanes, capture, week, scheduleUnknown, partial, onFocusCapture }) {
  const router = useRouter(), go = useViewNavigation();
  const open = (card) => {
    if (card.stage === 'idea' || card.stage === 'plan') { go({ view: 'make', item: card.item.id }); return; }
    const written = card.variants.find((variant) => bodyWritten(variant, card.item.sourceIdea));
    router.push(studioHref(card.item.id, card.schedule?.variantId || written?.id || primaryVariant(card)?.id));
  };
  return (
    <>
      <div className="cflow-boardtop">
        {capture({})}
        <WeekCells week={week} scheduleUnknown={scheduleUnknown} />
      </div>
      <div className="cflow-board">
        {FLOW_STAGES.map((stage) => {
          const cards = lanes[stage.key];
          return (
            <section key={stage.key} className="cflow-lane" aria-label={stage.label}>
              <div className="cflow-lane__head"><span aria-hidden="true" className="cflow-glyph">{stage.glyph}</span><h3>{stage.label}</h3><span className="num">{cards.length}</span></div>
              <p className="cflow-lane__hint">{stage.key === 'make' ? <><CertaintyBadge state="recommended" /> {stage.hint}</> : stage.hint}</p>
              {cards.slice(0, LANE_LIMIT).map((card) => <BoardCard key={card.item.id} card={card} onOpen={open} />)}
              {cards.length > LANE_LIMIT && <p className="cflow-more">+ <span className="num">{cards.length - LANE_LIMIT}</span>개 더 · 목록 보기에서</p>}
              {!cards.length && <p className="cflow-empty">{partial ? '확인한 기록에는 없어요' : '비어 있어요'}</p>}
              {stage.key === 'idea' && <button type="button" className="hub-kanban-add cflow-add" onClick={onFocusCapture}>+ 아이디어 담기</button>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function FlowSkeleton({ view }) {
  const count = view === 'board' ? 5 : 3;
  return (
    <div className={view === 'board' ? 'cflow-board' : 'cflow-miller'}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={view === 'board' ? 'cflow-lane' : 'cflow-pane'}><Skeleton lines={view === 'board' ? 4 : 6} height={16} label="콘텐츠 흐름 불러오는 중" /></div>
      ))}
    </div>
  );
}

export function ContentFlow({ workspace, view }) {
  const ws = getWorkspace(workspace);
  const params = useSearchParams(), go = useViewNavigation();
  const ledger = useContentLedger();
  const schedules = useContentSchedule('all');
  const [brandFilter, setBrandFilter] = React.useState(() => params.get('brand') || 'all');
  React.useEffect(() => { setBrandFilter(params.get('brand') || 'all'); }, [params]);
  const captureRef = React.useRef(null);
  const focusCapture = React.useCallback(() => captureRef.current?.focus(), []);
  // N은 한 줄 담기 칸으로 — 이 보기의 생성 표면이 그 칸이다(DESIGN §8.1, 내 작업과 같은 방식).
  usePageCreateHotkey(focusCapture);

  const brands = ws ? filterBrandsByWorkspace(ledger.brands || [], workspace) : (ledger.brands || []);
  const selectedBrand = brands.find((brand) => brand.id === brandFilter || brand.key === brandFilter);
  const scoped = Boolean(ws) || brandFilter !== 'all';
  const items = contentQueueScope(filterContentByWorkspace(ledger.items || [], workspace), brandFilter);
  const scheduleRows = schedules.status === 'live' ? schedules.schedules : [];
  const lanes = buildFlow({ items, variants: ledger.variants || [], schedules: scheduleRows });
  const ids = new Set(items.map((item) => item.id));
  const logRows = buildPublishLog({ schedules: scheduleRows, publishLogs: ledger.publishLogs || [] }).filter((row) => !scoped || ids.has(row.contentId));
  const week = flowWeek(logRows);
  const scheduleUnknown = ['error', 'preview'].includes(schedules.status) && ledger.syncState !== 'preview';
  const sync = ledger.syncState;
  const retry = () => { void readContentLedger(); schedules.reload(); };
  const capture = ({ onSaved }) => (
    <ContentIdeaCapture compact inputRef={captureRef} brands={brands} initialBrand={selectedBrand?.id || ''}
      orgScope={workspace === 'classin' ? 'company' : 'personal'} fixedScope={Boolean(ws)} onSaved={onSaved} />
  );
  const making = lanes.plan.length + lanes.make.length + lanes.polish.length;

  return (
    <div className="hub-page content-flow fade-up">
      <ContentPageHead view={view}
        note={<>
          <span>{view === 'make' ? '고르기 → 계획 → 대본, 왼쪽에서 오른쪽으로' : '고르고, 계획하고, 대본까지 — 한 보드에서'}</span>
          {(sync === 'live' || sync === 'partial') && view === 'board' && <span className="cflow-dim">아이디어 <span className="mono cflow-fg">{lanes.idea.length}</span> · 만드는 중 <span className="mono cflow-fg">{making}</span></span>}
          {sync === 'partial' && <TruthBadge state="partial" reason="콘텐츠 기록 일부만 확인" />}
          {sync === 'partial' && <Button variant="outline" size="xs" onClick={retry}>다시 읽기</Button>}
        </>} />
      {brands.length > 0 && (
        <div className="cflow-scope">
          <SelectField label="브랜드" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} fieldClassName="cflow-scope__brand"
            options={[{ value: 'all', label: '전체 브랜드 · 미지정 포함' }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]} />
        </div>
      )}
      {sync === 'loading' ? <FlowSkeleton view={view} />
        : sync === 'error' ? (
          <div className="cflow-truth"><TruthBadge state="error" reason="콘텐츠 기록" /><p>기록을 읽지 못했어요. 콘텐츠가 비어 있다는 뜻은 아닙니다.</p><Button variant="outline" size="sm" onClick={retry}>다시 읽기</Button></div>
        ) : sync === 'preview' ? (
          <div className="cflow-truth"><TruthBadge state="preview" /><p>저장소가 연결되면 담은 소재와 원고가 여기에 표시됩니다.</p></div>
        ) : view === 'board'
          ? <BoardView lanes={lanes} capture={capture} week={week} scheduleUnknown={scheduleUnknown} partial={sync === 'partial'} onFocusCapture={focusCapture} />
          : <MakeView lanes={lanes} capture={capture} week={week} scheduleUnknown={scheduleUnknown} partial={sync === 'partial'} onBoard={() => go({ view: 'board' })} />}
    </div>
  );
}
