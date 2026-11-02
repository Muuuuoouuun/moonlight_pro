"use client";

// 원고 책상(16a)과 올리기 창(16b) — docs/superpowers/specs/2026-11-02-studio-desk-threads-publish.md
// 가운데 원고지에는 글만, 왼쪽 여백은 이 글의 연결 글 · 결과물 · 기록, 오른쪽 여백은 브랜드 말투 · 올릴 곳.
// 올리기 창은 브랜드 → 채널 → 언제(지금 · 예약 알림 · 직접) 순서이고, 지금 올리기는 Threads 글만이다.
import React from 'react';
import { Button, CertaintyBadge, Drawer, SegmentedControl, TextField, TruthBadge, useToast } from '../hub-primitives';
import { BrandIcon } from '../brand-icons';
import { Iconed } from '../hub-icons';
import { ResultPreview } from './content-studio-editors';
import { THREADS_POST_LIMIT, postLength, threadBlocks, threadPostsForPublish, threadPublishIssues } from '@/lib/thread-posts';
import { formatKstShort } from '@/lib/content-schedule';
import { channelForType } from '@/lib/content-workflow-client';
import { postThreadsPublish, sha256Hex, useBrandGuide, usePublishTargets, useThreadsJob } from './use-content-publish';

const FORMATS = [
  { channel: 'threads', label: '스레드', target: 'threads', name: 'Threads', tile: 'Th' },
  { channel: 'instagram', label: '카드뉴스', target: 'instagram', name: 'Instagram', tile: 'IG' },
  { channel: 'youtube_shorts', label: '쇼츠', target: 'youtube', name: 'YouTube Shorts', tile: 'YT' },
];
// 채널 연결은 색이 아니라 기호 + 글자(§5.3). 빨강은 올리기를 막는 실패(만료 · 권한 없음)에만.
const CHANNEL_STATE = {
  connected: { glyph: '●', label: '연결됨', ready: true },
  'refresh-required': { glyph: '●', label: '연결됨 · 7일 안에 만료', ready: true },
  'expiry-unknown': { glyph: '?', label: '만료일 모름' },
  'reauthorization-required': { glyph: '!', label: '연결 만료 · 다시 연결', danger: true },
  'scope-missing': { glyph: '!', label: '올리기 권한 없음 · 다시 연결', danger: true },
  'not-connected': { glyph: '○', label: '연결 전' },
  'app-missing': { glyph: '○', label: '앱 설정 전' },
  unsupported: { glyph: '○', label: '이 브랜드 계정 없음' },
  'read-error': { glyph: '?', label: '상태를 읽지 못함' },
};
const daysLeft = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((t - Date.now()) / 86400000)) : null; };
const brandLabel = (brand) => brand?.name || brand?.label || brand?.key || '';
const JOB_STATE = {
  verified: { glyph: '✓', label: 'Threads에 올라감' }, ambiguous: { glyph: '?', label: '확인 필요' },
  abandoned: { glyph: '–', label: '정리됨' },
};
const OPEN_JOB = ['prepared', 'claimed', 'creating', 'container_ready', 'publish_requested', 'post_recorded'];

/** 하단 바 요약 — 연결 글 수 · 글자 수, 500자를 넘으면 이유 한 줄(빨강, 올리기를 막는 실패). */
export function DockSummary({ draft }) {
  if (draft.variantType !== 'threads_post') return <span className="studio-dock__sum"><span className="mono">{postLength(draft.body).toLocaleString()}</span>자</span>;
  const posts = threadPostsForPublish(draft.body);
  const issue = threadPublishIssues(posts).find((entry) => entry.code !== 'empty');
  if (issue) return <span className="studio-dock__sum studio-dock__sum--blocked" role="status">{issue.message}</span>;
  return <span className="studio-dock__sum">연결 글 <b className="mono">{posts.length}</b> · <b className="mono">{posts.reduce((n, post) => n + postLength(post), 0).toLocaleString()}</b>자</span>;
}

function ChannelLine({ name, entry, fallback }) {
  const view = entry ? CHANNEL_STATE[entry.state] || CHANNEL_STATE['read-error'] : null;
  const days = entry?.expiresAt && view?.ready ? daysLeft(entry.expiresAt) : null;
  return <div className="studio-channel-line" data-danger={view?.danger ? 'true' : undefined}>
    <span className="studio-channel-line__glyph" aria-hidden="true">{view?.glyph || '○'}</span>
    <span className="studio-channel-line__name">{name}</span>
    <span className="studio-channel-line__state">{view ? `${view.label}${days != null ? ` · ${days}일 남음` : ''}` : fallback}</span>
  </div>;
}

