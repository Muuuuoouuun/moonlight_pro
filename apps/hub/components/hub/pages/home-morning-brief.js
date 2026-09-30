const READABLE = new Set(['live', 'partial']);

export function formatHomeClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function briefState(brief, schedule) {
  const states = [brief?.status || 'loading', schedule?.status || 'loading'];
  if (states.includes('loading')) return 'loading';
  if (states.every(state => state === 'live')) return 'live';
  if (states.every(state => state === 'error')) return 'error';
  if (states.every(state => state === 'preview')) return 'preview';
  return 'partial';
}

function attentionText(brief) {
  const focus = brief?.dailyFocus;
  const ka = focus?.urgentKa;
  if (READABLE.has(ka?.state) && ka.item) {
    return [ka.item.name, ka.item.reason].filter(Boolean).join(' · ');
  }

  if (READABLE.has(brief?.status)) {
    const urgent = (brief.signals || []).find(signal => signal?.tone === 'danger' && signal.title);
    if (urgent) return urgent.title;
  }

  const customers = focus?.focusCustomers;
  if (READABLE.has(customers?.state)) {
    const overdue = (customers.items || []).find(customer => customer?.dueOverdue && customer.name);
    if (overdue) return [overdue.name, overdue.dueLabel].filter(Boolean).join(' · ');
  }

  const tasks = brief?.taskToday;
  if (READABLE.has(tasks?.state) && Number.isInteger(tasks.counts?.missed) && tasks.counts.missed > 0) {
    return `기한 지난 할 일 ${tasks.counts.missed}건 확인`;
  }

  const complete = brief?.status === 'live' && ka?.state === 'live'
    && customers?.state === 'live' && tasks?.state === 'live';
  return complete ? '지금 먼저 확인할 긴급 항목이 없습니다' : '일부 기록을 확인하지 못했습니다';
}

function agendaText(schedule, now) {
  if (READABLE.has(schedule?.status)) {
    const currentOrNext = (schedule.events || [])
      .filter(event => event && !event.allDay && Number.isFinite(new Date(event.start).getTime())
        && new Date(event.end || event.start).getTime() > now.getTime())
      .sort((left, right) => new Date(left.start) - new Date(right.start))[0];
    if (currentOrNext) {
      const prefix = new Date(currentOrNext.start).getTime() <= now.getTime()
        ? '진행 중' : formatHomeClock(currentOrNext.start);
      return `${prefix} ${currentOrNext.title || '(제목 없는 일정)'}`;
    }
    return schedule.status === 'partial'
      ? '확인된 남은 시간 일정이 없습니다 · 일부 캘린더 미확인'
      : '남은 시간 일정이 없습니다';
  }
  return schedule?.status === 'preview' ? '캘린더 연결 필요' : '일정을 확인하지 못했습니다';
}

function progressText(brief) {
  const tasks = brief?.taskToday;
  if (READABLE.has(tasks?.state)) {
    const picked = tasks.focus?.picked;
    const done = tasks.focus?.done;
    if (Number.isInteger(picked) && picked >= 0 && Number.isInteger(done) && done >= 0) {
      if (picked === 0) return '오늘의 핵심 할 일을 아직 고르지 않았습니다';
      return `직접 고른 할 일 ${picked}개 중 ${Math.min(done, picked)}개 완료`;
    }
  }
  return '할 일 진척을 확인하지 못했습니다';
}

export function buildHomeMorningBrief({ brief, schedule, now = new Date() } = {}) {
  return {
    state: briefState(brief, schedule),
    rows: [
      { label: '먼저 확인', text: attentionText(brief) },
      { label: '다음 일정', text: agendaText(schedule, now) },
      { label: '오늘의 진척', text: progressText(brief) },
    ],
  };
}
