import { useEffect, useState } from "react";

import type { AgentEventSource } from "../../api/agent-event-source";
import type { DesktopApi } from "../../api/desktop-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { ImportFileReference } from "../../api/import-types";
import { Icon } from "../../components/Icon";
import { AgentComposer } from "./AgentComposer";
import { AgentMessageList } from "./AgentMessageList";
import { AgentTaskStatus } from "./AgentTaskStatus";
import { useAgentConversation } from "./useAgentConversation";

interface AgentPanelProps {
  api: DesktopApi;
  events: AgentEventSource;
  filePicker: ImportFilePicker;
  open: boolean;
  onClose(): void;
  onConfigure(section: "general" | "models"): void;
}

interface PendingSend {
  text: string;
  files: ImportFileReference[];
}

function isLocalProvider(kind: string) {
  return kind === "ollama" || kind === "codex_cli" || kind === "claude_code_cli";
}

export function AgentPanel({
  api,
  events,
  filePicker,
  open,
  onClose,
  onConfigure,
}: AgentPanelProps) {
  const workflow = useAgentConversation(api, events);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ImportFileReference[]>([]);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [approvedRemoteProviders, setApprovedRemoteProviders] = useState(
    () => new Set<string>(),
  );

  useEffect(() => {
    if (open) void workflow.refreshConfiguration();
  }, [open, workflow.refreshConfiguration]);

  async function sendNow(nextText: string, nextFiles: ImportFileReference[]) {
    const run = await workflow.send(nextText, nextFiles);
    if (run) {
      setText("");
      setFiles([]);
      setPending(null);
    }
  }

  function requestSend() {
    if (!workflow.activeProvider || !workflow.preferences?.enabled) return;
    if (
      files.length > 0 &&
      !isLocalProvider(workflow.activeProvider.kind) &&
      !approvedRemoteProviders.has(workflow.activeProvider.id)
    ) {
      setPending({ text, files: [...files] });
      return;
    }
    void sendNow(text, files);
  }

  function confirmRemoteSend() {
    if (!pending || !workflow.activeProvider) return;
    setApprovedRemoteProviders((current) => {
      const next = new Set(current);
      next.add(workflow.activeProvider!.id);
      return next;
    });
    void sendNow(pending.text, pending.files);
  }

  async function clearConversation() {
    if (
      window.confirm(
        "清空当前对话？原料库、已保存原料和原始资料不会被删除。",
      )
    ) {
      await workflow.clearConversation();
    }
  }

  const needsConfiguration =
    workflow.preferences !== null &&
    (!workflow.preferences.enabled || !workflow.activeProvider);

  return (
    <aside
      aria-label="食品研发 Agent"
      aria-hidden={!open}
      className={open ? "agent-panel is-open" : "agent-panel"}
    >
      <header className="agent-panel__header">
        <div>
          <span className="agent-panel__eyebrow">食品研发助手</span>
          <h2>Agent</h2>
        </div>
        <div className="agent-panel__header-actions">
          <button
            aria-label="清空 Agent 对话"
            disabled={Boolean(workflow.currentRun)}
            onClick={() => void clearConversation()}
            title="清空当前对话"
            type="button"
          >
            <Icon name="trash" size={17} />
          </button>
          <button
            aria-label="关闭食品研发 Agent"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
        </div>
      </header>

      {needsConfiguration ? (
        <div className="agent-configuration-state">
          <span>需要完成一步设置</span>
          <h3>
            {workflow.preferences?.enabled
              ? "尚未启用聊天模型"
              : "食品研发 Agent 已关闭"}
          </h3>
          <p>原料库和表格导入仍可正常使用。</p>
          <button
            onClick={() =>
              onConfigure(workflow.preferences?.enabled ? "models" : "general")
            }
            type="button"
          >
            配置大模型
          </button>
        </div>
      ) : (
        <>
          <AgentMessageList
            loading={workflow.loading}
            messages={workflow.messages}
            streamingText={workflow.streamingText}
          />
          <AgentTaskStatus
            currentRun={workflow.currentRun}
            error={workflow.error}
            lastRun={workflow.lastRun}
            onRetry={() => void workflow.retry()}
            status={workflow.taskStatus}
          />

          {pending && workflow.activeProvider ? (
            <div className="agent-privacy-confirmation">
              <strong>发送前确认</strong>
              <p>
                这些资料将发送给当前配置的模型服务：
                {workflow.activeProvider.displayName}
              </p>
              <small>只发送本次选择的文件和完成任务所需的字段。</small>
              <div>
                <button onClick={() => setPending(null)} type="button">
                  取消
                </button>
                <button onClick={confirmRemoteSend} type="button">
                  确认发送
                </button>
              </div>
            </div>
          ) : null}

          {files.length > 0 &&
          workflow.activeProvider &&
          isLocalProvider(workflow.activeProvider.kind) ? (
            <p className="agent-local-notice">资料仅交给本机配置处理。</p>
          ) : null}

          <AgentComposer
            disabled={workflow.loading || !open}
            filePicker={filePicker}
            files={files}
            onFilesChange={setFiles}
            onSend={requestSend}
            onStop={() => void workflow.cancel()}
            onTextChange={setText}
            running={Boolean(workflow.currentRun)}
            text={text}
          />
        </>
      )}
    </aside>
  );
}
