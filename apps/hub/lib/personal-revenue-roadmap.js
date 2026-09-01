const DAY_MS = 86_400_000;

const CERTAINTY_BY_STAGE = {
  closing: { key: "confirmed", label: "확정" },
  final: { key: "waiting", label: "입금 대기" },
  quote: { key: "likely", label: "가능성 높음" },
  consult: { key: "likely", label: "가능성 높음" },
  contact: { key: "possible", label: "진행 중" },
  potential: { key: "possible", label: "진행 중" },
};

const STAGE_LABELS = {
  potential: "잠재 리드",
  contact: "컨택",
  consult: "상담",
  quote: "견적",
  final: "최종미팅",
  closing: "클로징",
};

const RECOMMENDED_ACTION_BY_STAGE = {
  closing: "입금 확인 및 증빙 정리",
  final: "결제 일정과 담당자를 확정",
  quote: "견적 피드백을 확인하고 다음 미팅 제안",
  consult: "상담 후 제안 범위를 정리해 전달",
  contact: "다음 연락 일정을 확정",
  potential: "첫 접점과 니즈 확인",
};

function validDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfDay(value) {
  const date = validDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateSerial(value) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
}

function addDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(value);
}

function normalizedValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function certaintyForStage(stage) {
  return CERTAINTY_BY_STAGE[stage] || CERTAINTY_BY_STAGE.potential;
}

export function recommendDealAction(stage) {
  return RECOMMENDED_ACTION_BY_STAGE[stage] || "다음 행동을 직접 지정";
}

function actionForDeal(deal) {
  const explicit = typeof deal?.nextAction === "string" ? deal.nextAction.trim() : "";
  if (explicit) {
    return { text: explicit, source: "confirmed", label: "확정" };
  }
  return {
    text: recommendDealAction(deal?.stage),
    source: "recommended",
    label: "권장",
  };
}

function buildTicks(start, days) {
  const offsets = [...new Set([0, 7, 14, 21, days])].filter((offset) => offset <= days);
  return offsets.map((offset) => {
    const date = addDays(start, offset);
    return {
      offset,
      position: days === 0 ? 0 : (offset / days) * 100,
      label: offset === 0 ? "오늘" : formatDate(date),
      dateAt: date.toISOString(),
    };
  });
}

export function buildPersonalRevenueRoadmap(deals, options = {}) {
  const days = Number.isFinite(Number(options.days))
    ? Math.max(1, Math.round(Number(options.days)))
    : 30;
  const start = startOfDay(options.now);
  const end = addDays(start, days);
  const startSerial = dateSerial(start);

  const events = (Array.isArray(deals) ? deals : [])
    .flatMap((deal) => {
      if (!deal || deal.stage === "lost" || deal.hidden) return [];
      const closeDate = validDate(deal.closeAt);
      if (!closeDate) return [];
      const dayOffset = dateSerial(closeDate) - startSerial;
      if (dayOffset < 0 || dayOffset > days) return [];
      const certainty = certaintyForStage(deal.stage);
      return [{
        ...deal,
        value: normalizedValue(deal.value),
        closeDate,
        closeAt: closeDate.toISOString(),
        closeLabel: formatDate(closeDate),
        dayOffset,
        position: (dayOffset / days) * 100,
        stageLabel: STAGE_LABELS[deal.stage] || "단계 미정",
        certainty,
        action: actionForDeal(deal),
      }];
    })
    .sort((left, right) => (
      left.dayOffset - right.dayOffset
      || right.value - left.value
      || String(left.name || "").localeCompare(String(right.name || ""), "ko")
    ));

  const summary = events.reduce((result, event) => {
    result.expectedInflow += event.value;
    result[event.certainty.key] += event.value;
    result.missingNextAction += event.action.source === "recommended" ? 1 : 0;
    result.scheduledDeals += 1;
    return result;
  }, {
    expectedInflow: 0,
    confirmed: 0,
    waiting: 0,
    likely: 0,
    possible: 0,
    missingNextAction: 0,
    scheduledDeals: 0,
  });

  const actions = events
    .filter((event) => event.certainty.key !== "confirmed")
    .sort((left, right) => left.dayOffset - right.dayOffset || right.value - left.value)
    .slice(0, 3);

  return {
    window: {
      days,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      startLabel: formatDate(start),
      endLabel: formatDate(end),
      ticks: buildTicks(start, days),
    },
    summary,
    events,
    actions,
    changeableAmount: actions.reduce((total, event) => total + event.value, 0),
  };
}
