export const AI_TARGETS = [
  { id: "both", label: "Claude + Codex" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "engine", label: "Engine" },
];

export const AI_ORDER_PRIORITIES = ["P0", "P1", "P2", "P3"];

export const AI_ORDER_STATUS_LABELS = {
  draft: "초안",
  queued: "큐 대기",
  running: "실행 중",
  review: "리뷰 대기",
  done: "완료",
};

export const AI_COUNCIL_STATUS_LABELS = {
  draft: "초안",
  active: "수렴 중",
  hold: "보류",
  done: "완료",
};

export function normalizeAiTarget(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "both";
  }

  if (
    normalized === "both" ||
    normalized === "all" ||
    normalized.includes("claude + codex") ||
    (normalized.includes("claude") && normalized.includes("codex"))
  ) {
    return "both";
  }

  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("engine")) return "engine";
  return "both";
}

export function getAiTargetLabel(value) {
  const normalized = normalizeAiTarget(value);
  return AI_TARGETS.find((item) => item.id === normalized)?.label || AI_TARGETS[0].label;
}

export function normalizeAiAuthor(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["claude", "codex", "engine", "operator", "system"].includes(normalized)) {
    return normalized;
  }

  return "system";
}

export function getAiAuthorLabel(value) {
  const normalized = normalizeAiAuthor(value);

  if (normalized === "operator") return "You";
  if (normalized === "claude") return "Claude";
  if (normalized === "codex") return "Codex";
  if (normalized === "engine") return "Engine";
  return "System";
}

export function buildAiPreview(message, maxLength = 72) {
  const normalized = String(message || "").trim();

  if (!normalized) {
    return "메시지를 입력해 새 대화를 시작하세요.";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function buildAiThreadTitle(message, fallback = "새 스레드") {
  const cleaned = String(message || "")
    .replace(/^\//, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  return cleaned.length > 32 ? `${cleaned.slice(0, 32)}...` : cleaned;
}

export function formatAiClock(value = new Date()) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return "방금";
  }
}

export function buildAiChatReplies({ body, target, timeLabel = formatAiClock() }) {
  const summary = buildAiPreview(body);
  const normalizedTarget = normalizeAiTarget(target);

  if (normalizedTarget === "both") {
    return [
      {
        author: "claude",
        authorLabel: "Claude",
        time: timeLabel,
        body: `구조부터 잡으면 좋겠습니다. 지금 요청은 "${summary}" 기준으로 계획, 리스크, 첫 번째 산출물을 먼저 나누면 깔끔해요.`,
      },
      {
        author: "codex",
        authorLabel: "Codex",
        time: timeLabel,
        body: "구현 레인에서는 이 요청을 바로 실행 가능한 단위로 쪼개겠습니다. 필요한 파일과 검증 루프를 먼저 고정해둘게요.",
      },
    ];
  }

  if (normalizedTarget === "claude") {
    return [
      {
        author: "claude",
        authorLabel: "Claude",
        time: timeLabel,
        body: `좋아요. "${summary}" 요청은 먼저 판단 기준과 UX 리스크를 정리한 뒤 다음 액션으로 넘기겠습니다.`,
      },
    ];
  }

  if (normalizedTarget === "codex") {
    return [
      {
        author: "codex",
        authorLabel: "Codex",
        time: timeLabel,
        body: `바로 작업 단위로 변환하겠습니다. "${summary}" 쪽은 파일 범위와 검증 방법을 고정하면 바로 굴릴 수 있어요.`,
      },
    ];
  }

  return [
    {
      author: "engine",
      authorLabel: "Engine",
      time: timeLabel,
      body: `자동화 관점에서 받았습니다. "${summary}" 흐름은 실행 조건, 입력, 출력 로그를 먼저 정의하면 연결이 쉬워집니다.`,
    },
  ];
}

export function normalizeAiCouncilMembers(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const members = raw
    .map((item) => String(item).trim().toLowerCase())
    .map((item) => {
      if (item === "claude") return "Claude";
      if (item === "codex") return "Codex";
      if (item === "engine") return "Engine";
      return null;
    })
    .filter(Boolean);

  return Array.from(new Set(members));
}

export function normalizeAiCouncilStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["done", "completed", "complete", "완료"].includes(normalized)) return "done";
  if (["hold", "paused", "보류"].includes(normalized)) return "hold";
  if (["draft", "초안"].includes(normalized)) return "draft";
  return "active";
}

export function getAiCouncilStatusLabel(value) {
  return AI_COUNCIL_STATUS_LABELS[normalizeAiCouncilStatus(value)] || AI_COUNCIL_STATUS_LABELS.active;
}

export function buildAiCouncilTurns({
  topic,
  context,
  members,
  timeLabel = formatAiClock(),
}) {
  const normalizedTopic = String(topic || "").trim() || "새 카운슬";
  const summary =
    String(context || "").trim() || "세부 컨텍스트는 아직 짧지만, 결정이 필요한 범위는 명확합니다.";
  const normalizedMembers = normalizeAiCouncilMembers(members);
  const turns = [];

  if (normalizedMembers.includes("Claude")) {
    turns.push({
      author: "Claude",
      stance: "제안",
      time: timeLabel,
      body: `"${normalizedTopic}" 주제는 먼저 판단 기준과 UX 리스크를 분리해보는 편이 좋겠습니다. ${summary}`,
    });
  }

  if (normalizedMembers.includes("Codex")) {
    turns.push({
      author: "Codex",
      stance: turns.length ? "보완" : "제안",
      time: timeLabel,
      body: "구현 관점에서는 이 논의를 바로 실행 가능한 작업 단위와 검증 루프로 끊어두면 좋겠습니다.",
    });
  }

  if (normalizedMembers.includes("Engine")) {
    turns.push({
      author: "Engine",
      stance: "검토",
      time: timeLabel,
      body: "자동화 레인에서는 입력 조건, 실행 조건, 실패 시 핸드오프만 먼저 고정하면 이어서 붙일 수 있습니다.",
    });
  }

  if (turns.length) {
    const closer = turns[turns.length - 1].author;
    turns.push({
      author: closer,
      stance: "결정",
      time: timeLabel,
      body: `우선 "${normalizedTopic}" 을(를) 목업 기준으로 수렴시키고, 이후 실제 API 연결은 별도 오더로 분리합니다.`,
    });
  }

  return turns;
}

export function normalizeAiPriority(value) {
  const normalized = String(value || "P1")
    .trim()
    .toUpperCase();

  return AI_ORDER_PRIORITIES.includes(normalized) ? normalized : "P1";
}

export function normalizeAiOrderStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["draft", "초안"].includes(normalized)) return "draft";
  if (["running", "실행 중"].includes(normalized)) return "running";
  if (["review", "리뷰 대기"].includes(normalized)) return "review";
  if (["done", "완료"].includes(normalized)) return "done";
  return "queued";
}

export function getAiOrderStatusLabel(value) {
  return AI_ORDER_STATUS_LABELS[normalizeAiOrderStatus(value)] || AI_ORDER_STATUS_LABELS.queued;
}

export function getAiOrderTone(value) {
  const normalized = normalizeAiOrderStatus(value);

  if (normalized === "running") return "blue";
  if (normalized === "review") return "warning";
  if (normalized === "done") return "green";
  return "muted";
}