/** 왼쪽 여백 — 이 글(연결 글 목차) · 결과물(형식별) · 기록. 화면 폭이 좁으면 결과물 줄만 남는다. */
export function StudioOutline({ draft, variants, focusIndex, onFocusPost, onPickFormat, onSwitchVariant, onOpenHistory, scheduleLabel, job, disabled }) {
  const isThreads = draft.variantType === 'threads_post';
  const parts = isThreads ? threadBlocks(draft.body).parts : [];
  // 결과물은 저장된 것을 모두 보이고(같은 형식이 둘이면 제목으로 나눈다), 아직 없는 형식은 '비어 있음'으로 — 누르면 만든다.
  const channelOf = (variant) => variant.channel || channelForType(variant.variant_type);
  const items = [
    ...variants.map((variant) => {
      const format = FORMATS.find((entry) => entry.channel === channelOf(variant));
      const twin = variants.filter((other) => channelOf(other) === channelOf(variant)).length > 1;
      const current = variant.id === draft.variantId;
      const published = current ? draft.status === 'published' : variant.status === 'published';
      return { key: variant.id, label: `${format?.label || '원본'}${twin ? ` · ${variant.title || '제목 없음'}` : ''}`,
        glyph: current ? '◐' : published ? '✓' : '●', note: published ? '올라감' : current ? '쓰는 중' : '있음', current,
        onClick: () => (current ? null : onSwitchVariant(variant.id)) };
    }),
    ...FORMATS.filter((format) => !variants.some((variant) => channelOf(variant) === format.channel)).map((format) => {
      const current = !draft.variantId && draft.channel === format.channel;
      return { key: format.channel, label: format.label, glyph: current ? '◐' : '○', note: current ? '쓰는 중' : '비어 있음', current, onClick: () => onPickFormat(format.channel) };
    }),
  ];
  const jobView = job?.state ? JOB_STATE[job.state] || (OPEN_JOB.includes(job.state) ? { glyph: '◐', label: '올리는 중' } : null) : null;
  return <nav className="studio-outline" aria-label="이 글">
    {isThreads && <section className="studio-outline__posts">
      <span className="studio-outline__eyebrow">이 글</span>
      {parts.map((part, index) => {
        const length = postLength(part.trim());
        return <button key={index} type="button" className="studio-toc hub-row" aria-current={focusIndex === index ? 'true' : undefined}
          data-over={length > THREADS_POST_LIMIT ? 'true' : undefined} onClick={() => onFocusPost(index)}>
          <span className="studio-toc__no mono" aria-hidden="true">{index + 1}</span>
          <span className="studio-toc__text">{part.split('\n')[0].trim() || '비어 있음'}</span>
          <span className="studio-toc__meta"><span className="studio-toc__gauge" aria-hidden="true"><i style={{ width: `${Math.min(100, (length / THREADS_POST_LIMIT) * 100)}%` }} /></span>
            <span className="mono">{length}</span></span>
        </button>;
      })}
    </section>}
    <section className="studio-outline__formats">
      <span className="studio-outline__eyebrow">결과물</span>
      {items.map((item) => <button key={item.key} type="button" className="studio-format-item hub-row" aria-current={item.current ? 'true' : undefined}
        disabled={disabled} onClick={item.onClick}>
        <span aria-hidden="true" className="studio-format-item__glyph">{item.glyph}</span><span className="studio-format-item__label">{item.label}</span><small>{item.note}</small>
      </button>)}
    </section>
    <section className="studio-outline__record">
      <span className="studio-outline__eyebrow">기록</span>
      <button type="button" className="studio-format-item hub-row" onClick={onOpenHistory} disabled={!draft.variantId}><span aria-hidden="true" className="studio-format-item__glyph">⟲</span>버전 기록</button>
      <p className="studio-outline__line"><span aria-hidden="true">◷</span>{scheduleLabel}</p>
      {jobView && <p className="studio-outline__line"><span aria-hidden="true">{jobView.glyph}</span>{jobView.label}</p>}
    </section>
  </nav>;
}

function forbiddenHits(guide, body) {
  if (!guide?.forbidden?.length || !body) return [];
  return guide.forbidden.map((term) => String(term).trim()).filter((term) => term.length >= 2 && body.includes(term));
}

