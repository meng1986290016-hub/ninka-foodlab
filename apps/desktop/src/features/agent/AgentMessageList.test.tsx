import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../api/agent-types";
import { AgentMessageList } from "./AgentMessageList";

const userMessage: AgentMessage = {
  id: "message-1",
  conversationId: "conversation-1",
  runId: "run-1",
  role: "user",
  content: "帮我检查这份配方",
  attachmentIds: [],
  status: "complete",
  createdAt: "2026-08-09T12:00:00.000Z",
};

describe("AgentMessageList thinking status", () => {
  it("renders the compact working orb after the latest user message", () => {
    const { container } = render(
      <AgentMessageList
        loading={false}
        messages={[userMessage]}
        streamingText=""
        thinkingStatus="正在思考"
      />,
    );

    const status = screen.getByRole("status");
    const message = screen.getByText("帮我检查这份配方").closest("article");
    const orb = container.querySelector("canvas");

    if (!message) throw new Error("找不到用户消息节点");

    expect(status.textContent).toBe("正在思考");
    expect(orb?.getAttribute("data-orb-state")).toBe("working");
    expect(orb?.getAttribute("data-orb-size")).toBe("20");
    expect(orb?.getAttribute("data-orb-theme")).toBe("light");
    expect(
      message.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("replaces the thinking row with the streaming response", () => {
    const { rerender } = render(
      <AgentMessageList
        loading={false}
        messages={[userMessage]}
        streamingText=""
        thinkingStatus="正在搜索原料"
      />,
    );

    rerender(
      <AgentMessageList
        loading={false}
        messages={[userMessage]}
        streamingText="正在整理结果"
        thinkingStatus={null}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("正在整理结果")).toBeTruthy();
  });
});
