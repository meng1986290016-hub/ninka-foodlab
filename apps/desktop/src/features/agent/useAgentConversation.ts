import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentEventSource } from "../../api/agent-event-source";
import type {
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentPreferences,
  AgentProviderConfig,
  AgentRun,
} from "../../api/agent-types";
import type { DesktopApi } from "../../api/desktop-api";
import type { ImportFileReference } from "../../api/import-types";

const toolStatus: Record<string, string> = {
  read_task_attachments: "正在读取附件",
  search_material_groups: "正在搜索原料",
  search_supplier_variants: "正在比对供应商版本",
  search_suppliers: "正在搜索供应商",
  search_categories: "正在匹配分类",
  list_nutrient_definitions: "正在读取营养成分项目",
  create_ingredient_import_draft: "正在创建原料草稿",
  update_ingredient_import_draft: "正在更新原料草稿",
  merge_ingredient_import_drafts: "正在合并原料草稿",
  split_ingredient_import_draft: "正在拆分原料草稿",
  discard_ingredient_import_draft: "正在移除原料草稿",
  validate_ingredient_import_draft: "正在检查原料草稿",
  request_open_ingredient_review: "正在准备人工复核",
};

interface InitialAgentState {
  conversation: AgentConversation;
  messages: AgentMessage[];
  preferences: AgentPreferences;
  providers: AgentProviderConfig[];
}

export function useAgentConversation(
  api: DesktopApi,
  events: AgentEventSource,
) {
  const [conversation, setConversation] = useState<AgentConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [preferences, setPreferences] = useState<AgentPreferences | null>(null);
  const [providers, setProviders] = useState<AgentProviderConfig[]>([]);
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const conversationRef = useRef<AgentConversation | null>(null);
  const initializationRef = useRef<Promise<InitialAgentState> | null>(null);

  const refreshMessages = useCallback(
    async (conversationId?: string) => {
      const id = conversationId ?? conversationRef.current?.id;
      if (!id) return [];
      const next = await api.listAgentMessages(id);
      setMessages(next);
      return next;
    },
    [api],
  );

  const refreshConfiguration = useCallback(async () => {
    const [nextPreferences, nextProviders] = await Promise.all([
      api.getAgentPreferences(),
      api.listAgentProviderConfigs(),
    ]);
    setPreferences(nextPreferences);
    setProviders(nextProviders);
  }, [api]);

  useEffect(() => {
    let active = true;
    if (!initializationRef.current) {
      initializationRef.current = (async () => {
        const [nextPreferences, nextProviders, conversations] =
          await Promise.all([
            api.getAgentPreferences(),
            api.listAgentProviderConfigs(),
            api.listAgentConversations(),
          ]);
        const nextConversation =
          conversations[0] ?? (await api.createAgentConversation("食品研发对话"));
        return {
          conversation: nextConversation,
          messages: await api.listAgentMessages(nextConversation.id),
          preferences: nextPreferences,
          providers: nextProviders,
        };
      })();
    }
    void initializationRef.current
      .then((initial) => {
        if (!active) return;
        conversationRef.current = initial.conversation;
        setConversation(initial.conversation);
        setMessages(initial.messages);
        setPreferences(initial.preferences);
        setProviders(initial.providers);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error ? reason.message : "Agent 对话读取失败",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const receive = (event: AgentEvent) => {
      if (!active) return;
      if (event.type === "message_delta") {
        setStreamingText((current) => current + event.text);
      } else if (event.type === "tool_started") {
        setTaskStatus(toolStatus[event.toolName] ?? "正在执行食品研发任务");
      } else if (event.type === "tool_completed") {
        setTaskStatus(event.summary || "已完成一步处理");
      } else if (event.type === "drafts_changed") {
        void api.listAgentImportDrafts(event.runId).then((drafts) => {
          if (active) setTaskStatus(`已生成 ${drafts.length} 张待复核草稿`);
        });
      } else if (event.type === "run_completed") {
        setStreamingText("");
        setTaskStatus("本次任务已完成");
        setError("");
        void api.getAgentRun(event.runId).then((run) => {
          if (!active) return;
          setCurrentRun(null);
          setLastRun(run);
        });
        void refreshMessages();
      } else if (event.type === "run_failed") {
        setStreamingText("");
        setTaskStatus(
          event.code === "cancelled" ? "本次任务已停止" : "本次任务未完成",
        );
        setError(event.message);
        void api.getAgentRun(event.runId).then((run) => {
          if (!active) return;
          setCurrentRun(null);
          setLastRun(run);
        });
        void refreshMessages();
      }
    };
    void events.subscribe(receive).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api, events, refreshMessages]);

  const send = useCallback(
    async (
      content: string,
      files: ImportFileReference[],
      retryRunId?: string,
    ) => {
      const activeConversation = conversationRef.current;
      if (!activeConversation) return null;
      setError("");
      setTaskStatus(files.length > 0 ? "正在读取原料资料" : "正在思考");
      setStreamingText("");
      try {
        const run = await api.startAgentRun({
          conversationId: activeConversation.id,
          content,
          files,
          ...(retryRunId ? { retryRunId } : {}),
        });
        await refreshMessages(activeConversation.id);
        if (run.status === "queued" || run.status === "running") {
          setCurrentRun(run);
        } else {
          setCurrentRun(null);
          setLastRun(run);
          setTaskStatus(
            run.status === "completed" ? "本次任务已完成" : "本次任务未完成",
          );
        }
        return run;
      } catch (reason) {
        setTaskStatus("");
        setError(reason instanceof Error ? reason.message : "Agent 任务启动失败");
        return null;
      }
    },
    [api, refreshMessages],
  );

  const cancel = useCallback(async () => {
    if (!currentRun) return;
    try {
      const run = await api.cancelAgentRun(currentRun.id);
      setCurrentRun(null);
      setLastRun(run);
      setTaskStatus("本次任务已停止");
      await refreshMessages();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务停止失败");
    }
  }, [api, currentRun, refreshMessages]);

  const retry = useCallback(async () => {
    if (
      !lastRun ||
      (lastRun.status !== "failed" && lastRun.status !== "cancelled")
    ) {
      return null;
    }
    const failedUser = messages.find(
      (message) =>
        message.runId === lastRun.id && message.role === "user",
    );
    if (!failedUser) {
      setError("找不到上一次任务内容");
      return null;
    }
    return send(failedUser.content, [], lastRun.id);
  }, [lastRun, messages, send]);

  const clearConversation = useCallback(async () => {
    const activeConversation = conversationRef.current;
    if (!activeConversation || currentRun) return;
    await api.deleteAgentConversation(activeConversation.id);
    const next = await api.createAgentConversation("食品研发对话");
    conversationRef.current = next;
    setConversation(next);
    setMessages([]);
    setCurrentRun(null);
    setLastRun(null);
    setStreamingText("");
    setTaskStatus("");
    setError("");
  }, [api, currentRun]);

  return {
    activeProvider: providers.find((provider) => provider.enabled) ?? null,
    cancel,
    clearConversation,
    conversation,
    currentRun,
    error,
    lastRun,
    loading,
    messages,
    preferences,
    refreshConfiguration,
    retry,
    send,
    streamingText,
    taskStatus,
  };
}
