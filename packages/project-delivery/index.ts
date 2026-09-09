export type Criterion = { id: string; text: string; done: boolean };
export type DeliveryPlan = {
  deliverable: string; plannedStart: string; prototypeDate: string;
  criteria: Criterion[]; remainingHours: number | null; availableHours: number | null;
  blocker: string; nextAction: string; nextVersion: string; resultUrl: string;
};

export function dayKey(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function validDay(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function safeResultUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}

export function deliveryDraft(value: Partial<DeliveryPlan> = {}): DeliveryPlan {
  return {
    deliverable: value.deliverable || "", plannedStart: value.plannedStart || "",
    prototypeDate: value.prototypeDate || "", criteria: Array.isArray(value.criteria) ? value.criteria : [],
    remainingHours: value.remainingHours ?? null, availableHours: value.availableHours ?? null,
    blocker: value.blocker || "", nextAction: value.nextAction || "",
    nextVersion: value.nextVersion || "", resultUrl: value.resultUrl || "",
  };
}

export function parseDelivery(value: unknown): DeliveryPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const strings = ["deliverable", "plannedStart", "prototypeDate", "blocker", "nextAction", "nextVersion", "resultUrl"];
  if (strings.some((key) => typeof row[key] !== "string" || (row[key] as string).length > 4000)) return null;
  if (![row.remainingHours, row.availableHours].every((value) => value === null || typeof value === "number")) return null;
  if (!Array.isArray(row.criteria) || row.criteria.some((item) => !item || typeof item.id !== "string" || typeof item.text !== "string" || typeof item.done !== "boolean")) return null;
  return deliveryDraft({
    ...Object.fromEntries(strings.map((key) => [key, (row[key] as string).trim()])),
    remainingHours: row.remainingHours as number | null, availableHours: row.availableHours as number | null,
    criteria: row.criteria.map((item) => ({ id: item.id, text: item.text.trim(), done: item.done })),
  });
}

export function validateDelivery(plan: DeliveryPlan, dueAt: unknown): string | null {
  for (const day of [plan.plannedStart, plan.prototypeDate]) if (day && !validDay(day)) return "날짜를 올바르게 입력하세요.";
  const due = dayKey(dueAt);
  if (dueAt && (!due || !validDay(due))) return "종료일을 올바르게 입력하세요.";
  const dates = [plan.plannedStart, plan.prototypeDate, due].filter(Boolean);
  if (dates.some((day, index) => index > 0 && day < dates[index - 1])) return "착수 예정일 → 프로토타입 확인일 → 목표 종료일 순서로 입력하세요.";
  if (plan.criteria.length > 30 || plan.criteria.some((item) => !item.id || !item.text.trim() || item.text.length > 500 || typeof item.done !== "boolean") || new Set(plan.criteria.map((item) => item.id)).size !== plan.criteria.length) return "완료 조건은 내용이 있는 항목으로 최대 30개까지 등록하세요.";
  for (const hours of [plan.remainingHours, plan.availableHours]) if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 10000)) return "작업 시간은 0~10,000시간 사이로 입력하세요.";
  if (plan.resultUrl && !safeResultUrl(plan.resultUrl)) return "결과물 링크는 http 또는 https 주소로 입력하세요.";
  return null;
}

export function completionIssue(plan: DeliveryPlan, prototypeVerifiedAt?: unknown): string | null {
  if (!plan.deliverable.trim()) return "이번에 남길 결과물을 입력하세요.";
  if (!plan.criteria.length || plan.criteria.some((item) => !item.done)) return "완료 조건을 등록하고 모두 확인하세요.";
  if (!prototypeVerifiedAt) return "프로토타입의 실제 작동을 먼저 확인하세요.";
  if (!safeResultUrl(plan.resultUrl)) return "검증할 수 있는 결과물 링크를 남겨주세요.";
  if (plan.blocker.trim()) return "남아 있는 병목을 해결하거나 다음 버전으로 옮겨주세요.";
  return null;
}

export function deliveryAssessment(plan: DeliveryPlan, options: { dueAt?: unknown; now?: string; completed?: boolean; prototypeVerifiedAt?: unknown; paused?: boolean } = {}) {
  if (options.completed) return { key: "completed", label: "완료", reason: "결과물과 검증 기록을 남겼습니다." };
  if (options.paused) return { key: "paused", label: "보류", reason: plan.blocker || "범위와 일정을 검토한 뒤 다시 진행하세요." };
  const due = dayKey(options.dueAt);
  const today = dayKey(options.now || new Date().toISOString());
  if (due && due < today) return { key: "difficult", label: "어려움", reason: "목표 종료일이 지났습니다. 범위와 일정을 다시 결정하세요." };
  if (plan.blocker.trim()) return { key: "caution", label: "주의", reason: plan.blocker };
  if (!plan.deliverable || !plan.criteria.length || !due || plan.remainingHours === null || plan.availableHours === null) return { key: "unknown", label: "판단 전", reason: "결과물·완료 조건·종료일·남은 작업 시간과 확보 시간을 입력하세요." };
  if (plan.remainingHours > plan.availableHours) return { key: "difficult", label: "어려움", reason: `확보한 시간보다 ${plan.remainingHours - plan.availableHours}시간 더 필요합니다. 이번 범위를 줄이거나 일정을 조정하세요.` };
  if (plan.prototypeDate && plan.prototypeDate < today && !options.prototypeVerifiedAt) return { key: "caution", label: "주의", reason: "프로토타입 확인일이 지났습니다. 실제 작동 여부를 확인하세요." };
  return { key: "possible", label: "가능", reason: `남은 작업 ${plan.remainingHours}시간 / 종료일까지 확보 ${plan.availableHours}시간. 입력한 예상 기준입니다.` };
}
