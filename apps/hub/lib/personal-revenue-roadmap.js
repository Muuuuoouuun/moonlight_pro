const DAY_MS = 86_400_000;

// DESIGN.md §5.3 — 확실성 채널의 값은 confirmed | recommended | unknown 셋뿐이고,
// 기하(solid/dashed/dotted)는 `CertaintyBadge`(§8.2)가 소유한다. 이전 4키 어휘는
// lifecycle 값 `waiting`을 확실성에 실어 §5.3 첫 문장(채널 겸직 금지)을 어겼고,
// `waiting`에 CSS 규칙이 없어 기본 solid = `confirmed`의 모양으로 렌더됐다.
//
// `closing`은 deal-stages.js의 won 단계다 — 금액은 확정이지만 현금은 아직 안 들어왔다.
// 그래서 확실성(confirmed)과 라이프사이클(waiting · "입금 대기")을 두 채널로 쪼갠다.
// `final`은 negotiation 별칭일 뿐 입금 단계가 아니어서 "입금 대기" 라벨이 애초에 오기였다.
export const CERTAINTY_BY_STAGE = Object.freeze({
  closing: { key: "confirmed", label: "확정" },
  final: { key: "recommended", label: "가능성 높음" },
  quote: { key: "recommended", label: "가능성 높음" },
  consult: { key: "recommended", label: "가능성 높음" },
  // "진행 중"은 LifecycleBadge의 `active` 라벨이다(hub-primitives.jsx). 확실성 라벨로
  // 재사용하면 방금 분리한 채널이 다시 겹치므로 §5.3이 지정한 unknown 어휘를 쓴다.
  contact: { key: "unknown", label: "확인 필요" },
  potential: { key: "unknown", label: "확인 필요" },
});

// DESIGN.md §5.3 lifecycle — 값이 실제로 있는 단계만 배지를 만든다. 희소한 것이 의도다:
// 단계 자체(견적·상담)는 카테고리이지 라이프사이클이 아니므로 `stageLabel`이 계속 담당한다.
export const LIFECYCLE_BY_STAGE = Object.freeze({
  closing: { key: "waiting", label: "입금 대기" },
});

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

function lifecycleForStage(stage) {
  return LIFECYCLE_BY_STAGE[stage] || null;
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
      const lifecycle = lifecycleForStage(deal.stage);
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
        lifecycle,
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
    recommended: 0,
    unknown: 0,
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
