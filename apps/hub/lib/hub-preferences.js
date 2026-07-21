export const DEFAULT_HUB_PREFERENCES = Object.freeze({
  theme: "dark",
});

const VALID_THEMES = new Set(["dark", "light"]);

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
