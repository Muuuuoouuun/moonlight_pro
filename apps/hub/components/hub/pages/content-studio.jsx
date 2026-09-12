"use client";

import React from 'react';
import { JournalSources } from '../journal-links';
import { Badge, Button, Card, Drawer, TextField, TextAreaField, SelectField, TruthBadge } from '../hub-primitives';
import { filterBrandsByWorkspace } from '../workspace-map';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { BRIEF_FIELDS, STUDIO_CHANNELS, channelLabel, formatForChannel, exportStudioVariant, studioTextForCopy } from '@/lib/content-workflow-client';
import { useContentStudio } from './use-content-studio';
import { DraftEditor } from './content-studio-editors';
import { StudioAI } from './content-studio-ai';
import './content-studio.css';

const BLOCKERS = [
  { value: '', label: '막힘 없음' }, { value: 'direction', label: '방향이 아직 모호함' },
  { value: 'evidence', label: '근거·사례가 필요함' }, { value: 'writing', label: '문장을 쓰기 어려움' },
  { value: 'production', label: '이미지·촬영 등 제작 대기' }, { value: 'review', label: '검토가 필요함' },
];
const SAVE_LABELS = { idle: '새 초안', editing: '변경됨', saving: '서버 저장 중', saved: '서버 저장됨', local: '서버 미연결', error: '서버 저장 미확인', conflict: '최신 내용 확인 필요' };
const REASONS = { checkpoint: '직접 저장한 버전', before_apply: 'AI 적용 전', after_apply: 'AI 적용 후', before_restore: '복원 전', branch_source: '채널 변형에 사용한 원본', branch: '파생 결과물' };
const dateLabel = (value) => value ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function ContentStudio({ workspace, ledger }) {
  const studio = useContentStudio(workspace), { draft } = studio;
  const [selection, setSelection] = React.useState(null), [drawer, setDrawer] = React.useState(null);
  const [sourceOpen, setSourceOpen] = React.useState(true);
  const [newChannel, setNewChannel] = React.useState('instagram'), [notice, setNotice] = React.useState('');
  const brands = filterBrandsByWorkspace(ledger.brands || [], workspace).filter((brand) => brand.id && brand.key !== 'all');
  const allBrands = ledger.brands || [];
  const selectedBrand = allBrands.find((brand) => brand.id === draft.brandId);
  const brandOptions = [{ value: '', label: '브랜드 선택' }, ...brands.map((brand) => ({ value: brand.id, label: brand.name || brand.label || brand.key }))];
  if (draft.brandId && !brandOptions.some((brand) => brand.value === draft.brandId)) brandOptions.push({ value: draft.brandId, label: selectedBrand?.name || '저장된 브랜드' });
  const disabled = !studio.ready || studio.busy || !!studio.recovery || !!studio.pendingMutation;
  const revisions = (studio.detail?.revisions || []).filter((revision) => revision.variant_id === draft.variantId);
  const variants = studio.detail?.variants || [];
  usePageCreateHotkey(studio.newDraft);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(studioTextForCopy(draft));
      setNotice('결과물을 복사했습니다. 원하는 채널에 붙여넣을 수 있습니다.');
    } catch { setNotice('복사하지 못했습니다. 내보내기로 파일을 받거나 본문을 직접 선택해주세요.'); }
  };
  const download = () => {
    try {
      const exported = exportStudioVariant(draft);
      const url = URL.createObjectURL(new Blob([exported.text], { type: exported.mime + ';charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = exported.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('결과물 파일을 내보냈습니다.');
    } catch (error) { setNotice(error.message); }
  };
  const openHistory = async () => { setDrawer('history'); await studio.refreshHistory(); };
  const createVariant = async () => {
    const type = formatForChannel(newChannel);
    const body = type === 'card_news' ? '{"slides":[]}' : type === 'reels_script' ? '{"scenes":[]}' : '';
    const result = await studio.mutate({ action: 'create_variant', variant: { title: draft.variantTitle || draft.title, body, variantType: type, channel: newChannel } });
    if (result) { setDrawer(null); setSelection(null); }
  };
  const saveTruth = ['error', 'conflict'].includes(studio.saveState) ? 'error' : studio.saveState === 'saving' ? 'syncing' : studio.saveState === 'saved' ? 'live' : 'preview';
  return <div className="hub-page content-studio">
    <header className="studio-page-header">
      <div><h2>콘텐츠 스튜디오</h2><p>메모를 기획으로, 초안을 채널별 콘텐츠로.</p></div>
      <div className="studio-actions">
        <Button variant="outline" onClick={studio.newDraft} disabled={studio.busy || !!studio.recovery || !!studio.pendingMutation} icon="plus">새 콘텐츠</Button>
        <Button onClick={openHistory} disabled={!draft.variantId || studio.busy}>버전 기록</Button>
        <Button variant="primary" onClick={() => studio.save(true)} disabled={disabled || studio.saveState === 'saving'}>버전 저장</Button>
      </div>
    </header>
    <div className="studio-status-bar" aria-live="polite">
      <TruthBadge state={saveTruth} label={SAVE_LABELS[studio.saveState]} />
      <span className="studio-small studio-muted">{studio.localState === 'error' ? '브라우저 복구 사본 저장 불가 · 파일로 내보내기를 권장합니다.' : studio.localSavedAt ? '브라우저 복구 사본 ' + dateLabel(studio.localSavedAt) : '입력한 내용은 자동 저장됩니다.'}</span>
      {studio.dirty && studio.saveState !== 'saving' && <Button size="xs" onClick={() => studio.save()} disabled={disabled}>서버 저장 재시도</Button>}
    </div>
    {studio.saveMessage && <div className="studio-feedback" role="status">
      <p>{studio.saveMessage}</p>
      {studio.saveState === 'conflict' && <Button variant="outline" onClick={studio.compareLatest}>최신 저장본과 비교</Button>}
      {studio.pendingMutation && <Button variant="outline" onClick={studio.retryMutation} disabled={studio.busy}>이전 작업 상태 확인</Button>}
    </div>}
    {notice && <div className="studio-feedback" role="status"><p>{notice}</p><Button size="xs" onClick={() => setNotice('')}>닫기</Button></div>}
    {studio.loadError ? <Card className="studio-stack"><p role="alert">{studio.loadError}</p><Button variant="outline" onClick={studio.retryLoad}>다시 불러오기</Button></Card> :
      !studio.ready ? <Card><p role="status" className="studio-muted">원문과 결과물을 불러오는 중입니다…</p></Card> :
      <>
        {studio.recovery && <Card className="studio-recovery">
          <h3>브라우저에 남은 작업이 있습니다</h3>
          <p>{studio.recovery.unavailable ? '서버 상태를 확인할 수 없습니다. 브라우저 사본을 새 콘텐츠로 복구하거나 서버를 다시 불러올 수 있습니다.' : studio.recovery.stale ? '서버의 내용도 바뀌었습니다. 복구 사본은 새 콘텐츠로 이어 쓸 수 있습니다.' : '이 브라우저의 변경 내용을 이어서 편집할 수 있습니다.'}</p>
          <div className="studio-recovery-compare">
            <div><strong>서버 저장본</strong><pre>{studio.recovery.unavailable ? '서버 내용 확인 불가' : studio.recovery.server.body || studio.recovery.server.sourceIdea || '아직 저장된 내용 없음'}</pre></div>
            <div><strong>브라우저 복구 사본</strong><pre>{studio.recovery.local.body || studio.recovery.local.sourceIdea}</pre></div>
          </div>
          <div className="studio-actions">
            <Button variant="primary" onClick={() => studio.recover(true)}>{studio.recovery.stale ? '새 콘텐츠로 복구' : '복구 사본 이어쓰기'}</Button>
            <Button variant="outline" onClick={() => studio.recover(false)}>{studio.recovery.unavailable ? '서버 다시 불러오기' : '서버 저장본 사용'}</Button>
          </div>
        </Card>}
        <div className="studio-layout">
          <section className="studio-main" aria-label="원문과 결과물 편집">
            <Card className="studio-source-card">
              <details open={sourceOpen} onToggle={(event) => setSourceOpen(event.currentTarget.open)}>
                <summary><span>원문 · 기획 카드</span><span className="studio-summary-count">{BRIEF_FIELDS.filter(({ key }) => draft.brief[key]?.trim()).length} / 6 항목</span></summary>
                <div className="studio-stack studio-source-fields">
                  <div className="studio-fields-two">
                    <TextField label="콘텐츠 기획 제목" value={draft.title} onChange={(event) => studio.edit({ title: event.target.value })} disabled={disabled} placeholder="이 콘텐츠를 구분할 이름" />
                    <SelectField label="브랜드" value={draft.brandId} options={brandOptions} onChange={(event) => studio.edit({ brandId: event.target.value })} disabled={disabled} />
                  </div>
                  <TextAreaField label="원문 메모" hint="처음 떠올린 생각과 맥락을 보관합니다. 복사·내보내기에는 포함하지 않습니다." placeholder="관찰한 것, 경험, 대화에서 떠오른 생각을 자유롭게 적어주세요." value={draft.sourceIdea} onChange={(event) => studio.edit({ sourceIdea: event.target.value })} rows={5} disabled={disabled} />
                  <details className="studio-brief-details"><summary>기획 구체화 <span className="studio-summary-count">{BRIEF_FIELDS.filter(({ key }) => draft.brief[key]?.trim()).length} / 6 항목</span></summary>
                  <div className="studio-fields-two studio-source-fields">
                    {BRIEF_FIELDS.map((field) => <TextAreaField key={field.key} label={field.label} placeholder={field.placeholder} value={draft.brief[field.key]} onChange={(event) => studio.edit({ brief: { ...draft.brief, [field.key]: event.target.value } })} rows={2} disabled={disabled} />)}
                  </div></details>
                </div>
              </details>
            </Card>
            <Card className="studio-editor-card">
              <div className="studio-stack">
                <div className="studio-variant-bar">
                  {variants.length > 0 ? <SelectField label="채널별 결과물" value={draft.variantId || ''} options={variants.map((variant) => ({ value: variant.id, label: channelLabel(variant.channel) + ' · ' + (variant.title || '제목 없음') }))} onChange={(event) => studio.switchVariant(event.target.value)} disabled={disabled} /> :
                    <SelectField label="첫 결과물 채널" value={draft.channel} options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} disabled={disabled || Boolean(draft.body)} onChange={(event) => studio.edit({ channel: event.target.value, variantType: formatForChannel(event.target.value) })} />}
                  <Button variant="outline" onClick={() => setDrawer('variant')} disabled={disabled} icon="plus">채널 추가</Button>
                </div>
                {studio.detail?.variantsHasMore && <p className="studio-muted studio-small">결과물이 많아 처음 250개를 표시하고 있습니다.</p>}
                <DraftEditor draft={draft} edit={studio.edit} disabled={disabled} onSelect={setSelection} />
                <div className="studio-export-bar">
                  <p className="studio-muted studio-small">선택한 결과물만 복사·내보내기합니다.</p>
                  <div className="studio-actions"><Button variant="outline" icon="copy" onClick={copy} disabled={!draft.body.trim()}>복사</Button><Button variant="outline" icon="download" onClick={download} disabled={!draft.body.trim()}>내보내기</Button></div>
                </div>
              </div>
            </Card>
          </section>
          <aside className="studio-sidebar" aria-label="콘텐츠 작업 도구">
            <Card><div className="studio-stack">
              <h3 className="studio-section-title">이어서 할 일</h3>
              <TextField label="다음 행동" value={draft.nextAction} placeholder="예: 실제 수업 사례 하나 넣기" onChange={(event) => studio.edit({ nextAction: event.target.value })} disabled={disabled} />
              <SelectField label="막힌 이유" value={draft.blocker} options={BLOCKERS} onChange={(event) => studio.edit({ blocker: event.target.value })} disabled={disabled} />
              <JournalSources refs={studio.detail?.item?.meta?.source_refs || draft.sourceRefs} />
              {draft.sourceRefs.some((ref) => ref.variant_id) && <div className="studio-stack">
                <p className="studio-muted studio-small">다른 결과물에서 파생되었습니다. 원본 버전과의 연결이 저장되어 있습니다.</p>
                {draft.sourceRefs[0]?.variant_id && <Button variant="outline" disabled={disabled} onClick={() => studio.switchVariant(draft.sourceRefs[0].variant_id)}>원본 결과물 열기</Button>}
              </div>}
            </div></Card>
            <StudioAI studio={studio} selection={selection} />
          </aside>
        </div>
      </>}
    {drawer === 'variant' && <Drawer title="채널 결과물 추가" subtitle="같은 원문·기획에서 채널별로 별도의 초안을 만듭니다." onClose={() => setDrawer(null)} footer={<Button variant="primary" onClick={createVariant} disabled={studio.busy}>빈 결과물 추가</Button>}>
      <div className="studio-stack"><SelectField label="추가할 채널" options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} value={newChannel} onChange={(event) => setNewChannel(event.target.value)} />
      <p className="studio-muted">현재 글을 AI로 변형하려면 AI 작업에서 ‘다른 채널로 변형’을 선택하세요.</p></div>
    </Drawer>}
    {drawer === 'history' && <Drawer title="버전 기록" subtitle={channelLabel(draft.channel) + ' · ' + (draft.variantTitle || '제목 없음')} width="min(540px, 94vw)" onClose={() => setDrawer(null)}>
      <div className="studio-stack">
        <p className="studio-muted studio-small">직접 저장하거나 AI 후보를 적용할 때 버전을 남깁니다. 복원하면 선택한 결과물의 내용과 상태가 돌아갑니다.</p>
        {revisions.length === 0 && <p className="studio-empty">아직 기록된 버전이 없습니다. ‘버전 저장’을 눌러 현재 내용을 남겨주세요.</p>}
        {revisions.map((revision) => <article key={revision.id} className="studio-revision">
          <div className="studio-row"><strong>{REASONS[revision.reason] || (revision.reason.startsWith('restored:') ? '복원한 버전' : '저장 버전')}</strong><span className="studio-muted studio-small">{dateLabel(revision.created_at)}</span></div>
          <p className="studio-small">{revision.snapshot?.title || '제목 없음'}</p><pre>{revision.snapshot?.body || '(빈 본문)'}</pre>
          <Button variant="outline" disabled={disabled} onClick={async () => {
            if (await studio.mutate({ action: 'restore_revision', revisionId: revision.id })) { await studio.refreshHistory(); setNotice('선택한 버전으로 복원했습니다.'); }
          }}>이 버전 복원</Button>
        </article>)}
        {studio.detail?.historyHasMore && <p className="studio-muted studio-small">콘텐츠의 최근 50개 기록 중 이 결과물의 버전을 표시하고 있습니다.</p>}
      </div>
    </Drawer>}
  </div>;
}
