export function formatHomeClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

// Home keeps one factual handoff line; task execution and the full queue live in Today.
export function buildHomeMorningBrief({ brief } = {}) {
  const task = brief?.taskToday;
  const status = brief?.status || 'loading';
  const state = status === 'unauthorized' || status === 'error' ? 'error'
    : status === 'loading' || status === 'syncing' ? 'loading'
      : status === 'preview' ? 'preview'
        : task?.stale ? 'partial'
          : task?.state === 'syncing' ? 'loading' : task?.state || 'partial';
  if (state === 'loading') return { state, progress: '할 일 확인 중' };
  if (state === 'preview') return { state, progress: '할 일 기록이 연결되면 오늘에서 실행할 수 있습니다.' };
  if (state === 'error') return { state, progress: '할 일을 읽지 못했습니다. 오늘에서 다시 확인하세요.' };
  if (state !== 'live') return { state: 'partial', progress: task?.stale ? '이전 조회 기록입니다. 오늘에서 최신 목록을 확인하세요.' : '일부 할 일만 확인했습니다. 오늘에서 전체 목록을 확인하세요.' };
  const picked = task?.focus?.picked, done = task?.focus?.done;
  const verified = Number.isInteger(picked) && picked >= 0 && picked <= MAX_FOCUS_PER_DAY
    && Number.isInteger(done) && done >= 0 && done <= picked;
  const queue = task?.queueCount;
  const progress = verified
    ? `${picked ? `집중 ${picked}개 중 ${done}개 완료` : '아직 오늘 집중할 일을 고르지 않았습니다'}${Number.isInteger(queue) && queue >= 0 ? ` · 대기 ${queue}개` : ''}`
    : '할 일 진척을 확인하지 못했습니다. 오늘에서 목록을 확인하세요.';
  return { state, progress };
}
import { MAX_FOCUS_PER_DAY } from '../../../lib/task-today.js';
