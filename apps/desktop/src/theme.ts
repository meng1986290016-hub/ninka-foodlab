export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "foodlab.theme.v1";

function normalizeThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function applyThemeToDocument(preference: ThemePreference) {
  if (preference === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function readThemePreference(): ThemePreference {
  return normalizeThemePreference(window.localStorage.getItem(THEME_KEY));
}

export function applyThemePreference(preference: ThemePreference) {
  applyThemeToDocument(preference);
  if (preference === "system") {
    window.localStorage.removeItem(THEME_KEY);
  } else {
    window.localStorage.setItem(THEME_KEY, preference);
  }
}

export function subscribeThemePreference(
  onChange?: (preference: ThemePreference) => void,
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    const preference = normalizeThemePreference(event.newValue);
    applyThemeToDocument(preference);
    onChange?.(preference);
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
