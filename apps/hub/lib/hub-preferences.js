export const DEFAULT_HUB_PREFERENCES = Object.freeze({
  theme: "auto",
});

const VALID_THEMES = new Set(["auto", "dark", "light"]);

export function readHubPreferences(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { ...DEFAULT_HUB_PREFERENCES };
  }

  try {
    const theme = storage.getItem("mlp.theme");
    return {
      theme: VALID_THEMES.has(theme) ? theme : DEFAULT_HUB_PREFERENCES.theme,
    };
  } catch {
    return { ...DEFAULT_HUB_PREFERENCES };
  }
}

export function persistHubPreference(storage, key, value) {
  const isValid = key === "theme" && VALID_THEMES.has(value);

  if (!isValid || !storage || typeof storage.setItem !== "function") return false;

  try {
    storage.setItem(`mlp.${key}`, value);
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
