'use client';
import React from 'react';
import { Button, Drawer, SelectField, Skeleton, TruthBadge } from './hub-primitives';
import { loadOfficeConnectionBrands, officeConnectionInbox, officeCouncilConnectionSource, officeCustomerConnectionSource } from './office-connection-inbox.js';

const SCOPE_LABEL = { personal: '개인', classin: '회사' };
const stack = { display: 'grid', gap: 'var(--gap)' };
const note = { margin: 0, color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.7, overflowWrap: 'anywhere' };
const loadingBrands = () => ({ status: 'loading', brands: [] });

function useBrands(scope, reader, injected) {
  const [read, setRead] = React.useState(loadingBrands);
  const ticket = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++ticket.current;
    setRead(loadingBrands());
    const next = await reader(scope);
    if (ticket.current === current) setRead(next);
  }, [scope, reader]);
  React.useEffect(() => {
    if (!injected) load();
    return () => { ticket.current += 1; };
  }, [load, injected]);
  return [injected || read, load];
}

function BrandReadNotice({ read, onRetry }) {
  if (read.status === 'loading') return <Skeleton lines={2} label="브랜드 목록 확인 중" />;
  if (['error', 'preview'].includes(read.status)) return <div role={read.status === 'error' ? 'alert' : 'status'} style={stack}>
    <span><TruthBadge state={read.status} /> {read.note}</span><Button size="sm" variant="ghost" onClick={onRetry}>브랜드 다시 확인</Button>
  </div>;
  return read.status === 'partial' ? <p style={note}><TruthBadge state="partial" /> 일부 브랜드만 확인됐습니다.</p> : null;
}

// Only mounted in the user-opened settings drawer. This selection is recorded at
// begin(), without adding brand facts or a brandId to the model request contract.
export function OfficeConnectionBrandPicker({ scope, value, onChange, disabled = false, reader = loadOfficeConnectionBrands, brandState }) {
  const [read, reload] = useBrands(scope, reader, brandState);
  if (!SCOPE_LABEL[scope]) return <p style={note}>이브이 입력으로 연결할 결과는 회사 또는 개인 범위에서 새 요청을 시작해 주세요.</p>;
  const available = ['live', 'partial'].includes(read.status);
  const selectedExists = !value || read.brands.some(brand => brand.id === value);
  return <div style={stack}>
    <strong>입력 공유에 사용할 브랜드</strong>
    <BrandReadNotice read={read} onRetry={reload} />
    {available ? <SelectField label={`${SCOPE_LABEL[scope]} 결과의 출처 브랜드`} value={selectedExists ? value || '' : ''} disabled={disabled}
      onChange={event => { const brand = read.brands.find(item => item.id === event.target.value); onChange?.({ brandId: brand?.id || null }); }}
      options={[{ value: '', label: scope === 'classin' ? '회사 공통 · 브랜드 없음' : '브랜드 선택 필요' }, ...read.brands.map(brand => ({ value: brand.id, label: brand.name }))]} /> : null}
    {available && !read.brands.length ? <p style={note}>이 범위에서 확인한 브랜드가 없습니다.</p> : null}
    {available && !selectedExists ? <p role="status" style={note}>선택했던 브랜드를 현재 목록에서 확인하지 못했습니다. 새 요청 전에 브랜드를 다시 골라 주세요.</p> : null}
    <p style={note}>선택은 다음 요청을 시작할 때 출처 표식으로 남습니다. 브랜드 사실 자료를 모델에 제공하거나 기존 결과의 브랜드를 바꾸지는 않습니다. 개인 결과의 입력 공유에는 브랜드 선택이 필요합니다.</p>
  </div>;
}

export function OfficeConnectionSourceDrawer({ outcome, onClose, onShare, shared, brandState, reader = loadOfficeConnectionBrands }) {
  const source = outcome?.source;
  const [read, reload] = useBrands(source?.scope, reader, brandState);
  const brand = read.brands.find(item => item.id === source?.boundary.brandId);
  return <Drawer title="이브이에게 입력 공유" subtitle="현재 브라우저 세션의 이브이 입력 목록에 원문 복사본을 둡니다." onClose={onClose} width="min(480px, 94vw)">
    <div style={stack}>
      {source ? <>
        <strong>{source.label}</strong>
        <p style={note}>출처 범위 · {SCOPE_LABEL[source.scope]}</p>
        <BrandReadNotice read={read} onRetry={reload} />
        <p style={note}>선택된 출처 브랜드 · {source.boundary.brandId === null ? '회사 공통 · 브랜드 없음' : brand?.name || '기록된 브랜드 · 현재 이름 확인 필요'}</p>
        <p style={note}>이 표식은 출처의 선택 기록입니다. 모델이 해당 브랜드의 사실 자료를 읽었다는 증거가 아닙니다.</p>
        {source.kind === 'customer_reply' && source.source.state.request === null ? <p style={note}>보관된 현재 고객 결과·자료·승인 기록을 입력으로 공유합니다. 원래 생성 요청 본문은 복구되지 않았습니다.</p> : null}
        <details><summary>공유할 원문 확인</summary><pre style={{ ...note, whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(source.source, null, 2)}</pre></details>
      </> : null}
      <p style={note}>원문과 생성된 모델 출력을 함께 입력으로 공유합니다. 모델 출력은 독립적으로 사실 검증되지 않았습니다. 고객 초안 승인·검토 기록은 참고용이며 이브이의 승인이나 실행 권한으로 이어지지 않습니다.</p>
      <p style={note}>공유 자체는 모델 호출·자동 업무 생성·실행·외부 발송을 하지 않습니다. 새로고침·탭 종료 시 공유한 입력은 사라집니다. 세션 입력은 최대 10개입니다.</p>
      {outcome?.status === 'needs_user' ? <p style={note} role="status">{outcome.note}</p> : null}
      {shared ? <p style={note} role="status">{shared.status === 'shared' ? '이 세션의 이브이 입력 목록에 공유했습니다. 이브이 업무 분담 화면에서 사용할 자료를 직접 선택해 주세요.' : shared.note}</p> : null}
      <Button variant="primary" disabled={outcome?.status !== 'ready' || shared?.status === 'shared'} onClick={onShare}>{shared?.status === 'shared' ? '세션 입력 공유됨' : '원문을 세션 입력으로 공유'}</Button>
    </div>
  </Drawer>;
}

export function OfficeConnectionSourceAction({ turn, state, scope, inbox = officeConnectionInbox, onShared }) {
  const [open, setOpen] = React.useState(false), [shared, setShared] = React.useState(null);
  const capture = () => turn ? officeCouncilConnectionSource(turn)
    : officeCustomerConnectionSource(state, { scope, brandId: state?.context?.facts?.customer?.brandId });
  const outcome = open ? capture() : null;
  const share = () => {
    const current = capture();
    if (current.status !== 'ready') { setShared(current); return; }
    const result = inbox.publish(current.source);
    setShared(result);
    if (result.status === 'shared') onShared?.(result.source);
  };
  return <><Button variant="outline" size="sm" onClick={() => { setShared(null); setOpen(true); }}>이브이에게 입력 공유</Button>
    {open ? <OfficeConnectionSourceDrawer outcome={outcome} onClose={() => setOpen(false)} onShare={share} shared={shared} /> : null}</>;
}
