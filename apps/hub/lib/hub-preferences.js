// 펼친 사이드바 폭(px) — 경계 드래그·키보드로 조절한다. 접힌 56px 레일과는 별개 값이라
// 다시 펼치면 마지막으로 맞춘 폭으로 돌아온다. default는 드래그 이전의 고정 폭이다.
export const SIDEBAR_WIDTH = Object.freeze({
  min: 200,
  max: 360,
  default: 232,
  step: 16,
  rail: 56,
  collapseThreshold: 140,
});

export const DEFAULT_HUB_PREFERENCES = Object.freeze({
  theme: "auto",
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_WIDTH.default,
});

const VALID_THEMES = new Set(["auto", "dark", "light"]);

export function shouldCollapseSidebar(rawWidth) {
  const n = Number(rawWidth);
  if (!Number.isFinite(n)) return false;
  return n < SIDEBAR_WIDTH.collapseThreshold;
}

export function clampSidebarWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return SIDEBAR_WIDTH.default;
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, n)));
}

// WAI-ARIA window splitter 키. 처리하지 않는 키는 null — 호출부가 기본 동작을 막지 않는다.
export function nextSidebarWidth(current, key) {
  if (key === "ArrowLeft") return clampSidebarWidth(current - SIDEBAR_WIDTH.step);
  if (key === "ArrowRight") return clampSidebarWidth(current + SIDEBAR_WIDTH.step);
  if (key === "Home") return SIDEBAR_WIDTH.min;
  if (key === "End") return SIDEBAR_WIDTH.max;
  return null;
}

function readSidebarWidth(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return SIDEBAR_WIDTH.default;
  return clampSidebarWidth(raw);
}

function isValidSidebarWidth(value) {
  return Number.isInteger(value) && value >= SIDEBAR_WIDTH.min && value <= SIDEBAR_WIDTH.max;
}

export function readHubPreferences(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { ...DEFAULT_HUB_PREFERENCES };
  }

  try {
    const theme = storage.getItem("mlp.theme");
    return {
      theme: VALID_THEMES.has(theme) ? theme : DEFAULT_HUB_PREFERENCES.theme,
      sidebarCollapsed: storage.getItem("mlp.sidebarCollapsed") === "true",
      sidebarWidth: readSidebarWidth(storage.getItem("mlp.sidebarWidth")),
    };
  } catch {
    return { ...DEFAULT_HUB_PREFERENCES };
  }
}

export function persistHubPreference(storage, key, value) {
  const isValid = (key === "theme" && VALID_THEMES.has(value))
    || (key === "sidebarCollapsed" && typeof value === "boolean")
    || (key === "sidebarWidth" && isValidSidebarWidth(value));

  if (!isValid || !storage || typeof storage.setItem !== "function") return false;

  try {
    storage.setItem(`mlp.${key}`, String(value));
    return true;
  } catch {
    return false;
  }
}

// Use the device's local clock. Keep the initial SSR render independent of time.
export function resolveHubTheme(preference, now = new Date()) {
  if (preference === "light" || preference === "dark") return preference;
  const hour = now.getHours();
  return hour >= 7 && hour < 18 ? "light" : "dark";
}

export function watchHubTheme(preference, onTheme, {
  now = () => new Date(),
  schedule = setTimeout,
  cancel = clearTimeout,
  target = window,
  documentTarget = document,
} = {}) {
  let timer;
  const refresh = () => {
    cancel(timer);
    const current = now();
    onTheme(resolveHubTheme(preference, current));
    if (preference !== "auto") return;
    const next = new Date(current);
    const hour = current.getHours();
    if (hour >= 18) next.setDate(next.getDate() + 1);
    next.setHours(hour >= 7 && hour < 18 ? 18 : 7, 0, 0, 0);
    timer = schedule(refresh, next.getTime() - current.getTime());
  };
  refresh();
  target.addEventListener("focus", refresh);
  documentTarget.addEventListener("visibilitychange", refresh);
  return () => {
    cancel(timer);
    target.removeEventListener("focus", refresh);
    documentTarget.removeEventListener("visibilitychange", refresh);
  };
}