/** 오른쪽 여백 — 브랜드 말투(AI '브랜드 말투'의 근거) · 올릴 곳(채널 연결) · 마지막 올리기. 입력 칸은 두지 않는다. */
export function StudioAssist({ brand, draft, targets, guide, job, onOpenBrand }) {
  const channels = brand ? targets.brands?.[brand.key] : null;
  const hits = forbiddenHits(guide.brand, draft.body);
  return <aside className="studio-assist" aria-label="도움">
    <section className="studio-assist__card" data-empty={brand ? undefined : 'true'}>
      <span className="studio-outline__eyebrow">{brand ? `${brandLabel(brand)} 말투` : '말투'}</span>
      {!brand && <p>브랜드 미지정 — AI는 ‘담백하게’로 써요.</p>}
      {brand && guide.status === 'loading' && <p className="studio-muted">말투를 불러오는 중…</p>}
      {brand && guide.status === 'error' && <TruthBadge state="error" label="말투를 읽지 못함" />}
      {brand && guide.status === 'live' && <>
        {guide.brand?.voice ? <p className="studio-assist__voice">{guide.brand.voice.split('\n')[0].slice(0, 120)}</p> : <p className="studio-muted">보이스가 비어 있어요.</p>}
        {(guide.brand?.rules || []).slice(0, 2).map((rule) => <p key={rule} className="studio-assist__rule">· {rule}</p>)}
        <p className="studio-assist__rule">· 금지어 <span className="mono">{guide.brand?.forbidden?.length || 0}</span>개 · 이 글 <span className="mono">{hits.length}</span>건</p>
        {hits.length > 0 && <div className="studio-assist__hit"><CertaintyBadge state="recommended" label="권장" /><span>‘{hits.slice(0, 2).join('’ · ‘')}’ 빼기</span></div>}
      </>}
      {brand && <a className="studio-assist__link" href={`/dashboard/brands?b=${encodeURIComponent(brand.key)}`}>브랜드 기준 열기</a>}
    </section>
    <section className="studio-assist__card" data-empty={brand ? undefined : 'true'}>
      <span className="studio-outline__eyebrow">올릴 곳</span>
      {!brand && <p>브랜드를 고르면 연결된 채널이 보여요. <button type="button" className="studio-link" onClick={onOpenBrand}>브랜드 고르기</button></p>}
      {brand && targets.status === 'loading' && <p className="studio-muted">연결 상태 확인 중…</p>}
      {brand && targets.status === 'error' && <TruthBadge state="error" label="연결 상태를 읽지 못함" />}
      {brand && !['loading', 'error'].includes(targets.status) && <>
        <ChannelLine name="Threads" entry={channels?.threads} fallback="이 브랜드 계정 없음" />
        <ChannelLine name="Instagram" entry={channels?.instagram} fallback="이 브랜드 계정 없음" />
        <ChannelLine name="YouTube" entry={null} fallback="다음 단계" />
        <p className="studio-muted studio-small">Moonlight가 직접 올리는 곳은 지금 Threads 하나예요.</p>
      </>}
    </section>
    {job?.state && <section className="studio-assist__card">
      <span className="studio-outline__eyebrow">마지막 올리기</span>
      <p><span aria-hidden="true">{(JOB_STATE[job.state] || { glyph: '◐' }).glyph} </span>{(JOB_STATE[job.state] || { label: '올리는 중' }).label}
        {job.verifiedAt && <span className="mono studio-small"> · {formatKstShort(job.verifiedAt)}</span>}</p>
      {job.permalink && <a className="studio-assist__link" href={job.permalink} target="_blank" rel="noopener noreferrer">글 열기 ↗</a>}
    </section>}
  </aside>;
}

/** 원고지 머리의 브랜드 pill이 여는 고르기 — 브랜드 = 올릴 계정이자 AI 말투의 근거. */
export function BrandPickDrawer({ brands, value, targets, onPick, onClose, disabled }) {
  return <Drawer title="올릴 브랜드" subtitle="고른 브랜드의 말투로 AI가 쓰고, 그 브랜드 계정에 올립니다." presentation="compact" width="420px" onClose={onClose}>
    <div className="studio-brand-list" role="radiogroup" aria-label="브랜드">
      {brands.map((brand) => {
        const channels = targets.brands?.[brand.key];
        const threads = channels?.threads ? CHANNEL_STATE[channels.threads.state] : null;
        return <button key={brand.id} type="button" role="radio" aria-checked={value === brand.id} className="studio-brand-option hub-row" disabled={disabled}
          onClick={() => onPick(brand.id)}>
          <BrandIcon brand={brand} size={30} />
          <span className="studio-brand-option__name">{brandLabel(brand)}{channels?.threads?.handle && <span className="mono"> @{channels.threads.handle}</span>}</span>
          <span className="studio-brand-option__state">{threads ? `Threads ${threads.glyph} ${threads.label}` : 'Threads 계정 없음'}</span>
        </button>;
      })}
      <button type="button" role="radio" aria-checked={!value} className="studio-brand-option studio-brand-option--none hub-row" disabled={disabled} onClick={() => onPick('')}>
        <span className="studio-brand-option__name">브랜드 없이 쓰기</span><span className="studio-brand-option__state">AI 말투는 ‘담백하게’ · 직접 올리기만</span>
      </button>
    </div>
  </Drawer>;
}

