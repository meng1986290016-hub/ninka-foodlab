import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
} from "./theme";

describe("theme preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("falls back to the system theme for missing or invalid values", () => {
    expect(readThemePreference()).toBe("system");
    window.localStorage.setItem("foodlab.theme.v1", "sepia");
    expect(readThemePreference()).toBe("system");
  });

  it.each(["light", "dark"] as const)(
    "applies and persists the %s theme",
    (preference) => {
      applyThemePreference(preference);
      expect(document.documentElement.dataset.theme).toBe(preference);
      expect(window.localStorage.getItem("foodlab.theme.v1")).toBe(preference);
    },
  );

  it("removes the override when following the system", () => {
    applyThemePreference("dark");
    applyThemePreference("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("foodlab.theme.v1")).toBeNull();
  });

  it("synchronizes a preference written by another window", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeThemePreference(onChange);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "foodlab.theme.v1",
      newValue: "dark",
    }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(onChange).toHaveBeenCalledWith("dark");
    unsubscribe();
  });
});
