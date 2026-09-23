"use client";

import React from 'react';
import { JournalSources } from '../journal-links';
import { GoalLinks } from '../goal-links';
import { Button, Card, Drawer, Kbd, Skeleton, TextField, TextAreaField, SelectField, TruthBadge, useToast } from '../hub-primitives';
import { filterBrandsByWorkspace } from '../workspace-map';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { BRIEF_FIELDS, STUDIO_CHANNELS, channelLabel, channelForType, formatForChannel, exportStudioVariant, studioTextForCopy } from '@/lib/content-workflow-client';
import { useContentStudio } from './use-content-studio';
import { DraftEditor } from './content-studio-editors';
import { StudioAI } from './content-studio-ai';
import { FloatingMentorWidget } from '../floating-mentor-widget';
import './content-studio.css';

// 기본 화면은 "Threads 글 한 편 끝내기"만 담는다: 메모 → 본문 → AI 초안/다듬기 → 복사 → 발행 기록.
// 나머지(브랜드·기획·채널·버전·내보내기·목표·검토)는 '더보기' 드로어에 둔다.
// 새 기능을 이 화면 본문에 패널로 붙이지 않는다 — 2026-09-23 Studio 단순화 스펙 §3.
const BLOCKERS = [
  { value: '', label: '막힘 없음' }, { value: 'direction', label: '방향이 아직 모호함' },
  { value: 'evidence', label: '근거·사례가 필요함' }, { value: 'writing', label: '문장을 쓰기 어려움' },
  { value: 'production', label: '이미지·촬영 등 제작 대기' }, { value: 'review', label: '검토가 필요함' },
];
// 평소 저장은 조용한 한 단어로만 알린다. 사용자가 행동해야 하는 상태만 TruthBadge로 올린다.
const QUIET_SAVE = { idle: '', editing: '입력 중', saving: '저장 중…', saved: '저장됨' };
const LOUD_SAVE = { local: '서버 미연결', error: '서버 저장 미확인', conflict: '최신 내용 확인 필요' };
const REASONS = { checkpoint: '직접 저장한 버전', before_apply: 'AI 적용 전', after_apply: 'AI 적용 후', before_restore: '복원 전', branch_source: '채널 변형에 사용한 원본', branch: '파생 결과물' };
const dateLabel = (value) => value ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function ContentStudio({ workspace, ledger }) {
  const studio = useContentStudio(workspace), { draft } = studio;
  const toast = useToast();
  const [selection, setSelection] = React.useState(null), [drawer, setDrawer] = React.useState(null);
  const [memoOpen, setMemoOpen] = React.useState(null);
  const [publicationUrl, setPublicationUrl] = React.useState('');
  const [publicationDate, setPublicationDate] = React.useState('');
  const [mentorOpen, setMentorOpen] = React.useState(false);
  const [mentorMode, setMentorMode] = React.useState('advice');
  const [newChannel, setNewChannel] = React.useState('instagram'), [notice, setNotice] = React.useState('');
  const brands = filterBrandsByWorkspace(ledger.brands || [], workspace).filter((brand) => brand.id && brand.key !== 'all');
  const allBrands = ledger.brands || [];
  const selectedBrand = allBrands.find((brand) => brand.id === draft.brandId);
  const brandOptions = [{ value: '', label: '브랜드 선택' }, ...brands.map((brand) => ({ value: brand.id, label: brand.name || brand.label || brand.key }))];
  if (draft.brandId && !brandOptions.some((brand) => brand.value === draft.brandId)) brandOptions.push({ value: draft.brandId, label: selectedBrand?.name || '저장된 브랜드' });
  const disabled = !studio.ready || studio.busy || !!studio.recovery || !!studio.pendingMutation;
  const revisions = studio.history?.revisions || [];
  const variants = studio.detail?.variants || [];
  const briefCount = BRIEF_FIELDS.filter(({ key }) => draft.brief[key]?.trim()).length;
  // 본문이 비어 있으면 메모부터 보이게 연다. 사용자가 직접 접거나 펼치면 그 선택을 따른다.
  const memoIsOpen = memoOpen ?? !draft.body.trim();
  usePageCreateHotkey(studio.newDraft);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(studioTextForCopy(draft));
      toast.success('복사했습니다. Threads에 붙여넣으세요.');
    } catch { toast.error('복사하지 못했습니다. 더보기 → 파일로 내보내기를 쓰거나 본문을 직접 선택해주세요.'); }
  };
  const download = () => {
    try {
      const exported = exportStudioVariant(draft);
      const url = URL.createObjectURL(new Blob([exported.text], { type: exported.mime + ';charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = exported.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('결과물 파일을 내보냈습니다.');
    } catch (error) { toast.error(error.message); }
  };
  const openHistory = async () => { setDrawer('history'); await studio.refreshHistory(); };
  // 발행 일시는 보통 '방금'이므로 지금 시각을 미리 채운다(로컬 datetime-local 형식).
  const openPublication = () => {
    if (!publicationDate) {
      const now = new Date();
      setPublicationDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    setDrawer('publication');
  };
  const openMentor = (mode) => { setDrawer(null); setMentorMode(mode); setMentorOpen(true); };
  const createVariant = async () => {
    const type = formatForChannel(newChannel);
    const body = type === 'card_news' ? '{"slides":[]}' : type === 'reels_script' ? '{"scenes":[]}' : '';
    const result = await studio.mutate({ action: 'create_variant', variant: { title: draft.variantTitle || draft.title, body, variantType: type, channel: newChannel } });
    if (result) {
      setDrawer(null);
      setSelection(null);
      toast.success('새 채널 결과물을 추가했습니다.');
    }
  };
  const loud = studio.loadError ? '불러오기 실패' : LOUD_SAVE[studio.saveState];
  const quiet = !studio.ready ? '' : QUIET_SAVE[studio.saveState] ?? '';
  const channelOptions = variants.map((variant) => ({ value: variant.id, label: channelLabel(variant.channel || channelForType(variant.variant_type)) + ' · ' + (variant.title || '제목 없음') }));
  return <div className="hub-page content-studio">
    <header className="studio-page-header">
      <div><h2>원고 작성</h2><p>{channelLabel(draft.channel)} · 메모에서 시작해 다듬고 복사합니다.</p></div>
      <div className="studio-actions">
        <span className="studio-save-state" aria-live="polite">
          {loud ? <TruthBadge state={studio.loadError || studio.saveState !== 'local' ? 'error' : 'preview'} label={loud} /> : quiet && <span className="studio-muted studio-small">{quiet}</span>}
        </span>
        {studio.dirty && ['local', 'error'].includes(studio.saveState) && <Button size="xs" onClick={() => studio.save()} disabled={disabled}>저장 재시도</Button>}
        <Button variant="ghost" onClick={studio.newDraft} disabled={(!studio.ready && !studio.loadError) || studio.busy || !!studio.recovery || !!studio.pendingMutation} icon="plus">새 글 <Kbd>N</Kbd></Button>
        <Button variant="outline" icon="more" onClick={() => setDrawer('more')} disabled={!studio.ready}>더보기</Button>
      </div>
    </header>
    {studio.saveMessage && <div className="studio-feedback" role="status">
      <p>{studio.saveMessage}</p>
      {studio.saveState === 'conflict' && <Button variant="outline" onClick={studio.compareLatest}>최신 저장본과 비교</Button>}
      {studio.pendingMutation && <Button variant="outline" onClick={studio.retryMutation} disabled={studio.busy}>이전 작업 상태 확인</Button>}
    </div>}
    {studio.localState === 'error' && <div className="studio-feedback" role="status"><p>이 브라우저에 복구 사본을 남기지 못했습니다. 서버 저장이 확인되지 않으면 더보기 → 파일로 내보내기를 권장합니다.</p></div>}
    {notice && <div className="studio-feedback" role="status"><p>{notice}</p><Button size="xs" onClick={() => setNotice('')}>닫기</Button></div>}
    {studio.loadError ? <Card className="studio-stack"><p role="alert">{studio.loadError}</p><Button variant="outline" onClick={studio.retryLoad}>다시 불러오기</Button></Card> :
      /* 로딩은 들어올 레이아웃(메모 + 본문 편집기)을 예고한다 — DESIGN §11. */
      !studio.ready ? <Card className="studio-stack"><Skeleton lines={2} height={16} width={['34%', '78%']} gap={10} label="메모 불러오는 중" /><Skeleton lines={4} height={18} width={['100%', '100%', '100%', '62%']} gap={10} label="본문 불러오는 중" /></Card> :
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
        <section className="studio-main" aria-label="원고 작성">
          <Card className="studio-editor-card">
            <div className="studio-stack">
              <TextField aria-label="제목" value={draft.title} onChange={(event) => studio.edit({ title: event.target.value })} disabled={disabled} placeholder="제목 (선택 · 목록에서 찾을 이름)" />
              <details className="studio-memo" open={memoIsOpen} onToggle={(event) => setMemoOpen(event.currentTarget.open)}>
                <summary><span>원문 메모</span><span className="studio-summary-count">{draft.sourceIdea?.trim() ? '있음' : '비어 있음'}</span></summary>
                <TextAreaField aria-label="원문 메모" hint="떠오른 생각·계기를 적어두면 AI 초안의 재료가 됩니다. 복사에는 포함하지 않습니다." placeholder="관찰한 것, 경험, 대화에서 떠오른 생각을 자유롭게 적어주세요." value={draft.sourceIdea} onChange={(event) => studio.edit({ sourceIdea: event.target.value })} rows={4} disabled={disabled} />
              </details>
              {variants.length > 1 && <SelectField label="채널별 결과물" value={draft.variantId || ''} options={channelOptions} onChange={(event) => studio.switchVariant(event.target.value)} disabled={disabled} />}
              <DraftEditor draft={draft} edit={studio.edit} disabled={disabled} onSelect={setSelection} />
              <StudioAI studio={studio} selection={selection} onOpenHistory={openHistory} />
              <div className="studio-export-bar">
                <Button variant="primary" icon="copy" onClick={copy} disabled={!draft.body.trim()}>복사</Button>
                <Button variant="outline" onClick={openPublication} disabled={disabled || !draft.body.trim()}>발행했음</Button>
              </div>
            </div>
          </Card>
        </section>
      </>}
    {drawer === 'more' && <Drawer title="더보기" subtitle="자주 쓰지 않는 설정과 기록입니다." width="min(460px, 94vw)" onClose={() => setDrawer(null)}>
      <div className="studio-stack">
        <section className="studio-stack studio-more-section" aria-label="분류">
          <h3 className="studio-section-title">분류</h3>
          <SelectField label="브랜드" value={draft.brandId} options={brandOptions} onChange={(event) => studio.edit({ brandId: event.target.value })} disabled={disabled || ['loading', 'error'].includes(ledger.syncState)} />
          {['error', 'partial'].includes(ledger.syncState) && <p role="status" className="studio-muted studio-small">브랜드 목록을 모두 확인하지 못했습니다. 저장된 브랜드를 유지하며 편집할 수 있습니다.</p>}
          <TextField label="결과물 제목" value={draft.variantTitle} onChange={(event) => studio.edit({ variantTitle: event.target.value })} disabled={disabled} placeholder="채널별로 다른 제목이 필요할 때만" />
        </section>
        <section className="studio-stack studio-more-section" aria-label="채널">
          <h3 className="studio-section-title">채널</h3>
          {variants.length === 0 && <SelectField label="첫 결과물 채널" value={draft.channel} options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} disabled={disabled || Boolean(draft.body)} onChange={(event) => studio.edit({ channel: event.target.value, variantType: formatForChannel(event.target.value) })} />}
          {variants.length === 1 && <p className="studio-muted studio-small">현재 {channelLabel(draft.channel)} 결과물 하나입니다.</p>}
          {studio.detail?.variantsHasMore && <p className="studio-muted studio-small">결과물이 많아 처음 250개를 표시하고 있습니다.</p>}
          <div className="studio-actions">
            <Button variant="outline" icon="plus" onClick={() => setDrawer('variant')} disabled={disabled}>빈 채널 결과물 추가</Button>
          </div>
          <p className="studio-muted studio-small">지금 글을 다른 채널용으로 바꾸려면 AI의 ‘다른 작업 → 다른 채널로 변형’을 쓰세요.</p>
          {draft.sourceRefs.some((ref) => ref.variant_id) && draft.sourceRefs[0]?.variant_id && <Button variant="outline" disabled={disabled} onClick={() => { setDrawer(null); studio.switchVariant(draft.sourceRefs[0].variant_id); }}>원본 결과물 열기</Button>}
        </section>
        <section className="studio-stack studio-more-section" aria-label="기록">
          <h3 className="studio-section-title">기록</h3>
          <div className="studio-actions">
            <Button variant="outline" onClick={openHistory} disabled={!draft.variantId || studio.busy}>버전 기록</Button>
            <Button variant="outline" onClick={() => studio.save(true)} disabled={disabled || studio.saveState === 'saving'}>지금 버전 남기기</Button>
            <Button variant="outline" icon="download" onClick={download} disabled={!draft.body.trim()}>파일로 내보내기</Button>
          </div>
        </section>
        <details className="studio-more-section">
          <summary>기획 구체화 <span className="studio-summary-count"><span className="num">{briefCount} / 6</span></span></summary>
          <div className="studio-stack studio-source-fields">
            {BRIEF_FIELDS.map((field) => <TextAreaField key={field.key} label={field.label} placeholder={field.placeholder} value={draft.brief[field.key]} onChange={(event) => studio.edit({ brief: { ...draft.brief, [field.key]: event.target.value } })} rows={2} disabled={disabled} />)}
          </div>
        </details>
        <details className="studio-more-section">
          <summary>이어서 할 일</summary>
          <div className="studio-stack studio-source-fields">
            <TextField label="다음 행동" value={draft.nextAction} placeholder="예: 실제 수업 사례 하나 넣기" onChange={(event) => studio.edit({ nextAction: event.target.value })} disabled={disabled} />
            <SelectField label="막힌 이유" value={draft.blocker} options={BLOCKERS} onChange={(event) => studio.edit({ blocker: event.target.value })} disabled={disabled} />
          </div>
        </details>
        <details className="studio-more-section">
          <summary>연결된 일지·목표</summary>
          <div className="studio-stack studio-source-fields">
            <JournalSources refs={studio.detail?.item?.meta?.source_refs || draft.sourceRefs} />
            <GoalLinks entityType="content_items" entityId={studio.detail?.item?.id} scope={workspace} />
          </div>
        </details>
        <section className="studio-stack studio-more-section" aria-label="검토">
          <h3 className="studio-section-title">검토</h3>
          <div className="studio-actions">
            <Button variant="outline" icon="sparkle" onClick={() => openMentor('advice')} disabled={disabled}>방향 검토</Button>
            <Button variant="outline" icon="sparkle" onClick={() => openMentor('critique')} disabled={disabled}>검수 게이트 판정</Button>
          </div>
        </section>
      </div>
    </Drawer>}
    {drawer === 'publication' && <Drawer title="발행 기록" subtitle="외부 채널에 게시한 URL과 시각을 기록합니다. 운영자 확인이며 외부 게시 여부를 자동 검증하지 않습니다." presentation="compact" onClose={() => { if (!studio.busy) setDrawer(null); }} footer={<Button variant="primary" disabled={disabled} onClick={async () => {
      if (await studio.recordPublication(publicationUrl, publicationDate)) {
        setDrawer(null);
        setNotice('발행을 기록했습니다.');
      }
    }}>{studio.busy ? '확인 중…' : '발행 기록 저장'}</Button>}>
      <div className="studio-stack">
        <TextField label="발행 URL" value={publicationUrl} onChange={event => setPublicationUrl(event.target.value)} disabled={studio.busy} />
        <TextField label="발행 일시" type="datetime-local" value={publicationDate} onChange={event => setPublicationDate(event.target.value)} disabled={studio.busy} />
        {studio.saveMessage && <p role="status">{studio.saveMessage}</p>}
      </div>
    </Drawer>}
    {drawer === 'variant'  && <Drawer title="채널 결과물 추가" subtitle="같은 원문·기획에서 채널별로 별도의 초안을 만듭니다." presentation="compact" width="420px" onClose={() => setDrawer(null)} footer={<Button variant="primary" onClick={createVariant} disabled={studio.busy}>빈 결과물 추가</Button>}>
      <div className="studio-stack"><SelectField label="추가할 채널" options={STUDIO_CHANNELS.map(({ key, label }) => ({ value: key, label }))} value={newChannel} onChange={(event) => setNewChannel(event.target.value)} />
      <p className="studio-muted">현재 글을 AI로 변형하려면 AI의 ‘다른 작업 → 다른 채널로 변형’을 선택하세요.</p></div>
    </Drawer>}
    {drawer === 'history' && <Drawer title="버전 기록" subtitle={channelLabel(draft.channel) + ' · ' + (draft.variantTitle || '제목 없음')} width="min(540px, 94vw)" onClose={() => setDrawer(null)}>
      <div className="studio-stack">
        <p className="studio-muted studio-small">직접 남기거나 AI 후보를 적용할 때 버전이 남습니다. 복원하면 선택한 결과물의 내용과 상태가 돌아갑니다.</p>
        {studio.history?.loading && <p role="status" className="studio-muted">버전 기록을 불러오는 중입니다…</p>}
        {studio.history?.error && <div role="alert"><p>{studio.history.error}</p><Button onClick={() => studio.refreshHistory()}>기록 다시 불러오기</Button></div>}
        {!studio.history?.loading && !studio.history?.error && revisions.length === 0 && <p className="studio-empty">아직 기록된 버전이 없습니다. 더보기 → ‘지금 버전 남기기’로 현재 내용을 남길 수 있습니다.</p>}
        {revisions.map((revision) => <article key={revision.id} className="studio-revision">
          <div className="studio-row"><strong>{REASONS[revision.reason] || (revision.reason.startsWith('restored:') ? '복원한 버전' : '저장 버전')}</strong><span className="studio-muted studio-small">{dateLabel(revision.created_at)}</span></div>
          <p className="studio-small">{revision.snapshot?.title || '제목 없음'}</p><pre>{revision.snapshot?.body || '(빈 본문)'}</pre>
          <Button variant="outline" disabled={disabled} onClick={async () => {
            if (await studio.mutate({ action: 'restore_revision', revisionId: revision.id })) { await studio.refreshHistory(); setNotice('선택한 버전으로 복원했습니다.'); }
          }}>이 버전 복원</Button>
        </article>)}
        {studio.history?.nextCursor && <Button disabled={studio.history.loading} onClick={() => studio.refreshHistory(true)}>이전 기록 더 보기</Button>}
      </div>
    </Drawer>}
    <FloatingMentorWidget
      key={`${draft.contentId || 'new'}:${draft.variantId || 'new'}:${mentorMode}`}
      isOpen={mentorOpen}
      onClose={() => setMentorOpen(false)}
      contextType="content"
      contextTitle={draft.variantTitle || draft.title || '새 초안'}
      initialTab={mentorMode === 'critique' ? 'critique' : 'quick'}
      contextData={{
        id: draft.contentId,
        title: draft.variantTitle || draft.title,
        body: draft.body || draft.sourceIdea,
        brand: selectedBrand?.name || selectedBrand?.key || '',
        mode: mentorMode || draft.variantType,
      }}
      onApplyText={disabled || ['card_news', 'reels_script'].includes(draft.variantType) ? undefined : (text) => {
        studio.edit({ body: draft.body ? `${draft.body}\n\n${text}` : text });
      }}
    />
  </div>;
}
