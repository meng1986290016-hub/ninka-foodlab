import { describe, expect, it, vi } from "vitest";

import {
  BrowserAgentEventSource,
  TauriAgentEventSource,
} from "./agent-event-source";

describe("AgentEventSource", () => {
  it("subscribes to the one desktop event name and forwards only its payload", async () => {
    const unlisten = vi.fn();
    const listen = vi.fn(async (_name, handler) => {
      handler({
        event: "food-rd://agent-event",
        id: 1,
        payload: { type: "run_completed", runId: "run-1" },
      });
      return unlisten;
    });
    const listener = vi.fn();
    const source = new TauriAgentEventSource(listen);

    const unsubscribe = await source.subscribe(listener);

    expect(listen).toHaveBeenCalledWith(
      "food-rd://agent-event",
      expect.any(Function),
    );
    expect(listener).toHaveBeenCalledWith({
      type: "run_completed",
      runId: "run-1",
    });
    unsubscribe();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("supports deterministic in-memory browser events and unsubscribe", async () => {
    const source = new BrowserAgentEventSource();
    const listener = vi.fn();
    const unsubscribe = await source.subscribe(listener);

    source.emit({ type: "run_completed", runId: "run-1" });
    unsubscribe();
    source.emit({ type: "run_completed", runId: "run-2" });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
