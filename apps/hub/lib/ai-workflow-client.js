// Small client contracts shared by AI suggestions; generation is never a save receipt.
export function createAdviceTaskWriter({ fetchImpl = fetch, createId = () => crypto.randomUUID() } = {}) {
  const attempts = new Map();
  return {
    save({ key, title, projectId = null, dealId = null }) {
      const normalized = typeof title === "string" ? title.trim() : "";
      if (!normalized || normalized.length > 300 || normalized.includes("\0")) {
        return Promise.resolve({ state: "error", note: "할 일 제목은 300자 이하로 입력하세요." });
      }
      const identity = JSON.stringify([key, normalized, projectId, dealId]);
      let attempt = attempts.get(identity);
      if (!attempt) {
        attempt = { id: createId(), pending: null, saved: null };
        attempts.set(identity, attempt);
      }
      if (attempt.saved) return Promise.resolve(attempt.saved);
      if (attempt.pending) return attempt.pending;
      attempt.pending = Promise.resolve().then(async () => {
        try {
          const response = await fetchImpl("/api/hub/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: attempt.id, title: normalized, projectId, dealId, source: "ai-advice" }),
          });
          const data = await response.json().catch(() => null);
          const entity = data?.task || data?.entity;
          if (response.ok && ["saved", "duplicate"].includes(data?.status) && entity?.id === attempt.id) {
            attempt.saved = { state: "saved", id: attempt.id };
            return attempt.saved;
          }
          return { state: "error", note: data?.status === "preview"
            ? "저장 위치가 연결되지 않아 등록되지 않았습니다. 연결 후 다시 시도하세요."
            : "할 일 저장을 확인하지 못했습니다. 같은 항목으로 다시 시도하세요." };
        } catch {
          return { state: "error", note: "저장 응답을 받지 못했습니다. 같은 항목으로 다시 시도하세요." };
        }
      }).finally(() => { attempt.pending = null; });
      return attempt.pending;
    },
  };
}

export function parseExtractedActions(text) {
  if (typeof text !== "string") return { summary: "", actions: [] };
  const summary = text.match(/📌\s*\[?1줄\s*핵심\s*요약\]?:\s*([^\n\r]+)/)?.[1]?.trim() || "";
  const actions = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^(?:[-*•]\s*)?🎯\s*(?:\[([^\]]+)\]\s*)?(.+)$/u);
    if (!match) continue;
    const title = match[2].trim();
    if (!title || title.length > 300 || title.includes("\0") || actions.some(action => action.title === title)) continue;
    actions.push({ title, classification: match[1] || "", saved: false });
    if (actions.length === 4) break;
  }
  return { summary, actions };
}

export function buildDailyDispatchContext({ dailyFocus, taskToday, signals = [], sourceState = "preview", now = new Date() }) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(now));
  const readable = slice => ["live", "partial"].includes(slice?.state);
  const slice = (value, items) => ({ state: value?.state || "preview", ...(readable(value) ? items : {}) });
  const ka = dailyFocus?.urgentKa;
  const customers = dailyFocus?.focusCustomers;
  const agenda = dailyFocus?.todayAgenda;
  return {
    sourceState,
    hour,
    isEvening: hour >= 17,
    timeZone: "Asia/Seoul",
    limitations: "error/preview/loading은 없음이 아니라 미확인입니다. 태스크는 열린 항목 중 일부이며 완료 항목의 제목과 내일 일정은 조회하지 않았습니다. 누락된 사실은 추정하지 마세요.",
    urgentKa: slice(ka, { item: ka?.item || null }),
    focusCustomers: slice(customers, { items: (customers?.items || []).slice(0, 5) }),
    todayAgenda: slice(agenda, { items: (agenda?.items || []).slice(0, 8) }),
    tasks: slice(taskToday, {
      items: (taskToday?.items || []).slice(0, 8).map(task => ({ title: task.title, status: task.status, lane: task.lane, dueAt: task.dueAt, priority: task.priority })),
      counts: taskToday?.counts,
      hiddenCount: taskToday?.hiddenCount || 0,
      completedTodayCount: taskToday?.streak?.todayDoneCount ?? null,
    }),
    signals: ["live", "partial"].includes(sourceState) ? signals.slice(0, 5).map(signal => ({ title: signal.title, summary: signal.summary, tone: signal.tone })) : [],
  };
}

export function buildWeeklySummaryText(report, scope) {
  if (!report) return '';
  const stats = report.stats || {};
  const goals = report.goals?.objectives || [];
  const highlights = report.highlights || [];
  const statParts = scope === 'company'
    ? [
        `CRM 연락: ${stats.contacts ?? '—'}건`,
        `신규 딜: ${stats.newDeals ?? '—'}건`,
        `수정된 진행 딜: ${stats.modifiedOpenDeals ?? '—'}건`,
        `성사일 확인된 딜: ${stats.wonDeals ?? '—'}건`,
      ]
    : [
        `완료 할 일: ${stats.doneTasks ?? '—'}건`,
        `발행: ${stats.publishes ?? '—'}건`,
        `CRM 연락: ${stats.contacts ?? '—'}건`,
        `개인 딜: ${stats.personalDeals ?? '—'}건`,
      ];
  const goalParts = goals.map(g => `- ${g.title} (${g.status || '진행중'})`);
  const highlightParts = highlights.map(h => `- ${h.kind === 'won' ? 'Won' : '완료'}: ${h.label}`);

  const lines = [
    `[${scope === 'company' ? '회사(ClassIn)' : '개인'} 주간 실적 팩트 (${report.periodStart || '시작'} ~ ${report.periodEnd || '종료'})]`,
    statParts.join(' · '),
  ];
  if (goalParts.length) {
    lines.push(`[연결된 목표]`, ...goalParts);
  }
  if (highlightParts.length) {
    lines.push(`[주요 하이라이트]`, ...highlightParts);
  }
  return lines.join('\n');
}

