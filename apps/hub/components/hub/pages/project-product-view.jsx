"use client";
// 프로젝트 탭 `제품` 보기 (2026-09-24 제품 개발 기획 §4·§6, 0·1단계).
// 제품 = PMS 컨테이너(meta.category = product). 본문은 제품 한 줄씩(단계 · 다음 단계까지 빠진 칸 ·
// 다음 행동)과 집중 상한만 보여주고, 카드 전체 편집은 EditDrawer로 보낸다(표면 예산).
import React from 'react';
import { Button, EditDrawer, EmptyState, Skeleton, TruthBadge } from '../hub-primitives';
import { LEAD_SUBJECTS } from '@/lib/sales-os/lead-labels';
import {
  MAX_FOCUS_PRODUCTS,
  PRICING_MODELS,
  PRODUCT_STAGES,
  buildProductRows,
  describeSyncResult,
  focusSummary,
  groupSyncByProduct,
  isFocusStage,
  productDraft,
  productPayload,
  productRepositoryPayload,
  stageGate,
  stageLabel,
} from '@/lib/product-catalog';

function productFields(draft) {
  return [
    { key: 'stage', label: '단계', type: 'select', options: PRODUCT_STAGES.map(s => ({ value: s.key, label: s.label })) },
    { key: 'summary', label: '한 줄 설명', maxLength: 200, placeholder: '무엇을 파는지 한 문장으로' },
    { key: 'problem', label: '해결하는 문제', type: 'textarea', rows: 3, placeholder: '누가 무엇 때문에 불편한가' },
    { key: 'nextAction', label: '다음 행동', maxLength: 200 },
    { key: 'orgTypes', label: '대상 기관 유형', placeholder: '예: 학원, 교습소', row: 'target' },
    { key: 'size', label: '규모', placeholder: '예: 1~3관', row: 'target' },
    { key: 'subjects', label: '대상 과목', type: 'chips', options: LEAD_SUBJECTS.map(s => ({ value: s.key, label: s.label })) },
    { key: 'regions', label: '대상 지역', placeholder: '예: 전국, 경기' },
    { key: 'capabilities', label: '제공 범위 · 확인된 기능만 한 줄에 하나', type: 'textarea', rows: 4 },
    { key: 'requirements', label: '필수 조건 · 한 줄에 하나', type: 'textarea', rows: 3 },
    { key: 'pricingModel', label: '가격 모델', type: 'select', options: PRICING_MODELS.map(m => ({ value: m.key, label: m.label })), row: 'price' },
    { key: 'amount', label: '금액 (원)', placeholder: '예: 29000', row: 'price' },
    { key: 'repos', label: 'GitHub 저장소 · owner/repo 한 줄에 하나', type: 'textarea', rows: 2 },
    { key: 'deployUrl', label: '배포 URL', inputType: 'url', placeholder: 'https://' },
    { key: 'docsUrl', label: '문서 URL', inputType: 'url', placeholder: 'https://' },
    ...(draft?.stage === 'sunset' ? [{ key: 'sunsetReason', label: '유지 · 종료 이유', maxLength: 200 }] : []),
  ];
}

function saveErrorMessage(data, status) {
  if (data?.message) return data.message;
  if (data?.error === 'stale-update') return '다른 곳에서 먼저 저장됐습니다. 입력은 그대로 두었으니 목록을 새로 고친 뒤 다시 저장하세요.';
  if (typeof data?.error === 'string' && /[가-힣]/.test(data.error)) return data.error;
  return `저장하지 못했습니다 (${data?.error || status}). 입력은 그대로 두었습니다.`;
}

function GateLine({ row }) {
  if (row.stage === 'sunset') {
    return <span style={{ color: 'var(--fg-dim)' }}>{row.product.sunsetReason || '종료 이유 미기록'}</span>;
  }
  if (row.nextStage && row.missing.length) {
    return (
      <span style={{ color: 'var(--fg-muted)' }}>
        {row.nextStageLabel}까지 · {row.missing.map(item => item.label).join(' · ')}
      </span>
    );
  }
  if (row.product.nextAction) return <span style={{ color: 'var(--fg-muted)' }}>다음 행동 · {row.product.nextAction}</span>;
  if (row.nextStage) return <span style={{ color: 'var(--fg-dim)' }}>{row.nextStageLabel}로 올릴 조건을 채웠습니다</span>;
  return null;
}

