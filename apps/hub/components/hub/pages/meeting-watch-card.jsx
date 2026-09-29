"use client";

import React from 'react';
import Link from 'next/link';
import { Button, Card, EmptyState, Skeleton, TruthBadge } from '../hub-primitives';
import './meeting-watch-card.css';

const ENDPOINT = '/api/hub/journal/meeting-watch';
const MAX_VISIBLE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY = { status: 'loading', items: [], hasMore: false };

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sourceHref(entryId) {
  return `/dashboard/work/memos?note=${encodeURIComponent(entryId)}`;
}

function normalizeWatchItem(item) {
  if (!item || typeof item !== 'object' || !UUID.test(item.proposalId) || !UUID.test(item.entryId)
    || typeof item.title !== 'string' || !item.title.trim()
    || (item.checkAt !== null && !validDay(item.checkAt))
    || (item.method !== null && typeof item.method !== 'string')
    || !Number.isSafeInteger(item.stepCount) || item.stepCount < 0 || item.stepCount > 50) return null;
  return {
    proposalId: item.proposalId,
    entryId: item.entryId,
    title: item.title.trim(),
    checkAt: item.checkAt || null,
    method: item.method?.trim() || null,
    stepCount: item.stepCount,
    href: sourceHref(item.entryId),
  };
}

export function readMeetingWatchEnvelope(response, data) {
  if (!response?.ok || !data || typeof data !== 'object') return { status: 'error', items: [], hasMore: false };
  if (data.status === 'preview') return { status: 'preview', items: [], hasMore: false };
  if (data.status !== 'live' || !Array.isArray(data.items)) return { status: 'error', items: [], hasMore: false };
  const items = data.items.map(normalizeWatchItem);
  if (items.some((item) => !item)) return { status: 'error', items: [], hasMore: false };
  return { status: 'live', items: items.slice(0, MAX_VISIBLE), hasMore: data.hasMore === true || items.length > MAX_VISIBLE };
}

function displayDay(value) {
  if (!value) return '점검일 미정';
  const [year, month, day] = value.split('-').map(Number);
  return `점검일 ${year}년 ${month}월 ${day}일`;
}

function WatchRow({ item }) {
  return <li className="meeting-watch__row">
    <div className="meeting-watch__row-main">
      <span className="meeting-watch__title">{item.title}</span>
      <span className="meeting-watch__date mono">{displayDay(item.checkAt)}</span>
    </div>
    <div className="meeting-watch__row-sub">
      <span>{item.method ? `점검 방법 · ${item.method}` : '점검 방법 미정'}</span>
      <span className="num">단계 {item.stepCount}개</span>
    </div>
    <Link href={item.href} className="meeting-watch__source-link hub-row">회의 원문 열기 →</Link>
  </li>;
}

export function MeetingWatchCard() {
  const [view, setView] = React.useState(EMPTY);
  const [refreshing, setRefreshing] = React.useState(false);
  const serial = React.useRef(0);

  const reload = React.useCallback(async () => {
    const ticket = ++serial.current;
    setRefreshing(true);
    let envelope;
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json().catch(() => null);
      envelope = readMeetingWatchEnvelope(response, data);
    } catch {
      envelope = { status: 'error', items: [], hasMore: false };
    }
    if (ticket !== serial.current) return;
    setView(envelope);
    setRefreshing(false);
  }, []);

  React.useEffect(() => {
    reload();
    return () => { serial.current += 1; };
  }, [reload]);

  const listed = view.items.slice(0, 3);
  const remaining = view.items.slice(3);
  return <section aria-labelledby="meeting-watch-title">
    <Card pad={false} className="meeting-watch">
      <div className="meeting-watch__head">
        <div>
          <h3 id="meeting-watch-title">함께 신경 쓸 일</h3>
          <p>다른 사람의 진행이 내 확인·승인·일정에 영향을 주는 항목입니다. 내 할 일로 등록된 것은 아닙니다.</p>
        </div>
        <div className="meeting-watch__head-actions">
          {view.status === 'live' && <span className="meeting-watch__count num">{view.items.length}{view.hasMore ? '+' : ''}개</span>}
          {view.status === 'preview' && <TruthBadge state="preview" label="저장소 연결 필요" />}
          {view.status === 'error' && <TruthBadge state="error" label="읽기 실패" />}
          {refreshing && view.status !== 'loading' && <TruthBadge state="syncing" label="다시 확인 중" />}
          <Button type="button" variant="ghost" size="sm" disabled={refreshing} onClick={reload}>다시 확인</Button>
        </div>
      </div>

      {view.status === 'loading' && <div className="meeting-watch__body"><Skeleton lines={2} height={16} gap={10} label="함께 신경 쓸 일 불러오는 중" /></div>}
      {view.status === 'preview' && <div className="meeting-watch__body meeting-watch__message" role="status">저장소가 연결되지 않아 관련 주시 항목을 확인할 수 없어요.</div>}
      {view.status === 'error' && <div className="meeting-watch__body meeting-watch__message meeting-watch__message--error" role="alert">관련 주시 항목을 읽지 못했어요. 다시 확인해 주세요.</div>}
      {view.status === 'live' && view.items.length === 0 && <EmptyState icon="inbox" title="함께 신경 쓸 항목이 없습니다"
        description="회의 메모에서 관련 항목을 검토하면 여기에 모입니다."
        action={<Link href="/dashboard/work/memos" className="meeting-watch__source-link hub-row">회의 메모 열기 →</Link>}
        style={{ minHeight: 128, padding: '16px 20px' }} />}
      {view.status === 'live' && view.items.length > 0 && <div className="meeting-watch__body">
        <ul className="meeting-watch__list">{listed.map((item) => <WatchRow key={item.proposalId} item={item} />)}</ul>
        {remaining.length > 0 && <details className="meeting-watch__more">
          <summary>나머지 {remaining.length}개 보기</summary>
          <ul className="meeting-watch__list">{remaining.map((item) => <WatchRow key={item.proposalId} item={item} />)}</ul>
        </details>}
        <p className="meeting-watch__limit">점검일 순 최대 20개 표시{view.hasMore ? ' · 더 많은 항목은 회의 메모에서 확인하세요.' : ''}</p>
      </div>}
    </Card>
  </section>;
}
