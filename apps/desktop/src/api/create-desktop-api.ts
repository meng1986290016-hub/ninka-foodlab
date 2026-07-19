import type { DesktopApi } from "./desktop-api";
import { BrowserDemoApi } from "./browser-demo-api";
import { TauriDesktopApi } from "./tauri-desktop-api";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function createDesktopApi(): DesktopApi {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserDemoApi()
    : new TauriDesktopApi();
}
