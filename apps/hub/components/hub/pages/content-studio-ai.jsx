"use client";

import React from 'react';
import { Badge, Button, Card, SelectField } from '../hub-primitives';
import {
  STUDIO_CHANNELS, formatForChannel, isTransformStale, previewCandidate, studioErrorMessage,
} from '@/lib/content-workflow-client';
import { postStudio } from './use-content-studio';
import { ResultPreview } from './content-studio-editors';
import { getEditorialGuidance } from '@com-moon/content-manager/editorial-criteria';
import { isOfficeStudioOperation } from '@com-moon/agent-contracts/office-studio';
import { contentChangePreview } from '@/lib/content-change-preview';

const OPERATIONS = [
  { value: 'draft', label: '원문·기획에서 초안 작성' },
  { value: 'polish', label: '문장 다듬기' },
  { value: 'shorten', label: '더 짧게 줄이기' },
  { value: 'hooks', label: '도입부 3가지 제안' },
  { value: 'repurpose', label: '다른 채널로 변형' },
];
const TONES = [{ value: 'brand', label: '브랜드 말투' }, { value: 'plain', label: '담백하게' }, { value: 'direct', label: '명확하게' }, { value: 'formal', label: '정중하게' }];

function ChangePreview({ before, after }) {
  const comparison = React.useMemo(() => contentChangePreview(before, after), [before, after]);
  if (comparison.unchanged) return <p className="studio-muted studio-small">본문 변경 없음</p>;
  return <div className="studio-change-preview">
    <p className="studio-muted studio-small">처음부터 마지막 변경까지 표시합니다.</p>
    <div className="studio-change-grid">
      <section aria-label="변경 전"><strong>변경 전</strong><pre>{comparison.before.prefix}<del>{comparison.before.changed}</del>{comparison.before.suffix}</pre></section>
      <section aria-label="변경 후"><strong>변경 후</strong><pre>{comparison.after.prefix}<ins>{comparison.after.changed}</ins>{comparison.after.suffix}</pre></section>
    </div>
  </div>;
}

