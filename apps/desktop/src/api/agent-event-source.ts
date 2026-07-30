import { listen as tauriListen } from "@tauri-apps/api/event";

import type { AgentEvent } from "./agent-types";

export type AgentEventListener = (event: AgentEvent) => void;
export type Unsubscribe = () => void;

export interface AgentEventSource {
  subscribe(listener: AgentEventListener): Promise<Unsubscribe>;
}

type Listen = typeof tauriListen;

export class TauriAgentEventSource implements AgentEventSource {
  constructor(private readonly listen: Listen = tauriListen) {}

  async subscribe(listener: AgentEventListener) {
    return this.listen<AgentEvent>("food-rd://agent-event", (event) => {
      listener(event.payload);
    });
  }
}

export class BrowserAgentEventSource implements AgentEventSource {
  private readonly listeners = new Set<AgentEventListener>();

  async subscribe(listener: AgentEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AgentEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

export function createAgentEventSource(): AgentEventSource {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserAgentEventSource()
    : new TauriAgentEventSource();
}
