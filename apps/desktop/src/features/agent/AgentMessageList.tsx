import { useEffect, useRef } from "react";

import type { AgentMessage } from "../../api/agent-types";
import { Icon, type IconName } from "../../components/Icon";

interface QuickTask {
  description: string;
  icon: IconName;
  label: string;
  prompt: string;
}

const quickTasks: QuickTask[] = [
  {
    label: "设计新产品",
    description: "按营养、成本与原料限制生成配方提案",
    icon: "recipe-workbench",
    prompt:
      "我想设计一款新产品。请先询问产品类型、营养要求、成本目标和忌用原料，再从原料库中选择具体供应商原料并生成待复核配方提案。",
  },
  {
    label: "逆向产品标签",
    description: "根据配料表与营养标签估算配方",
    icon: "search",
    prompt:
      "请根据我接下来上传的同一款产品配料表和营养标签，逆向估算一套可编辑配方，并标出可信度、关键假设和无法判断项。",
  },
  {
    label: "整理原料资料",
    description: "从标签、规格书或表格建立原料草稿",
    icon: "ingredient",
    prompt:
      "请分别读取我接下来上传的原料标签、规格书或表格，提取原料、供应商、价格和营养信息，分别建立待人工复核的原料草稿。",
  },
];

interface AgentMessageListProps {
  messages: AgentMessage[];
  streamingText: string;
  loading: boolean;
  onQuickStart?: ((prompt: string) => void) | undefined;
}

export function AgentMessageList({
  messages,
  streamingText,
  loading,
  onQuickStart,
}: AgentMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<HTMLElement | null>(null);
  const visibleMessages = messages.filter((message) => message.role !== "tool");

  useEffect(() => {
    if (streamingText) {
      endRef.current?.scrollIntoView?.({ block: "end" });
    } else {
      latestMessageRef.current?.scrollIntoView?.({ block: "start" });
    }
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
          <span>从一个研发任务开始</span>
          <h3>你想先做什么？</h3>
          <p>
            Agent 可以调用原料库和确定性试算能力，结果会先形成待复核草稿。
          </p>
          {onQuickStart ? (
            <div aria-label="常用研发任务" className="agent-quick-tasks">
              {quickTasks.map((task) => (
                <button
                  key={task.label}
                  onClick={() => onQuickStart(task.prompt)}
                  type="button"
                >
                  <span className="agent-quick-task__icon">
                    <Icon name={task.icon} size={17} />
                  </span>
                  <span>
                    <strong>{task.label}</strong>
                    <small>{task.description}</small>
                  </span>
                  <span aria-hidden="true" className="agent-quick-task__arrow">
                    →
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <small className="agent-welcome__guardrail">
            人工复核后才会写入原料库或创建配方草稿
          </small>
        </div>
      ) : null}

      {visibleMessages.map((message, index) => (
        <article
          className={`agent-message agent-message--${message.role}`}
          key={message.id}
          ref={index === visibleMessages.length - 1 ? latestMessageRef : null}
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
