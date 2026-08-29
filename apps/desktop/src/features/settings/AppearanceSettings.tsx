import { useEffect, useState } from "react";

import {
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "../../theme";
import { Icon } from "../../components/Icon";

export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  useEffect(() => subscribeThemePreference(setTheme), []);

  return (
    <label className="settings-preference-row appearance-settings" htmlFor="appearance-theme">
      <Icon className="settings-preference-row__icon" name="settings" size={22} />
      <span className="settings-preference-row__copy">
        <strong id="appearance-theme-label">界面外观</strong>
        <small>主窗口与独立 Agent 窗口使用同一外观设置。</small>
      </span>
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
    </label>
  );
}
