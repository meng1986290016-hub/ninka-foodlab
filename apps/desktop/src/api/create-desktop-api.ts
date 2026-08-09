import type { DesktopApi } from "./desktop-api";
import { BrowserDemoApi } from "./browser-demo-api";
import { TauriDesktopApi } from "./tauri-desktop-api";
import {
  BrowserAgentEventSource,
  type AgentEventSource,
} from "./agent-event-source";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function createDesktopApi(agentEvents?: AgentEventSource): DesktopApi {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserDemoApi(
        agentEvents instanceof BrowserAgentEventSource
          ? { agentEvents, agentResponseDelayMs: 900 }
          : {},
      )
    : new TauriDesktopApi();
}
