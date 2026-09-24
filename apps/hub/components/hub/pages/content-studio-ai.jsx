"use client";

import React from 'react';
import { Badge, Button, SelectField, TextAreaField } from '../hub-primitives';
import {
  STUDIO_CHANNELS, buildStudioTransformCommand, isTransformStale, previewCandidate, studioErrorMessage,
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

export function StudioAI({ studio, selection, onOpenHistory, request = '', onRequestChange, templates, templateId = '', onPickTemplate, onSaveAsTemplate }) {
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
  const generate = async (op = operation) => {
    setOperation(op);
    setState((current) => ({ ...current, phase: 'generating', message: '' }));
    const saved = await save(true);
    if (!saved?.variantId) {
      setState((current) => ({ ...current, phase: 'error', message: '콘텐츠를 서버에 먼저 저장해야 AI로 작업할 수 있습니다.' }));
      return;
    }
    const command = buildStudioTransformCommand({ saved, operation: op, selection: activeSelection, tone, targetChannel,
      operatorRequest: request, structured, requestId: crypto.randomUUID() });
    requestRef.current = command;
    await dispatch(command);
  };
  const apply = async (candidate, mode) => {
    const result = await mutate({ action: 'apply_candidate', runId: state.run.id, candidateId: candidate.id, mode });
    if (result) setState({ phase: 'applied', message: mode === 'new_variant' ? '새 채널 결과물로 저장했습니다.' : '후보를 적용했습니다. 버전 기록에서 이전 내용으로 복원할 수 있습니다.', run: null, persisted: false, recoveryToken: null });
  };
  const persist = () => dispatch({ action: 'recover', requestId: state.run.id, recoveryToken: state.recoveryToken });
  const canRun = (op) => studio.ready && !recovery && !busy && !generating && !['unknown', 'running', 'unsaved'].includes(state.phase) &&
    (op === 'draft' ? Boolean(draft.sourceIdea.trim() || draft.brief.message.trim()) : Boolean(draft.body.trim()));
  const moreOperations = OPERATIONS.filter((entry) => !['draft', 'polish'].includes(entry.value) && (!structured || !['hooks', 'shorten'].includes(entry.value)));
  const moreOperation = moreOperations.some((entry) => entry.value === operation) ? operation : moreOperations[0]?.value;
  const moreGuidance = getEditorialGuidance(moreOperation);
  // 자주 쓰는 두 작업(초안·다듬기)만 버튼으로 드러내고, 나머지 작업·말투·기준은 '다른 작업'에 접어 둔다.
  const templateName = templates?.templates?.find((t) => t.id === templateId)?.name;
  const templateOptions = [{ value: '', label: templates?.status === 'loading' ? '불러오는 중…' : '템플릿 없이' },
    ...(templates?.templates || []).map((t) => ({ value: t.id, label: t.name }))];
  return <div className="studio-ai" aria-label="AI 작업">
    <div className="studio-stack">
      <details className="studio-ai-request">
        <summary>AI 요청 · 템플릿 <span className="studio-summary-count">{templateName || (request.trim() ? '직접 입력' : '없음')}</span></summary>
        <div className="studio-stack studio-source-fields">
          <SelectField label="템플릿" options={templateOptions} value={templateId} disabled={generating || templates?.status !== 'live'} onChange={(event) => onPickTemplate?.(event.target.value)} />
          {['preview', 'error'].includes(templates?.status) && <p role="status" className="studio-muted studio-small">
            {templates.status === 'preview' ? '템플릿 저장소 연결이 필요합니다. 요청은 이번 작업에만 쓸 수 있습니다.' : templates.message}
            {templates.status === 'error' && <> <Button size="xs" onClick={templates.reload}>다시 불러오기</Button></>}
          </p>}
          <TextAreaField label="AI에게 부탁할 것" hint="구성·길이·말투·강조를 적어 주세요. 여기 적은 사실·수치는 근거로 쓰지 않습니다 — 근거는 원문 메모에." placeholder="예: 첫 줄은 질문으로, 세 문단 이내, 반말, 마지막 줄은 한 줄 결론"
            value={request} onChange={(event) => onRequestChange?.(event.target.value)} rows={3} maxLength={2000} showCount disabled={generating} />
          <div className="studio-actions"><Button size="xs" variant="outline" disabled={generating || templates?.status !== 'live' || !request.trim()} onClick={onSaveAsTemplate}>이 요청을 템플릿으로 저장</Button></div>
        </div>
      </details>
      <div className="studio-actions studio-ai-actions">
        <Button variant="outline" icon="sparkle" disabled={!canRun('draft')} onClick={() => generate('draft')}>{generating && operation === 'draft' ? 'AI 초안 작성 중…' : 'AI 초안'}</Button>
        <Button variant="outline" icon="sparkle" disabled={!canRun('polish')} onClick={() => generate('polish')}>{generating && operation === 'polish' ? 'AI 다듬는 중…' : activeSelection ? '선택 부분 AI 다듬기' : 'AI 다듬기'}</Button>
        {!draft.sourceIdea.trim() && !draft.brief.message.trim() && !draft.body.trim() && <span className="studio-muted studio-small">원문 메모를 적으면 AI 초안을 만들 수 있습니다.</span>}
      </div>
      <details className="studio-ai-more">
        <summary>다른 작업 · 말투</summary>
        <div className="studio-stack studio-source-fields">
          <SelectField label="작업" options={moreOperations} value={moreOperation} disabled={generating || busy} onChange={(event) => setOperation(event.target.value)} />
          {moreOperation === 'repurpose' && <SelectField label="변형할 채널" options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} disabled={generating || busy} />}
          <SelectField label="말투" options={TONES} value={tone} disabled={generating || busy} onChange={(event) => setTone(event.target.value)} />
          <details className="studio-criteria">
            <summary>적용 기준 · {moreGuidance.criteria.map(rule => rule.label).join(' / ')}</summary>
            <ul>{moreGuidance.criteria.map(rule => <li key={rule.id} title={rule.source}>{rule.criterion}</li>)}</ul>
          </details>
          <div className="studio-actions"><Button variant="outline" icon="sparkle" disabled={!moreOperation || !canRun(moreOperation)} onClick={() => generate(moreOperation)}>{generating && operation === moreOperation ? 'AI 작업 중…' : '실행'}</Button></div>
        </div>
      </details>
      {generating && <p role="status" className="studio-muted studio-small">{officeEditing ? '님피아 편집 지침으로 작업 중입니다. ' : ''}작업 중에도 글을 쓸 수 있습니다. 본문이 바뀌면 새 내용으로 다시 생성해야 합니다.</p>}
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
  </div>;
}