function publishBlocker({ draft, brand, channels, targets, posts }) {
  if (draft.variantType !== 'threads_post') return '카드뉴스 · 쇼츠는 아직 Moonlight가 직접 올리지 않아요 — 직접 올리기로 기록하세요.';
  if (!brand) return '브랜드를 먼저 골라 주세요 — 브랜드가 곧 올릴 계정이에요.';
  if (targets.status === 'loading') return '연결 상태를 확인하고 있어요.';
  if (targets.status === 'error') return '연결 상태를 읽지 못했어요. 다시 열어 보거나 직접 올리기를 쓰세요.';
  const view = CHANNEL_STATE[channels?.threads?.state] || null;
  if (!view?.ready) return `${brandLabel(brand)} Threads ${view ? view.label : '계정 없음'} — 설정 › 소셜 연결에서 연결하거나 직접 올리기를 쓰세요.`;
  if (!targets.publishEnabled) return '직접 올리기가 아직 켜지지 않았어요(배포 환경 COM_MOON_THREADS_PUBLISH_ENABLED). 지금은 직접 올리기로 기록하세요.';
  if (targets.storage !== 'live') return '올리기 작업 표가 연결되지 않았어요(마이그레이션 0073). 지금은 직접 올리기로 기록하세요.';
  const issue = threadPublishIssues(posts)[0];
  if (issue) return issue.message;
  if (draft.status === 'published') return '이미 올린 글이에요. 다시 올리려면 새 글로 이어 쓰세요.';
  return '';
}

const PUBLISH_REASONS = {
  'stale-body': '저장된 본문과 지금 본문이 달라요. 저장이 끝난 뒤 다시 눌러 주세요.',
  'brand-mismatch': '원고에 저장된 브랜드와 고른 브랜드가 달라요. 저장이 끝난 뒤 다시 눌러 주세요.',
  'already-published': '이미 올린 글이에요.', 'account-mismatch': '연결된 계정이 이 브랜드 핸들과 달라요. 설정에서 다시 연결해 주세요.',
  'not-connected': 'Threads 계정이 연결되지 않았어요.', 'reconnect-required': 'Threads 연결이 만료됐어요. 설정에서 다시 연결해 주세요.',
  'scope-missing': '올리기 권한이 없어요. 설정에서 다시 연결해 주세요.', 'app-missing': '이 브랜드의 Threads 앱 설정이 없어요.',
  'storage-unavailable': '저장소에 연결되지 않았어요.', 'read-unconfirmed': '확인 단계에서 응답을 받지 못했어요. 아무것도 보내지 않았어요.',
  'over-limit': '500자를 넘는 연결 글이 있어요.', 'too-many': '연결 글이 너무 많아요.', empty: '올릴 글이 비어 있어요.',
  'threads-publish-off': '직접 올리기가 아직 켜지지 않았어요.', 'not-sent': '첫 글을 올리기 전에 멈췄어요. 공개된 글은 없어요 — 다시 올릴 수 있어요.',
  'connection-changed': '보내기 직전 연결이 끊겼어요. 공개된 글은 없어요.',
};

