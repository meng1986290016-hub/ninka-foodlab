import { useEffect, useRef } from "react";

import type { AgentMessage } from "../../api/agent-types";

interface AgentMessageListProps {
  messages: AgentMessage[];
  streamingText: string;
  loading: boolean;
}

export function AgentMessageList({
  messages,
  streamingText,
  loading,
}: AgentMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages.filter((message) => message.role !== "tool");

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, streamingText]);

  return (
    <div
      aria-label="食品研发 Agent 对话"
      aria-live="polite"
      className="agent-message-list"
    >
      {loading ? (
        <p className="agent-empty-state">正在读取本地对话…</p>
      ) : visibleMessages.length === 0 && !streamingText ? (
        <div className="agent-welcome">
          <span>食品研发 Agent</span>
          <h3>把原料资料交给我整理</h3>
          <p>
            可一次上传多份标签图片、规格书或表格。我会分别建立草稿，最后由你人工复核并保存。
          </p>
        </div>
      ) : null}

      {visibleMessages.map((message) => (
        <article
          className={`agent-message agent-message--${message.role}`}
          key={message.id}
        >
          <span className="agent-message__role">
            {message.role === "user" ? "你" : "食品研发 Agent"}
          </span>
          <p>{message.content || (message.status === "failed" ? "任务未完成" : "")}</p>
          {message.attachmentIds.length > 0 ? (
            <small>包含 {message.attachmentIds.length} 份原料资料</small>
          ) : null}
        </article>
      ))}

      {streamingText ? (
        <article className="agent-message agent-message--assistant is-streaming">
          <span className="agent-message__role">食品研发 Agent</span>
          <p>{streamingText}</p>
        </article>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
