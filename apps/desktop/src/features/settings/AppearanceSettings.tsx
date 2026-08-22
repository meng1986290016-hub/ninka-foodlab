import { useEffect, useState } from "react";

import {
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "../../theme";

export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  useEffect(() => subscribeThemePreference(setTheme), []);

  return (
    <div className="settings-card appearance-settings">
      <label className="settings-field settings-field--wide" htmlFor="appearance-theme">
        <span id="appearance-theme-label">界面外观</span>
        <select
          aria-labelledby="appearance-theme-label"
          id="appearance-theme"
          onChange={(event) => {
            const next = event.target.value as ThemePreference;
            setTheme(next);
            applyThemePreference(next);
          }}
          value={theme}
        >
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
        <small>主窗口与独立 Agent 窗口使用同一外观设置。</small>
      </label>
    </div>
  );
}
