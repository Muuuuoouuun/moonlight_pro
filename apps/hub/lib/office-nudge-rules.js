/**
 * Office Nudge Rules Engine
 *
 * 운영자의 일상 운영 화면(Home, Work, Deals, Revenue, Projects)에서
 * 병목/위기 상황을 감지하고, 적재적소의 이브이즈 비서(C-Level)를 1:1 매칭하는 순수 룰 엔진.
 */

export const NUDGE_PRIORITIES = Object.freeze({
  severe_overload: 100,
  task_overdue: 90,
  task_too_many: 80,
  deal_stagnation: 70,
  expense_spike: 60,
  scope_creep: 50,
  home_morning_brief: 40,
});

export function getDaysDiff(d1, d2) {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * 1. 할 일 지연 및 과부하 감지 (샤미드 / 이브이)
 */
export function detectTaskOverload({ tasks = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  const incomplete = tasks.filter((t) => !t.completed && !t.done && t.status !== 'done');
  const overdue = incomplete.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = incomplete.filter((t) => t.dueDate === today);

  // 극심한 과부하: 5개 이상 기한 초과 -> 이브이 (80% 컷오프)
  if (overdue.length >= 5) {
    return {
      type: 'severe_overload',
      priority: NUDGE_PRIORITIES.severe_overload,
      key: 'nudge:severe_overload',
      agentId: 'eevee',
      agentName: '이브이',
      agentTitle: 'Chief of Staff',
      message: `기한 지난 할 일이 ${overdue.length}개나 엉켜 있어. 오늘 약속 1개만 남기고 80%는 내가 쳐낼게.`,
      ctaLabel: '이브이의 80% 컷오프',
      suggestedAction: 'cutoff_80',
      context: {
        overdueCount: overdue.length,
        tasks: overdue.slice(0, 5).map((t) => ({ id: t.id, title: t.title || t.name, dueDate: t.dueDate })),
      },
    };
  }

  // 통상 지연: 3개 이상 기한 초과 -> 샤미드 (WBS 컷오프)
  if (overdue.length >= 3) {
    return {
      type: 'task_overdue',
      priority: NUDGE_PRIORITIES.task_overdue,
      key: 'nudge:task_overdue',
      agentId: 'vaporeon',
      agentName: '샤미드',
      agentTitle: 'COO',
      message: `기한 지난 할 일이 ${overdue.length}개 밀려 있어. 가용 시간 대조해서 WBS 순서 컷오프하자.`,
      ctaLabel: '샤미드와 WBS 재정렬',
      suggestedAction: 'cutoff_wbs',
      context: {
        overdueCount: overdue.length,
        tasks: overdue.slice(0, 5).map((t) => ({ id: t.id, title: t.title || t.name, dueDate: t.dueDate })),
      },
    };
  }

  // 당일 과다: 오늘 마감 7개 초과 -> 샤미드
  if (dueToday.length > 7) {
    return {
      type: 'task_too_many',
      priority: NUDGE_PRIORITIES.task_too_many,
      key: 'nudge:task_too_many',
      agentId: 'vaporeon',
      agentName: '샤미드',
      agentTitle: 'COO',
      message: `오늘 마감 할 일이 ${dueToday.length}개야. 현실적으로 끝낼 수 있는 순서로 재배치하자.`,
      ctaLabel: '오늘 할 일 현실화',
      suggestedAction: 'reorder_today',
      context: {
        todayCount: dueToday.length,
        tasks: dueToday.slice(0, 5).map((t) => ({ id: t.id, title: t.title || t.name })),
      },
    };
  }

  return null;
}

/**
 * 2. 세일즈 딜 정체 감지 (부스터)
 */
export function detectDealStagnation({ deals = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!Array.isArray(deals) || deals.length === 0) return null;

  const activeDeals = deals.filter(
    (d) => !['won', 'lost', 'closed', 'cancelled'].includes((d.stage || '').toLowerCase())
  );

  const stagnant = [];
  for (const deal of activeDeals) {
    const lastDate = deal.lastContactDate || deal.updatedAt || deal.createdAt;
    if (lastDate) {
      const days = getDaysDiff(lastDate, today);
      if (days >= 5) {
        stagnant.push({ ...deal, daysStagnant: days });
      }
    }
  }

  if (stagnant.length === 0) return null;

  // 가장 오래 멈춰있거나 금액이 큰 딜 우선
  stagnant.sort((a, b) => (b.amount || 0) - (a.amount || 0) || b.daysStagnant - a.daysStagnant);
  const target = stagnant[0];
  const dealName = target.name || target.title || target.company || '정체 딜';

  return {
    type: 'deal_stagnation',
    priority: NUDGE_PRIORITIES.deal_stagnation,
    key: `nudge:deal_stagnation:${target.id || dealName}`,
    agentId: 'flareon',
    agentName: '부스터',
    agentTitle: 'CRO',
    message: `'${dealName}' 딜이 ${target.daysStagnant}일째 멈춰 있어. 망설이면 식는다! 1-CTA 후속 제안 보낼까?`,
    ctaLabel: '부스터의 1-CTA 제안',
    suggestedAction: 'followup_cta',
    context: {
      dealId: target.id,
      dealName,
      daysStagnant: target.daysStagnant,
      stage: target.stage,
      amount: target.amount,
      notes: target.notes || target.memo,
    },
  };
}

/**
 * 3. 지출/소비 급증 감지 (리피아)
 */
export function detectExpenseSpike({ expenses = null } = {}) {
  if (!expenses || typeof expenses !== 'object') return null;

  const ratio = expenses.budgetRatio ?? (expenses.budget ? (expenses.spent / expenses.budget) : null);
  const spikeDetected = Boolean(expenses.spike || (ratio !== null && ratio >= 0.85));

  if (!spikeDetected) return null;

  return {
    type: 'expense_spike',
    priority: NUDGE_PRIORITIES.expense_spike,
    key: 'nudge:expense_spike',
    agentId: 'leafeon',
    agentName: '리피아',
    agentTitle: 'CFO',
    message: `이번 달 도구/운영 지출이 예산의 ${ratio ? Math.round(ratio * 100) : 85}%에 도달했어. 지출 캡(Cap)과 손절선 점검할까?`,
    ctaLabel: '리피아와 지출 ROI 점검',
    suggestedAction: 'expense_cap',
    context: {
      spent: expenses.spent,
      budget: expenses.budget,
      ratio,
    },
  };
}

/**
 * 4. 기획 비대 및 완료 조건 누락 감지 (글레이시아)
 */
export function detectScopeCreep({ project = null } = {}) {
  if (!project || typeof project !== 'object') return null;

  const todos = Array.isArray(project.todos) ? project.todos : [];
  const hasNoDod = !project.dod && !project.definitionOfDone;
  const isTooManyTodos = todos.length >= 10;

  if (isTooManyTodos || hasNoDod) {
    return {
      type: 'scope_creep',
      priority: NUDGE_PRIORITIES.scope_creep,
      key: `nudge:scope_creep:${project.id || 'current'}`,
      agentId: 'glaceon',
      agentName: '글레이시아',
      agentTitle: 'CPO',
      message: isTooManyTodos
        ? `하위 태스크가 ${todos.length}개로 비대해졌어. 이번 릴리즈 필수 MVP만 남기고 잘라내자.`
        : '검증 가능한 완료 조건(DoD)이 비어 있어. 배포 전에 통과 기준 3문장만 정의하자.',
      ctaLabel: '글레이시아의 DoD 압축',
      suggestedAction: 'dod_compress',
      context: {
        projectId: project.id,
        projectTitle: project.title || project.name,
        todosCount: todos.length,
      },
    };
  }

  return null;
}

/**
 * 5. 첫 화면(Home/Futura/Daily Brief) 브리핑 감지 (이브이)
 */
export function detectHomeMorningBrief({ signals = [] } = {}) {
  if (!Array.isArray(signals) || signals.length < 4) return null;

  return {
    type: 'home_morning_brief',
    priority: NUDGE_PRIORITIES.home_morning_brief,
    key: 'nudge:home_morning_brief',
    agentId: 'eevee',
    agentName: '이브이',
    agentTitle: 'Chief of Staff',
    message: `오늘 확인할 신호가 ${signals.length}건이야. 핵심 결정 1개로 압축하고 담당 임원을 배정할게.`,
    ctaLabel: '이브이의 핵심 1건 압축',
    suggestedAction: 'core_decision',
    context: {
      signalsCount: signals.length,
      signals: signals.slice(0, 3).map((s) => s.title || s.summary),
    },
  };
}

/**
 * 우선순위 종합 리졸버 (단 1개의 가장 중요한 넛지만 반환)
 */
export function resolveActiveOfficeNudge({
  surface = 'home', // 'home' | 'work' | 'deals' | 'revenue' | 'projects'
  tasks = [],
  deals = [],
  expenses = null,
  project = null,
  signals = [],
  today = new Date().toISOString().slice(0, 10),
  suppressedKeys = new Set(),
} = {}) {
  const candidates = [];

  if (surface === 'work' || surface === 'home') {
    const taskNudge = detectTaskOverload({ tasks, today });
    if (taskNudge) candidates.push(taskNudge);
  }

  if (surface === 'deals' || surface === 'revenue' || surface === 'home') {
    const dealNudge = detectDealStagnation({ deals, today });
    if (dealNudge) candidates.push(dealNudge);
  }

  if (surface === 'revenue' || surface === 'home') {
    const expenseNudge = detectExpenseSpike({ expenses });
    if (expenseNudge) candidates.push(expenseNudge);
  }

  if (surface === 'projects') {
    const scopeNudge = detectScopeCreep({ project });
    if (scopeNudge) candidates.push(scopeNudge);
  }

  if (surface === 'home') {
    const homeNudge = detectHomeMorningBrief({ signals });
    if (homeNudge) candidates.push(homeNudge);
  }

  // 스누즈된 항목 필터링
  const activeCandidates = candidates.filter((c) => !suppressedKeys.has(c.key));
  if (activeCandidates.length === 0) return null;

  // 우선순위 정렬 (높은 점수 우선)
  activeCandidates.sort((a, b) => b.priority - a.priority);
  return activeCandidates[0];
}
