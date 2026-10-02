"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, EmptyState, Skeleton, TruthBadge } from '../hub-primitives';
import { useContentLedger } from '../use-content-ledger';
import { useContentSchedule } from './use-content-schedule';
import { PublishLogView } from './publish-log-view';
import { createFollowUpStarter } from '@/lib/content-follow-up';
import { postStudio } from './content-studio-api';
import { buildPublishLog, countLog, filterLog, weekStrip } from '@/lib/content-publish-log';
import './content-publish-log.css';

// 발행 로그 — 예약·놓침·발행을 시간 순 한 목록으로. 수치는 성과 화면이 소유하고 여기서는 읽기만 한다(기록·수정은 성과에서).
// 자동 업로드는 없다 — 발행은 운영자가 올리고 기록한 것이다(README 보류 결정).
export function ContentPublishLog() {
  const router = useRouter();
  const params = useSearchParams();
  const schedules = useContentSchedule('all');
  const ledger = useContentLedger();
  const [metricsById, setMetricsById] = React.useState({});
  const [metricsFailed, setMetricsFailed] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState(params.get('variant') || '');
  const [now, setNow] = React.useState(() => Date.now());

  // 낮에 '올릴 차례'가 '시각 지남'으로 바뀌고 새 예약이 도래하도록 분 단위로 다시 계산한다(서버 재조회 없음).
  React.useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  React.useEffect(() => {
    let active = true;
    const reload = () => fetch(`/api/hub/content/performance?year=${new Date().getFullYear()}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      .then((response) => response.json())
      .then((result) => {
        if (!active) return;
        if (result?.status !== 'live' || !Array.isArray(result.publications)) throw new Error('metrics-unavailable');
        setMetricsById(Object.fromEntries(result.publications.filter((row) => row.metrics?.capturedAt).map((row) => [row.id, row.metrics])));
        setMetricsFailed(false);
      })
      .catch(() => { if (active) setMetricsFailed(true); });
    reload();
    window.addEventListener('moonlight:content-saved', reload);
    return () => { active = false; window.removeEventListener('moonlight:content-saved', reload); };
  }, []);

  const allRows = React.useMemo(
    () => buildPublishLog({ schedules: schedules.schedules, publishLogs: ledger.publishLogs || [], metricsById }, now),
    [schedules.schedules, ledger.publishLogs, metricsById, now],
  );
  const rows = React.useMemo(() => filterLog(allRows, filter), [allRows, filter]);
  const week = React.useMemo(() => weekStrip(allRows, now), [allRows, now]);
  const counts = React.useMemo(() => countLog(allRows), [allRows]);

  const loading = schedules.status === 'loading' || ledger.syncState === 'loading';
  const failed = schedules.status === 'error' || ledger.syncState === 'error';
  const preview = schedules.status === 'preview' && ledger.syncState === 'preview';
  const partial = !failed && (schedules.status === 'preview' || ledger.syncState === 'partial' || ledger.syncState === 'preview');
  const retry = () => { schedules.reload(); window.dispatchEvent(new Event('moonlight:content-saved')); };
  const openDraft = (row) => router.push(`/dashboard/content/studio?item=${encodeURIComponent(row.contentId)}&variant=${encodeURIComponent(row.variantId)}`);

  const [followUp, setFollowUp] = React.useState({ busy: false, message: '' });
  const followUpStarter = React.useRef(null);
  if (!followUpStarter.current) followUpStarter.current = createFollowUpStarter({
    read: async (contentId) => {
      const response = await fetch('/api/hub/content/workflow?item=' + encodeURIComponent(contentId), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('원본 글을 불러오지 못했어요.');
      return response.json();
    },
    save: (command) => postStudio('workflow', command),
  });
  // 발행한 글을 인용한 새 글을 서버에 만들고 원고 작성으로 연다. 만들기가 확인되지 않으면 이동하지 않는다.
  const startFollowUp = async (row) => {
    if (followUp.busy) return;
    setFollowUp({ busy: true, message: '' });
    try {
      const saved = await followUpStarter.current(row);
      router.push(`/dashboard/content/studio?item=${encodeURIComponent(saved.item.id)}&variant=${encodeURIComponent(saved.variant.id)}`);
    } catch (error) { setFollowUp({ busy: false, message: error?.message || '후속편을 만들지 못했어요.' }); return; }
    setFollowUp({ busy: false, message: '' });
  };

  return (
    <div className="hub-page content-publish-log fade-up">
      <header className="pl-header">
        <div><h2>발행</h2><p>예약 · 놓침 · 발행을 시간 순으로. 발행은 직접 올리고 기록한 것입니다.</p></div>
        <div className="pl-toolbar">
          {partial && <TruthBadge state="partial" reason={schedules.status === 'preview' ? '예약 저장소 연결 필요' : '발행 기록 일부만 확인'} />}
          {metricsFailed && <TruthBadge state="partial" reason="성과 수치 확인 실패" />}
          <Button variant="outline" onClick={retry} disabled={loading}>새로고침</Button>
        </div>
      </header>
      {loading ? <Skeleton lines={6} height={22} label="발행 로그 불러오는 중" />
        : failed ? <EmptyState icon="content" title="발행 로그를 확인하지 못했습니다" description={schedules.message || '예약 또는 발행 기록을 불러오지 못했습니다. 기록은 그대로입니다.'} action={<Button onClick={retry}>다시 불러오기</Button>} />
        : preview ? <EmptyState icon="content" title="저장소 연결이 필요합니다" description="연결되면 예약과 발행 기록이 여기에 시간 순으로 쌓입니다." />
        : !allRows.length ? <EmptyState icon="content" title="아직 예약·발행 기록이 없습니다" description="원고 작성에서 예약하거나 발행했음을 기록하면 여기에 남습니다." action={<Button variant="outline" onClick={() => router.push('/dashboard/content/studio')}>원고 작성으로</Button>} />
        : <PublishLogView rows={rows} allRows={allRows} counts={counts} filter={filter} onFilter={setFilter} week={week}
            selectedId={selectedId} onSelect={setSelectedId} onOpenDraft={openDraft} onOpenPerformance={() => router.push('/dashboard/content/performance')} onFollowUp={startFollowUp} followUpBusy={followUp.busy} />}
        {followUp.message && <p role="alert" className="pl-muted">{followUp.message}</p>}
    </div>
  );
}