/** 올리기 창(16b). mode = 'publish' 지금 올리기 · 'schedule' 예약(알림) · 'publication' 직접 올리기(발행 기록). */
export function PublishWindow({ mode, onMode, onClose, draft, brands, studio, targets, job, guide, schedule, publication, onCopy, onPublished }) {
  const toast = useToast();
  const brand = brands.find((entry) => entry.id === draft.brandId) || null;
  const channels = brand ? targets.brands?.[brand.key] : null;
  const isThreads = draft.variantType === 'threads_post';
  const posts = isThreads ? threadPostsForPublish(draft.body) : [];
  const [phase, setPhase] = React.useState({ state: 'idle', message: '' });
  const requestId = React.useRef(null);
  const sending = phase.state === 'sending';
  const blocker = publishBlocker({ draft, brand, channels, targets, posts });
  const openJob = job.job && (job.job.state === 'ambiguous' || OPEN_JOB.includes(job.job.state)) ? job.job : null;
  const handle = channels?.threads?.handle || brand?.key || '';
  const hits = forbiddenHits(guide.brand, draft.body);
  const pickBrand = (id) => { if (!sending && id !== draft.brandId) { studio.edit({ brandId: id }); setPhase({ state: 'idle', message: '' }); requestId.current = null; } };

  const publishNow = async () => {
    if (blocker || sending || openJob) return;
    setPhase({ state: 'sending', message: '' });
    const saved = await studio.save(true);
    if (!saved?.variantId || !saved?.contentId) { setPhase({ state: 'error', message: '글을 먼저 서버에 저장해야 올릴 수 있어요. 저장이 확인된 뒤 다시 눌러 주세요.' }); return; }
    if (saved.brandId !== draft.brandId) { setPhase({ state: 'error', message: PUBLISH_REASONS['brand-mismatch'] }); return; }
    // 응답을 잃고 다시 누르면 같은 요청 — 서버가 같은 작업을 돌려준다(두 번 올리지 않음).
    requestId.current ||= crypto.randomUUID();
    const result = await postThreadsPublish({ action: 'publish', requestId: requestId.current, variantId: saved.variantId, contentId: saved.contentId,
      brandId: saved.brandId, bodyHash: await sha256Hex(saved.body), confirmPublish: true });
    if (result.job) job.setJob(result.job);
    if (result.status === 'verified') {
      requestId.current = null;
      setPhase({ state: 'verified', message: '' });
      await studio.refreshPublished(saved.contentId, saved.variantId);
      onPublished?.();
      toast.success(`${brandLabel(brand)} Threads에 올렸어요.`);
      return;
    }
    if (result.status === 'ambiguous') { requestId.current = null; setPhase({ state: 'ambiguous', message: result.reason === 'partial' ? `연결 글 ${result.postedCount}개까지 올라갔어요. 나머지는 Threads에서 확인해 주세요.` : '응답이 끊겨 올라갔는지 모릅니다. 다시 보내지 않았어요 — Threads에서 확인해 주세요.' }); return; }
    if (result.status === 'failed') { requestId.current = null; setPhase({ state: 'failed', message: PUBLISH_REASONS[result.reason] || PUBLISH_REASONS['not-sent'] }); return; }
    if (result.status === 'unknown') { setPhase({ state: 'error', message: '응답을 받지 못했어요. 같은 버튼을 다시 누르면 같은 요청으로 확인해요(두 번 올리지 않아요).' }); return; }
    requestId.current = null;
    setPhase({ state: 'error', message: PUBLISH_REASONS[result.reason] || PUBLISH_REASONS[result.status] || '올리지 못했어요. 직접 올리기를 쓰거나 잠시 뒤 다시 시도해 주세요.' });
  };
  const resolveJob = async (reason) => {
    if (!openJob || job.job.state !== 'ambiguous') return;
    const result = await postThreadsPublish({ action: 'abandon', jobId: openJob.id, reason });
    if (['saved', 'duplicate'].includes(result.status)) { job.setJob(result.job); setPhase({ state: 'idle', message: '' }); toast.success(reason === 'not-posted' ? '정리했어요. 다시 올릴 수 있어요.' : '정리했어요.'); }
    else toast.error('정리하지 못했어요. 다시 시도해 주세요.');
  };
  const submitPublication = async () => {
    const ok = await publication.submit();
    if (ok && openJob?.state === 'ambiguous') await resolveJob('posted-manually');
  };

  const scheduleView = schedule.current && schedule.current.state !== 'missed';
  const primary = mode === 'publish'
    ? { label: phase.state === 'verified' ? '닫기' : sending ? '올리는 중…' : `${brand ? brandLabel(brand) + ' ' : ''}Threads에 지금 올리기`,
      disabled: phase.state !== 'verified' && (Boolean(blocker) || sending || Boolean(openJob)), onClick: phase.state === 'verified' ? onClose : publishNow, icon: phase.state === 'verified' ? undefined : 'upload' }
    : mode === 'schedule'
      ? { label: schedule.saving ? '저장 중…' : scheduleView ? '이 시각으로 바꾸기' : `${schedule.at ? formatKstShort(new Date(schedule.at).toISOString()) : ''} 알림으로 예약`,
        disabled: schedule.disabled || schedule.saving || !schedule.at, onClick: schedule.submit, icon: 'clock' }
      : { label: publication.busy ? '확인 중…' : '발행 기록 저장', disabled: publication.disabled || publication.busy, onClick: submitPublication, icon: 'check' };

  const checks = [
    brand ? ['✓', `브랜드 · ${brandLabel(brand)}`, ''] : ['○', '브랜드 미지정', '직접 올리기만'],
    ...(isThreads ? [threadPublishIssues(posts).length ? ['✕', threadPublishIssues(posts)[0].message, '', 'danger'] : ['✓', `연결 글 ${posts.length}개 · 모두 ${THREADS_POST_LIMIT}자 이내`, `최장 ${Math.max(0, ...posts.map(postLength))}자`]] : []),
    brand && isThreads ? (CHANNEL_STATE[channels?.threads?.state]?.ready ? ['✓', 'Threads 계정 연결', channels.threads.expiresAt ? `${daysLeft(channels.threads.expiresAt)}일 남음` : '']
      : ['!', `Threads ${CHANNEL_STATE[channels?.threads?.state]?.label || '계정 없음'}`, '', CHANNEL_STATE[channels?.threads?.state]?.danger ? 'danger' : '']) : null,
    studio.dirty ? ['○', '저장 전 변경 있음', '올리기 전에 저장해요'] : ['✓', '원고 저장됨', ''],
    hits.length ? ['◇', `권장 · 금지어 ‘${hits[0]}’ 빼기`, `${hits.length}건`, 'recommended'] : null,
  ].filter(Boolean);

  return <Drawer title="올리기" subtitle={`${draft.variantTitle || draft.title || '제목 없음'} · ${isThreads ? `스레드 연결 글 ${posts.length}개` : FORMATS.find((f) => f.channel === draft.channel)?.label || '결과물'}`}
    presentation="compact" sheet="full" width="min(1040px, calc(100% - 56px))" onClose={() => { if (!sending) onClose(); }}
    bodyStyle={{ padding: 0 }}
    footer={<div className="studio-window__foot">
      <div className="studio-window__note" role="status" aria-live="polite">
        {sending ? <span className="studio-window__progress"><span className="studio-pulse" aria-hidden="true">◐</span> 계정 확인 → 올리기 → 링크 확인 · 창을 닫지 말아 주세요</span>
          : phase.state === 'verified' ? <span><span aria-hidden="true">✓ </span>올라갔어요{job.job?.permalink && <> · <a href={job.job.permalink} target="_blank" rel="noopener noreferrer" className="mono">글 열기 ↗</a></>}</span>
            : mode === 'publish' && blocker ? <span>{blocker}</span>
              : mode === 'publish' ? <span>올린 글은 Moonlight에서 지울 수 없어요 — 고치기 · 지우기는 Threads에서.</span>
                : mode === 'schedule' ? <span>그 시각에 홈 ‘지금 올릴 글’에 떠요. 올리는 건 직접 합니다.</span>
                  : <span>올린 게시물의 링크를 붙여 넣으면 발행 기록이 남아요.</span>}
      </div>
      {mode === 'schedule' && schedule.current && <Button variant="outline" disabled={schedule.saving || schedule.disabled} onClick={schedule.cancel}>예약 해제</Button>}
      <Button variant="ghost" onClick={onClose} disabled={sending}>닫기</Button>
      <Button variant="primary" icon={primary.icon} disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</Button>
    </div>}>
    <div className="studio-window">
      <div className="studio-window__steps">
        <section className="studio-step" aria-labelledby="studio-step-brand">
          <div className="studio-step__head"><span className="studio-step__no mono" aria-hidden="true">1</span><h3 id="studio-step-brand">어느 브랜드</h3><span className="studio-muted studio-small">원고의 브랜드가 골라져 있어요</span></div>
          <div className="studio-brand-tiles" role="radiogroup" aria-label="브랜드">
            {brands.map((entry) => {
              const state = targets.brands?.[entry.key]?.threads;
              const view = state ? CHANNEL_STATE[state.state] : null;
              return <button key={entry.id} type="button" role="radio" aria-checked={entry.id === draft.brandId} className="studio-brand-tile hub-card-link" disabled={sending} onClick={() => pickBrand(entry.id)}>
                <BrandIcon brand={entry} size={32} />
                <b>{brandLabel(entry)}</b>
                <span className="mono">{state?.handle ? `@${state.handle}` : ' '}</span>
                <span className="studio-brand-tile__state" data-danger={view?.danger ? 'true' : undefined}>Th {view?.glyph || '○'}</span>
              </button>;
            })}
          </div>
        </section>
        <section className="studio-step" aria-labelledby="studio-step-channel">
          <div className="studio-step__head"><span className="studio-step__no mono" aria-hidden="true">2</span><h3 id="studio-step-channel">어느 채널</h3>
            <span className="studio-muted studio-small">지금 원고는 {FORMATS.find((f) => f.channel === draft.channel)?.label || '이 형식'}이에요</span></div>
          <div className="studio-channel-rows">
            {FORMATS.map((format) => {
              const entry = format.target === 'youtube' ? null : channels?.[format.target];
              const view = entry ? CHANNEL_STATE[entry.state] : null;
              const current = draft.channel === format.channel;
              const what = !current ? '다른 형식 — 원고지의 형식 탭에서'
                : format.channel === 'threads' ? `스레드 연결 글 ${posts.length}개` : '직접 올리기로 기록 · Moonlight 올리기는 다음 단계';
              return <div key={format.channel} className="studio-channel-row" data-current={current ? 'true' : undefined} data-danger={view?.danger && current ? 'true' : undefined}>
                <span className="studio-channel-row__check" aria-hidden="true">{current ? '✓' : ''}</span>
                <span className="studio-channel-row__tile mono" aria-hidden="true">{format.tile}</span>
                <span className="studio-channel-row__main"><b>{format.name}{entry?.handle && <span className="mono"> @{entry.handle}</span>}</b>
                  <small>{format.target === 'youtube' ? '○ 다음 단계' : !brand ? '○ 브랜드를 고르면 보여요' : view ? `${view.glyph} ${view.label}${view.ready && entry.expiresAt ? ` · 권한 ${daysLeft(entry.expiresAt)}일 남음` : ''}` : '○ 이 브랜드 계정 없음'}</small></span>
                <span className="studio-channel-row__what">{what}</span>
              </div>;
            })}
          </div>
        </section>
        <section className="studio-step" aria-labelledby="studio-step-when">
          <div className="studio-step__head"><span className="studio-step__no mono" aria-hidden="true">3</span><h3 id="studio-step-when">언제</h3></div>
          <SegmentedControl label="언제" value={mode} onChange={(next) => { if (!sending) onMode(next); }}
            options={[{ key: 'publish', label: '지금 올리기' }, { key: 'schedule', label: '예약' }, { key: 'publication', label: '직접 올리기' }]} />
          {mode === 'publish' && <div className="studio-when-panel">
            {openJob?.state === 'ambiguous' ? <>
              <p><b>? 확인 필요</b> — 지난번 올리기의 응답이 끊겼어요. 다시 보내지 않았어요.{openJob.postIds?.length ? ` 연결 글 ${openJob.postIds.length}개까지는 올라갔어요.` : ''}</p>
              <div className="studio-actions">
                <a className="hub-btn hub-btn--outline studio-link-btn" href={`https://www.threads.com/@${openJob.username}`} target="_blank" rel="noopener noreferrer">Threads에서 보기 ↗</a>
                <Button variant="outline" onClick={() => onMode('publication')}>올라갔어요 · 링크 기록</Button>
                <Button variant="ghost" onClick={() => resolveJob('not-posted')}>안 올라갔어요 · 정리</Button>
              </div>
            </> : openJob ? <p><span aria-hidden="true">◐ </span>올리는 중인 작업이 있어요. 잠시 뒤 다시 열어 주세요.</p>
              : phase.state === 'verified' ? <p><span aria-hidden="true">✓ </span>Threads에 올라갔고 발행 기록을 남겼어요. 성과 숫자는 성과 화면에서 적어요.</p>
                : phase.message ? <p className={['failed', 'error'].includes(phase.state) ? 'studio-error' : ''} role={['failed', 'error'].includes(phase.state) ? 'alert' : undefined}>{phase.message}</p>
                  : <p>누르면 바로 올라가요. 첫 글을 올린 뒤 연결 글을 차례로 잇고, 첫 글을 다시 읽어 링크를 확인해요.</p>}
          </div>}
          {mode === 'schedule' && <div className="studio-when-panel">
            {schedule.status === 'preview' && <TruthBadge state="preview" label="예약 저장소 연결 필요" />}
            {schedule.status === 'error' && <TruthBadge state="error" label="예약 목록 불러오기 실패" />}
            {schedule.current?.state === 'missed' && <p className="studio-muted studio-small">이 예약은 시각이 지나 ‘놓침’으로 정리됐어요. 새 시각으로 다시 예약할 수 있어요.</p>}
            <div className="studio-actions" role="group" aria-label="빠른 선택">
              {schedule.presets.map((preset) => <Button key={preset.key} size="xs" variant="outline" disabled={schedule.saving} onClick={() => schedule.pickPreset(preset.at)}>{preset.label}</Button>)}
            </div>
            <TextField label="직접 정하기" type="datetime-local" value={schedule.at} onChange={(event) => schedule.setAt(event.target.value)} disabled={schedule.saving}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); schedule.submit(); } }} />
            <div className="studio-when-options" role="radiogroup" aria-label="그 시각에">
              <div role="radio" aria-checked="true" className="studio-when-option"><b><Iconed name="bell" size={12} /> 그 시각에 알림</b><small>홈 ‘지금 올릴 글’에 떠요 · 올리는 건 직접</small></div>
              <div role="radio" aria-checked="false" aria-disabled="true" className="studio-when-option" data-disabled="true"><b><Iconed name="upload" size={12} /> 그 시각에 자동으로 올리기</b><small>다음 단계 — 예약 실행기가 생긴 뒤에 열려요</small></div>
            </div>
            {schedule.error && <p role="alert" className="studio-error">{schedule.error}</p>}
          </div>}
          {mode === 'publication' && <div className="studio-when-panel">
            <div className="studio-actions">
              <Button variant="outline" icon="copy" onClick={onCopy} disabled={!draft.body.trim()}>복사</Button>
              <a className="hub-btn hub-btn--ghost studio-link-btn" href={handle ? `https://www.threads.com/@${handle}` : 'https://www.threads.com/'} target="_blank" rel="noopener noreferrer">{draft.channel === 'threads' ? 'Threads 열기 ↗' : '채널 열기 ↗'}</a>
            </div>
            <TextField label="발행 URL" type="url" inputMode="url" autoComplete="off" placeholder={`https://www.threads.net/@${handle || '…'}/post/…`} value={publication.url}
              onChange={(event) => publication.setUrl(event.target.value)} disabled={publication.busy}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submitPublication(); } }} />
            <TextField label="발행 일시" type="datetime-local" value={publication.date} onChange={(event) => publication.setDate(event.target.value)} disabled={publication.busy} />
            {publication.error && <p role="alert" className="studio-error">{publication.error}</p>}
          </div>}
        </section>
      </div>
      <div className="studio-window__side">
        <span className="studio-outline__eyebrow">미리보기 · {FORMATS.find((f) => f.channel === draft.channel)?.name || '결과물'}</span>
        <div className="studio-window__preview">
          {isThreads ? (posts.length ? posts.map((post, index) => <article key={index} className="studio-thread-card">
            {brand ? <BrandIcon brand={brand} size={30} /> : <span className="studio-thread-card__avatar" aria-hidden="true" />}
            <div><div className="studio-thread-card__head"><b>{handle || '브랜드 미지정'}</b><small className="mono">{index + 1}/{posts.length}</small></div><p>{post}</p></div>
          </article>) : <p className="studio-muted">올릴 글이 비어 있어요.</p>) : <ResultPreview body={draft.body} type={draft.variantType} />}
        </div>
        <span className="studio-outline__eyebrow">올리기 전 확인</span>
        <ul className="studio-checks">
          {checks.map(([glyph, text, meta, tone]) => <li key={text} data-tone={tone || undefined}>
            <span aria-hidden="true">{glyph === '◇' ? <span className="studio-diamond" /> : glyph}</span><span>{text}</span>{meta && <small className={/\d/.test(meta) ? 'mono' : ''}>{meta}</small>}
          </li>)}
        </ul>
      </div>
    </div>
  </Drawer>;
}