export function StudioAI({ studio, selection, onOpenHistory }) {
  const { draft, save, mutate, busy, recovery } = studio;
  const [operation, setOperation] = React.useState('draft'), [tone, setTone] = React.useState('brand');
  const [targetChannel, setTargetChannel] = React.useState('instagram');
  const [state, setState] = React.useState({ phase: 'idle', message: '', run: null, persisted: false, recoveryToken: null });
  const requestRef = React.useRef(null), documentRef = React.useRef(draft.variantId);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    if (documentRef.current === draft.variantId) return;
    documentRef.current = draft.variantId;
    // A source may first receive its ID during the save preceding generation.
    if (state.phase !== 'generating') {
      requestRef.current = null;
      setState({ phase: 'idle', message: '', run: null, persisted: false, recoveryToken: null });
    }
  }, [draft.variantId, state.phase]);
  const structured = ['card_news', 'reels_script'].includes(draft.variantType);
  React.useEffect(() => {
    if (structured && ['hooks', 'shorten'].includes(operation)) setOperation('polish');
  }, [structured, operation]);
  const activeSelection = !structured && selection?.body === draft.body && selection.end > selection.start ? selection : null;
  const stale = state.run ? isTransformStale(state.run, draft) || studio.dirty : false;
  const generating = state.phase === 'generating';
  const candidates = state.run?.result?.candidates || [];
  const selectedText = activeSelection ? draft.body.slice(activeSelection.start, activeSelection.end) : '';
  const source = state.run?.source_snapshot;
  const guidance = getEditorialGuidance(operation);
  const resultGuidance = source?.editorialGuidance;
  const officeEditing = isOfficeStudioOperation(operation, { variantType: draft.variantType, channel: draft.channel });
  const resultOffice = source?.officeProvenance?.ownerId === 'sylveon' ? source.officeProvenance : null;
  const dispatch = async (request) => {
    setState((current) => ({ ...current, phase: 'generating', message: '' }));
    try {
      const result = await postStudio('transform', request);
      if (!mounted.current) return;
      if (['generated', 'duplicate', 'unsaved'].includes(result.status) && result.run) {
        setState({ phase: result.status, run: result.run, persisted: result.persisted === true,
          recoveryToken: result.recoveryToken || null, message: result.status === 'unsaved' ? '후보는 생성됐지만 서버에 보관하지 못했습니다. 생성 없이 저장만 다시 시도할 수 있습니다.' : '' });
      } else {
        const pending = ['running', 'unknown'].includes(result.status);
        setState((current) => ({ ...current, phase: pending ? result.status : 'error',
          message: pending ? '이 요청의 완료 여부를 확인 중입니다. 같은 요청 확인은 새 생성을 시작하지 않습니다.' : studioErrorMessage(result, 'AI 결과를 만들지 못했습니다. 설정을 확인하거나 같은 요청의 상태를 확인해주세요.') }));
      }
    } catch {
      if (mounted.current) setState((current) => ({ ...current, phase: 'unknown', message: '응답이 끊겨 생성 결과를 확인하지 못했습니다. 같은 요청의 상태를 확인해주세요.' }));
    }
  };
  const generate = async () => {
    setState((current) => ({ ...current, phase: 'generating', message: '' }));
    const saved = await save(true);
    if (!saved?.variantId) {
      setState((current) => ({ ...current, phase: 'error', message: '콘텐츠를 서버에 먼저 저장해야 AI로 작업할 수 있습니다.' }));
      return;
    }
    const channel = operation === 'repurpose' ? targetChannel : saved.channel;
    const sameSelection = activeSelection && activeSelection.body === saved.body;
    let range = sameSelection ? { start: activeSelection.start, end: activeSelection.end } : { start: 0, end: saved.body.length };
    if (operation === 'draft' || operation === 'repurpose' || structured) range = { start: 0, end: saved.body.length };
    if (operation === 'hooks' && !sameSelection) range.end = saved.body.indexOf('\n\n') >= 0 ? saved.body.indexOf('\n\n') : saved.body.length;
    const request = {
      requestId: crypto.randomUUID(), contentId: saved.contentId, variantId: saved.variantId,
      expectedVariantUpdatedAt: saved.variantUpdatedAt, operation, selection: range, tone,
      target: { variantType: operation === 'repurpose' ? formatForChannel(channel) : saved.variantType, channel },
    };
    requestRef.current = request;
    await dispatch(request);
  };
  const apply = async (candidate, mode) => {
    const result = await mutate({ action: 'apply_candidate', runId: state.run.id, candidateId: candidate.id, mode });
    if (result) setState({ phase: 'applied', message: mode === 'new_variant' ? '새 채널 결과물로 저장했습니다.' : '후보를 적용했습니다. 버전 기록에서 이전 내용으로 복원할 수 있습니다.', run: null, persisted: false, recoveryToken: null });
  };
  const persist = () => dispatch({ action: 'recover', requestId: state.run.id, recoveryToken: state.recoveryToken });
  const canGenerate = studio.ready && !recovery && !busy && !generating &&
    (operation === 'draft' ? Boolean(draft.sourceIdea.trim() || draft.brief.message.trim()) : Boolean(draft.body.trim()));
  return <Card className="studio-ai-card">
    <div className="studio-stack">
      <div className="studio-row"><h3 className="studio-section-title">{officeEditing ? `님피아 · ${operation === 'draft' ? '원고 초안' : '원고 다듬기'}` : 'AI 작업'}</h3><Badge tone="neutral" size="xs">비교 후 적용</Badge></div>
      <SelectField label="무엇을 만들까요?" options={OPERATIONS.filter((entry) => !structured || !['hooks', 'shorten'].includes(entry.value))} value={operation} disabled={generating || busy} onChange={(event) => setOperation(event.target.value)} />
      <SelectField label="말투" options={TONES} value={tone} disabled={generating || busy} onChange={(event) => setTone(event.target.value)} />
      <details className="studio-criteria" open>
        <summary>적용 기준 · {guidance.criteria.map(rule => rule.label).join(' / ')}</summary>
        <ul>{guidance.criteria.map(rule => <li key={rule.id} title={rule.source}>{rule.criterion}</li>)}</ul>
      </details>
      {operation === 'repurpose' && <SelectField label="변형할 채널" options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} disabled={generating || busy} />}
      <div className="studio-ai-context">
        <span className="studio-eyebrow">{operation === 'draft' ? '원문 + 기획 카드' : operation === 'repurpose' ? '현재 결과물 전체' : activeSelection ? '선택한 부분' : operation === 'hooks' ? '첫 문단' : '현재 결과물 전체'}</span>
        <p>{operation === 'draft' ? '입력한 메모와 기획을 바탕으로 초안을 만듭니다. 부족한 근거는 별도로 표시합니다.' : selectedText && operation !== 'repurpose' ? selectedText.slice(0, 180) : '저장된 콘텐츠와 선택한 브랜드의 지침을 사용합니다.'}</p>
      </div>
      <Button variant="primary" icon="sparkle" disabled={!canGenerate || ['unknown', 'running', 'unsaved'].includes(state.phase)} onClick={generate}>
        {generating ? 'AI 작업 중…' : candidates.length ? '새 후보 생성' : officeEditing ? operation === 'draft' ? '님피아로 초안 만들기' : '님피아로 원고 다듬기' : '후보 만들기'}
      </Button>
      {!draft.sourceIdea && !draft.brief.message && operation === 'draft' && <p className="studio-muted studio-small">먼저 원문 메모나 핵심 메시지를 적어주세요.</p>}
      {generating && <p role="status" className="studio-muted studio-small">작업 중에도 글을 쓸 수 있습니다. 본문이 바뀌면 새 내용으로 다시 생성해야 합니다.</p>}
      {state.message && <p role="status" className={['error', 'unknown'].includes(state.phase) ? 'studio-error' : 'studio-muted'}>{state.message}</p>}
      {state.phase === 'applied' && onOpenHistory && <Button variant="outline" onClick={onOpenHistory}>이전 버전 확인·복원</Button>}
      {['running', 'unknown', 'error'].includes(state.phase) && requestRef.current && <Button variant="outline" onClick={() => dispatch(requestRef.current)} disabled={generating}>같은 요청 상태 확인</Button>}
      {state.recoveryToken && !state.persisted && <Button variant="outline" onClick={persist} disabled={generating}>생성 없이 후보 저장 재시도</Button>}
      {['running', 'unknown'].includes(state.phase) && !candidates.length && <Button onClick={() => {
        requestRef.current = null;
        setState({ phase: 'idle', message: '새로 생성하면 별도의 AI 작업으로 실행됩니다.', run: null, persisted: false, recoveryToken: null });
      }}>현재 요청 닫기</Button>}
      {stale && <p className="studio-error" role="status">후보를 만든 뒤 본문이나 버전이 바뀌었습니다. 현재 내용으로 새 후보를 만들어주세요.</p>}
      {candidates.length > 0 && <div className="studio-candidates">
        <div className="studio-row"><h3 className="studio-section-title">변경 비교</h3><Button size="xs" disabled={generating} onClick={() => setState({ phase: 'idle', message: '', run: null, persisted: false, recoveryToken: null })}>후보 닫기</Button></div>
        {resultOffice && <p className="studio-muted studio-small">님피아 편집 지침으로 생성한 후보 · 비교하고 사실을 확인한 뒤 적용하세요.</p>}
        {resultGuidance && <details className="studio-criteria"><summary>이 후보에 사용한 기준 · {resultGuidance.version}</summary><ul>{resultGuidance.criteria.map(rule => <li key={rule.id} title={rule.source}>{rule.criterion}</li>)}</ul></details>}
        {resultOffice && <details className="studio-criteria"><summary>이 후보의 역할 기준</summary><p className="studio-muted studio-small">정책 {resultOffice.policyVersion} · 역할 {resultOffice.personaVersion}. 생성과 출력 형식 검사를 거친 후보이며 사실 검증 완료를 뜻하지 않습니다.</p></details>}
        {(structured || state.run.operation === 'repurpose') && <details className="studio-source-compare"><summary>변경 전 보기</summary><pre>{source?.selectionText || source?.body || draft.sourceIdea}</pre></details>}
        {candidates.map((candidate, index) => <article key={candidate.id} className="studio-candidate">
          <div className="studio-row"><strong>{candidates.length > 1 ? '후보 ' + (index + 1) : '제안된 결과'}</strong><Badge size="xs" tone="neutral">{state.persisted ? '후보 저장됨' : '저장 대기'}</Badge></div>
          {candidate.title && <p>{candidate.title}</p>}
          {candidate.summary && <p className="studio-muted studio-small">{candidate.summary}</p>}
          {!structured && state.run.operation !== 'repurpose' ? <ChangePreview before={source?.selectionText || source?.body || draft.sourceIdea} after={candidate.body} /> : <ResultPreview body={candidate.body} type={candidate.variantType} />}
          {candidate.missing?.length > 0 && <div className="studio-missing"><strong>확인이 필요한 내용</strong><ul>{candidate.missing.map((missing, i) => <li key={i}>{missing}</li>)}</ul></div>}
          <div className="studio-actions">
            {state.run.operation !== 'repurpose' && <Button variant="primary" disabled={!state.persisted || stale || busy || generating || !!recovery} onClick={() => apply(candidate, 'replace')}>이 후보 적용</Button>}
            <Button variant={state.run.operation === 'repurpose' ? 'primary' : 'outline'} disabled={!state.persisted || stale || busy || generating || !!recovery || Boolean(source?.prefix || source?.suffix)} onClick={() => apply(candidate, 'new_variant')}>새 결과물로 저장</Button>
          </div>
          {source && (source.prefix || source.suffix) && <details className="studio-source-compare"><summary>적용 후 전체 글 보기</summary><pre>{previewCandidate(source, candidate)}</pre></details>}
        </article>)}
        <p className="studio-muted studio-small">AI가 제안한 사실·수치·인용은 확인한 뒤 사용해주세요.</p>
      </div>}
    </div>
  </Card>;
}
