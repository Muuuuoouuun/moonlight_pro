import { projectItemType, readTaskChecklist } from './task-checklist.js';

// 프로젝트 상세의 `다음` 띠가 가리킬 한 걸음(2026-10-19 Projects B Focus 시안).
// 열린 할 일은 열린 세부 체크가 있으면 그 체크들로, 없으면 할 일 자신으로 펼친다.
// 고르는 순서: 프로젝트에 적어 둔 다음 행동과 제목이 같은 걸음 → 급한 항목(기한 지남·오늘·막힘·7일 안)
// → 기한이 가장 이른 걸음 → 목록 순서. 적어 둔 다음 행동이 어떤 걸음과도 맞지 않으면 글만 돌려준다
// (저장할 대상이 없으니 `처리 완료`를 그릴 수 없다).
function dueTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function projectOpenSteps(tasks = []) {
  return tasks.filter(task => task && !task.done && task.status !== 'done').flatMap(task => {
    const open = readTaskChecklist(task).filter(item => !item.done);
    if (open.length) return open.map(item => ({
      taskId: task.id, checkId: item.id, title: item.title, group: task.title,
      groupType: projectItemType(task), dueAt: item.dueAt || task.dueAt || null,
    }));
    return [{ taskId: task.id, checkId: null, title: task.title, group: null, groupType: projectItemType(task), dueAt: task.dueAt || null }];
  });
}

export function selectProjectNextStep({ tasks = [], nextAction = '', urgentItems = [] } = {}) {
  const steps = projectOpenSteps(tasks);
  const text = typeof nextAction === 'string' ? nextAction.trim() : '';
  if (text) {
    const linked = steps.find(step => step.title.trim() === text);
    return linked ? { ...linked, source: 'linked' } : { title: text, taskId: null, checkId: null, group: null, dueAt: null, source: 'record' };
  }
  const urgent = urgentItems[0];
  if (urgent) {
    const hit = steps.find(step => step.taskId === urgent.taskId && step.checkId === (urgent.checkId || null));
    if (hit) return { ...hit, source: 'urgent' };
  }
  const nearest = steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => dueTime(a.step.dueAt) - dueTime(b.step.dueAt) || a.index - b.index)[0]?.step;
  return nearest ? { ...nearest, source: 'nearest' } : null;
}

// 작업 묶음 행에 그리는 기간: 세부 체크·묶음 자신의 날짜 중 가장 이른 날과 늦은 날.
export function projectGroupSpan(task = {}) {
  const days = [...readTaskChecklist(task).map(item => item.dueAt), task.dueAt]
    .filter(Boolean)
    .map(value => ({ value, time: dueTime(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  if (!days.length) return null;
  return { start: days[0].value, end: days[days.length - 1].value, single: days[0].time === days[days.length - 1].time };
}