export function extractWeeklyExperiment(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/📌\s*다음\s*주\s*단\s*1가지\s*실험:\s*([^\n\r]+)/);
  if (match && match[1]?.trim()) {
    return '다음 주 실험: ' + match[1].trim().replace(/^\[|\]$/g, '').trim();
  }
  const taskMatch = text.match(/📌\s*추천\s*태스크:\s*([^\n\r]+)/);
  if (taskMatch && taskMatch[1]?.trim()) {
    return taskMatch[1].trim().replace(/^\[|\]$/g, '').trim();
  }
  return null;
}

export function parseContactOutcomeExtraction(text, now = new Date()) {
  if (typeof text !== "string" || !text.trim()) {
    return { kind: null, reaction: null, replied: null, summary: "", nextAction: "", nextAt: "", dormant: false };
  }

  const findField = (labels) => {
    const pattern = new RegExp(`(?:\\[|\\*)*\\s*(?:${labels.join("|")})\\s*(?:\\]|\\*)*\\s*[:：=]\\s*([^\\n\\r]+)`, "i");
    const m = text.match(pattern);
    return m ? m[1].replace(/^[\[\s*"]+|[\]\s*"]+$/g, "").trim() : "";
  };

  // 1. Channel / Kind
  let kind = null;
  const rawKind = findField(["채널", "유형", "수단", "channel", "kind"]);
  if (rawKind) {
    if (/call|통화|전화|콜/i.test(rawKind)) kind = "call";
    else if (/kakao|카카오|카톡|문자|메시지|chat/i.test(rawKind)) kind = "kakao";
    else if (/meeting|미팅|회의|줌|화상/i.test(rawKind)) kind = "meeting";
    else if (/visit|방문|현장/i.test(rawKind)) kind = "visit";
    else if (/demo|데모|시연/i.test(rawKind)) kind = "demo";
    else if (/email|이메일|메일/i.test(rawKind)) kind = "email";
  }

  // 2. Reaction
  let reaction = null;
  const rawReaction = findField(["고객\\s*반응", "고객반응", "반응", "태도", "reaction"]);
  if (rawReaction) {
    if (/positive|긍정|호의|적극|관심/i.test(rawReaction)) reaction = "positive";
    else if (/concern|우려|걱정|망설|의구심|고민/i.test(rawReaction)) reaction = "concern";
    else if (/rejected|거절|부정|취소|안함/i.test(rawReaction)) reaction = "rejected";
    else if (/no_response|무응답|부재|연락두절|부재중/i.test(rawReaction)) reaction = "no_response";
    else if (/neutral|중립|보통|검토|미정/i.test(rawReaction)) reaction = "neutral";
  }

  // 2b. Replied — 발신형 채널(카톡·이메일)에서 상대가 실제로 답했는지. 반응 필드는 늘 채워지므로
  // 이 값이 없으면 회신 여부를 알 수 없다(null) — 폼은 그때 회신을 켜지 않는다.
  let replied = null;
  const rawReplied = findField(["회신\\s*여부", "회신", "replied"]);
  if (rawReplied) {
    if (/^(?:예|네|있음|받음|true|yes)/i.test(rawReplied)) replied = true;
    else if (/^(?:아니오|아니요|없음|안\s*받음|false|no)/i.test(rawReplied)) replied = false;
  }

  // 3. Summary (1줄 요약)
  let summary = "";
  const rawSummary = findField(["1줄\\s*(?:핵심\\s*)?요약", "1줄\\s*요약", "요약", "핵심\\s*요약", "summary"]);
  if (rawSummary) {
    summary = rawSummary.slice(0, 120).trim();
  }

  // 4. Next Action
  let nextAction = "";
  const rawAction = findField(["다음\\s*(?:행동|액션|단계|할일)", "next\\s*action"]);
  if (rawAction && !/^(?:없음|기약\s*없음|종결|미정|-)$/i.test(rawAction)) {
    nextAction = rawAction;
  }

  // 5. Dormant check
  let dormant = false;
  const rawDormant = findField(["기약\\s*없음", "휴면", "종결", "dormant"]);
  if (rawDormant) {
    dormant = /^(?:예|네|true|yes|기약\s*없음|휴면)$/i.test(rawDormant);
  }
  if (!dormant && (rawAction && /기약\s*없음|휴면/i.test(rawAction))) {
    dormant = true;
  }

  // 6. Next Date (nextAt)
  let nextAt = "";
  if (!dormant) {
    const rawDate = findField(["다음\\s*(?:일정|날짜|약속|예정일)", "일정", "날짜", "next\\s*date", "due\\s*date"]);
    if (rawDate && !/^(?:없음|기약\s*없음|미정|-)$/i.test(rawDate)) {
      const dateMatch = rawDate.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
      if (dateMatch) {
        nextAt = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
      } else if (/내일/i.test(rawDate)) {
        const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        nextAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
      } else if (/모레/i.test(rawDate)) {
        const d = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        nextAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
      } else if (/오늘/i.test(rawDate)) {
        nextAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
      }
    }
  }

  return { kind, reaction, replied, summary, nextAction, nextAt, dormant };
}