function ProductRow({ row, sync, onOpen, onOpenProjects }) {
  const handleKey = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(row); }
  };
  return (
    <div
      className="hub-row"
      role="button"
      tabIndex={0}
      aria-label={`${row.name} · ${row.stageLabel} · 제품 카드 열기`}
      onClick={() => onOpen(row)}
      onKeyDown={handleKey}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>{row.name}</span>
          <span style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 999, border: `1px ${row.focus ? 'solid var(--line-strong)' : 'solid var(--line)'}`, color: row.focus ? 'var(--fg)' : 'var(--fg-muted)' }}>
            {row.stageLabel}{row.focus ? ' · 집중' : ''}
          </span>
          {row.orgScope === 'classin' && <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>업무</span>}
          {row.preview && <TruthBadge state="preview" label="저장 대기" />}
        </div>
        {row.summary && <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{row.summary}</span>}
        <span style={{ fontSize: 12.5 }}><GateLine row={row} /></span>
        {sync && sync.length > 0 && (
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-dim)', display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
            {sync.map(repo => (
              <span key={repo.repository}>
                {repo.repository} · 이슈 {repo.openIssues} · PR {repo.openPullRequests}
                {repo.reviewRequests > 0 ? ` · 리뷰 대기 ${repo.reviewRequests}` : ''}
                {repo.blockedIssues > 0 ? ` · 막힘 ${repo.blockedIssues}` : ''}
              </span>
            ))}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
          프로젝트 {row.projectCount} · 작업 {row.openTasks} · 저장소 {row.product.repos.length}
        </span>
        {row.projectCount > 0 && (
          <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onOpenProjects(row.key); }}>
            프로젝트 보기
          </Button>
        )}
      </div>
    </div>
  );
}