/** 여백 칸과 창을 모은 책상 — 읽기 훅은 여기서만 부른다(원고 화면 본문은 예약 시험이 그대로 실행한다). */
export function StudioDesk({ draft, variants, brands, studio, drawer, setDrawer, focusIndex, onFocusPost, onPickFormat, onSwitchVariant, onOpenHistory,
  scheduleLabel, schedule, publication, onCopy, onPublished, disabled, children }) {
  const targets = usePublishTargets();
  const job = useThreadsJob(draft.variantId);
  const brand = brands.find((entry) => entry.id === draft.brandId) || null;
  const guide = useBrandGuide(draft.brandId);
  const windowMode = ['publish', 'schedule', 'publication'].includes(drawer) ? drawer : null;
  const onMode = (next) => (next === 'schedule' ? schedule.open() : next === 'publication' ? publication.open() : setDrawer('publish'));
  return <>
    <div className="studio-desk">
      <StudioOutline draft={draft} variants={variants} focusIndex={focusIndex} onFocusPost={onFocusPost} onPickFormat={onPickFormat} onSwitchVariant={onSwitchVariant}
        onOpenHistory={onOpenHistory} scheduleLabel={scheduleLabel} job={job.job} disabled={disabled} />
      {children}
      <StudioAssist brand={brand} draft={draft} targets={targets} guide={guide} job={job.job} onOpenBrand={() => setDrawer('brand')} />
    </div>
    {drawer === 'brand' && <BrandPickDrawer brands={brands} value={draft.brandId} targets={targets} disabled={disabled}
      onPick={(id) => { studio.edit({ brandId: id }); setDrawer(null); }} onClose={() => setDrawer(null)} />}
    {windowMode && <PublishWindow mode={windowMode} onMode={onMode} onClose={() => setDrawer(null)} draft={draft} brands={brands} studio={studio}
      targets={targets} job={job} guide={guide} schedule={schedule} publication={publication} onCopy={onCopy}
      onPublished={() => { onPublished?.(); job.reload(); }} />}
  </>;
}