// containers는 현재 스코프의 컨테이너, allContainers는 스코프와 무관한 전체 — 집중 상한은
// Engine과 같이 워크스페이스 전체로 센다.
export function ProjectProductView({ containers, allContainers, projects, todos, scope, sourceState, onCreateProduct, onOpenProjects, onSaved }) {
  const rows = React.useMemo(
    () => buildProductRows(containers, { projects, todos, scope }),
    [containers, projects, todos, scope],
  );
  const focus = React.useMemo(() => focusSummary(allContainers || containers), [allContainers, containers]);
  const [draft, setDraft] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [sync, setSync] = React.useState({ state: 'idle', label: '', byProduct: new Map() });

  const openRow = React.useCallback((row) => {
    setEditing(row);
    setDraft(productDraft(row));
  }, []);
  const closeDrawer = React.useCallback(() => { setEditing(null); setDraft(null); }, []);

  const runSync = React.useCallback(async () => {
    setSync(current => ({ ...current, state: 'syncing', label: 'GitHub에서 읽는 중' }));
    try {
      const response = await fetch('/api/integrations/github/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productRepositories: productRepositoryPayload(rows) }),
      });
      const data = await response.json().catch(() => null);
      const described = describeSyncResult(data, response.status);
      setSync({ ...described, byProduct: groupSyncByProduct(data) });
    } catch (error) {
      setSync({ state: 'error', label: `동기화 요청 실패 · ${error instanceof Error ? error.message : String(error)}`, byProduct: new Map() });
    }
  }, [rows]);

  const save = React.useCallback(async () => {
    if (!draft || !editing) return { ok: false, status: 'error' };
    if (!draft.expectedUpdatedAt) {
      return { ok: false, status: 'error', message: '저장된 제품 기록을 아직 읽지 못했습니다. 목록을 새로 고친 뒤 다시 시도하세요.' };
    }
    try {
      const response = await fetch('/api/hub/brands', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(productPayload(draft, editing.product)),
      });
      const data = await response.json().catch(() => ({}));
      if (data.status === 'saved') {
        await onSaved?.();
        return { ok: true, status: 'saved' };
      }
      if (data.status === 'preview') return { ok: false, status: 'preview' };
      if (data.status === 'conflict') return { ok: false, status: 'conflict', message: saveErrorMessage(data, response.status) };
      return { ok: false, status: 'error', message: saveErrorMessage(data, response.status) };
    } catch (error) {
      return { ok: false, status: 'error', message: `저장 요청 실패 · ${error instanceof Error ? error.message : String(error)}` };
    }
  }, [draft, editing, onSaved]);

  const hasRepos = rows.some(row => row.product.repos.length > 0);
  const draftGate = React.useMemo(() => {
    if (!draft || !editing) return [];
    const preview = productPayload(draft, editing.product, () => 'draft');
    return stageGate(preview.product, draft.stage, { summary: draft.summary, projectCount: editing.projectCount });
  }, [draft, editing]);
  const entersFullFocus = Boolean(draft && editing && isFocusStage(draft.stage) && !editing.focus && focus.full);

  if (sourceState === 'loading' && rows.length === 0) {
    return <div style={{ padding: 20 }}><Skeleton lines={4} height={14} label="제품 불러오는 중" /></div>;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 240px' }}>
          <span style={{ fontSize: 13, color: 'var(--fg)' }}>
            집중 <span className="mono">{focus.count}/{MAX_FOCUS_PRODUCTS}</span>
            <span style={{ color: 'var(--fg-dim)' }}> · MVP·출시·성장 단계에 동시에 둘 수 있는 제품 수</span>
          </span>
          {focus.full && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              상한에 닿았습니다. 새 제품을 올리려면 {focus.names.join(', ')} 중 하나를 유지·종료로 내리세요.
            </span>
          )}
        </div>
        {sync.state !== 'idle' && (
          <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: sync.state === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>
            <TruthBadge state={sync.state} />
            {sync.label}
          </span>
        )}
        <Button variant="outline" size="sm" icon="refresh" onClick={runSync} disabled={sync.state === 'syncing' || !hasRepos}
          title={hasRepos ? undefined : '제품 카드에 GitHub 저장소를 적으면 동기화할 수 있습니다'}>
          GitHub 동기화
        </Button>
        <Button variant="outline" size="sm" icon="plus" onClick={onCreateProduct}>제품 추가</Button>
      </div>

      {sourceState === 'error' && (
        <div role="alert" style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>
          제품 기록을 읽지 못했습니다. 보이는 목록이 전부가 아닐 수 있습니다.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="folder"
          title={scope === 'classin' ? '업무 소속 제품이 없습니다' : '아직 등록한 제품이 없습니다'}
          description="파는 것 하나를 제품으로 등록하면 단계, 다음 단계까지 빠진 칸, 집중 상한을 여기서 봅니다."
          action={<Button variant="primary" size="sm" icon="plus" onClick={onCreateProduct}>제품 추가</Button>}
        />
      ) : (
        <div role="list" aria-label="제품">
          {rows.map(row => (
            <div role="listitem" key={row.id}>
              <ProductRow row={row} sync={sync.byProduct.get(row.id)} onOpen={openRow} onOpenProjects={onOpenProjects} />
            </div>
          ))}
        </div>
      )}

      {draft && editing && (
        <EditDrawer
          title={editing.name}
          subtitle={`${stageLabel(editing.stage)} · 제품 버전 ${editing.product.version}`}
          record={draft}
          fields={productFields(draft)}
          onChange={(key, value) => setDraft(current => ({ ...current, [key]: value }))}
          onClose={closeDrawer}
          onSave={save}
          width="min(480px, 96vw)"
          saveLabel="제품 카드 저장"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
            <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
              {stageLabel(draft.stage)} 단계 조건
            </span>
            {draftGate.map(item => (
              <span key={item.key} style={{ fontSize: 12.5, color: item.done ? 'var(--fg)' : 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                <span aria-hidden="true" className="mono">{item.done ? '✓' : item.manual ? '?' : '○'}</span>
                <span>{item.label}{item.manual ? ' · 직접 확인' : item.done ? '' : ' · 비어 있음'}</span>
              </span>
            ))}
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>조건이 비어 있어도 저장은 됩니다. 빠진 칸을 알려줄 뿐입니다.</span>
            {entersFullFocus && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                이미 {MAX_FOCUS_PRODUCTS}개 제품에 집중하고 있어 이 단계로는 저장되지 않습니다. {focus.names.join(', ')} 중 하나를 먼저 내리세요.
              </span>
            )}
          </div>
        </EditDrawer>
      )}
    </div>
  );
}
