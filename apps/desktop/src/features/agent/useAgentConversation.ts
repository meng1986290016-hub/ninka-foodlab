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
import type { AgentRecipeProposal } from "../../api/agent-recipe-types";
import type {
  ImportFileReference,
  IngredientImportDraft,
} from "../../api/import-types";

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
  diagnose_recipe: "正在诊断当前配方",
  review_recipe_development: "正在复盘研发记录",
  compare_supplier_variant: "正在计算替代原料影响",
};

interface InitialAgentState {
  conversation: AgentConversation;
  messages: AgentMessage[];
  preferences: AgentPreferences;
  providers: AgentProviderConfig[];
  lastRun: AgentRun | null;
  drafts: IngredientImportDraft[];
  proposals: AgentRecipeProposal[];
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
  const [starting, setStarting] = useState(false);
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [drafts, setDrafts] = useState<IngredientImportDraft[]>([]);
  const [proposals, setProposals] = useState<AgentRecipeProposal[]>([]);
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

  const refreshDrafts = useCallback(
    async (runId?: string) => {
      const id = runId ?? lastRun?.id;
      if (!id) {
        setDrafts([]);
        return [];
      }
      const next = await api.listAgentImportDrafts(id);
      setDrafts(next);
      return next;
    },
    [api, lastRun?.id],
  );

  const refreshProposals = useCallback(
    async (conversationId?: string) => {
      const id = conversationId ?? conversationRef.current?.id;
      if (!id) {
        setProposals([]);
        return [];
      }
      const next = await api.listAgentRecipeProposals(id);
      setProposals(next);
      return next;
    },
    [api],
  );

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
        const [messages, proposals] = await Promise.all([
          api.listAgentMessages(nextConversation.id),
          api.listAgentRecipeProposals(nextConversation.id),
        ]);
        const lastRunId = [...messages]
          .reverse()
          .find((message) => message.runId)?.runId;
        const lastRun = lastRunId ? await api.getAgentRun(lastRunId) : null;
        return {
          conversation: nextConversation,
          messages,
          preferences: nextPreferences,
          providers: nextProviders,
          lastRun,
          drafts: lastRun
            ? await api.listAgentImportDrafts(lastRun.id)
            : [],
          proposals,
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
        setLastRun(initial.lastRun);
        setDrafts(initial.drafts);
        setProposals(initial.proposals);
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
        setStarting(false);
        setStreamingText((current) => current + event.text);
      } else if (event.type === "tool_started") {
        setTaskStatus(toolStatus[event.toolName] ?? "正在执行食品研发任务");
      } else if (event.type === "tool_completed") {
        setTaskStatus(event.summary || "已完成一步处理");
      } else if (event.type === "drafts_changed") {
        void api.listAgentImportDrafts(event.runId).then((nextDrafts) => {
          if (!active) return;
          setDrafts(nextDrafts);
          setTaskStatus(`已生成 ${nextDrafts.length} 张待复核草稿`);
        });
      } else if (event.type === "recipe_proposals_changed") {
        void refreshProposals().then((next) => {
          if (!active) return;
          const pending = next.filter(
            (proposal) => proposal.status === "pending_review",
          ).length;
          setTaskStatus(`已生成 ${pending} 张待复核配方提案`);
        });
      } else if (event.type === "run_completed") {
        setStarting(false);
        setStreamingText("");
        setTaskStatus("本次任务已完成");
        setError("");
        void api.getAgentRun(event.runId).then((run) => {
          if (!active) return;
          setCurrentRun(null);
          setLastRun(run);
          void refreshDrafts(run.id);
        });
        void refreshMessages();
        void refreshProposals();
      } else if (event.type === "run_failed") {
        setStarting(false);
        setStreamingText("");
        setTaskStatus(
          event.code === "cancelled" ? "本次任务已停止" : "本次任务未完成",
        );
        setError(event.message);
        void api.getAgentRun(event.runId).then((run) => {
          if (!active) return;
          setCurrentRun(null);
          setLastRun(run);
          void refreshDrafts(run.id);
        });
        void refreshMessages();
        void refreshProposals();
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
  }, [api, events, refreshDrafts, refreshMessages, refreshProposals]);

  const send = useCallback(
    async (
      content: string,
      files: ImportFileReference[],
      options: {
        retryRunId?: string;
        continueRunId?: string;
        recipeContext?: {
          recipeId: string;
          recipeName: string;
          draftFingerprint: string;
        };
      } = {},
    ) => {
      const activeConversation = conversationRef.current;
      if (!activeConversation) return null;
      setStarting(true);
      setError("");
      setTaskStatus(files.length > 0 ? "正在读取原料资料" : "正在思考");
      setStreamingText("");
      try {
        const run = await api.startAgentRun({
          conversationId: activeConversation.id,
          content,
          files,
          ...(options.recipeContext
            ? { recipeContext: options.recipeContext }
            : {}),
          ...(options.retryRunId
            ? { retryRunId: options.retryRunId }
            : {}),
          ...(options.continueRunId
            ? { continueRunId: options.continueRunId }
            : {}),
        });
        await refreshMessages(activeConversation.id);
        setStarting(false);
        if (run.status === "queued" || run.status === "running") {
          setCurrentRun(run);
        } else {
          setCurrentRun(null);
          setLastRun(run);
          await refreshDrafts(run.id);
          await refreshProposals(activeConversation.id);
          setTaskStatus(
            run.status === "completed" ? "本次任务已完成" : "本次任务未完成",
          );
        }
        return run;
      } catch (reason) {
        setStarting(false);
        setTaskStatus("");
        setError(reason instanceof Error ? reason.message : "Agent 任务启动失败");
        return null;
      }
    },
    [api, refreshDrafts, refreshMessages, refreshProposals],
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
    return send(failedUser.content, [], { retryRunId: lastRun.id });
  }, [lastRun, messages, send]);

  const continueRun = useCallback(
    async (content: string) => {
      if (!lastRun || lastRun.status !== "completed") {
        setError("当前没有可继续调整的已完成任务");
        return null;
      }
      return send(content, [], { continueRunId: lastRun.id });
    },
    [lastRun, send],
  );

  const clearConversation = useCallback(async () => {
    const activeConversation = conversationRef.current;
    if (!activeConversation || currentRun) return;
    await api.deleteAgentConversation(activeConversation.id);
    const next = await api.createAgentConversation("食品研发对话");
    conversationRef.current = next;
    setConversation(next);
    setMessages([]);
    setStarting(false);
    setCurrentRun(null);
    setLastRun(null);
    setDrafts([]);
    setProposals([]);
    setStreamingText("");
    setTaskStatus("");
    setError("");
  }, [api, currentRun]);

  return {
    activeProvider: providers.find((provider) => provider.enabled) ?? null,
    cancel,
    clearConversation,
    continueRun,
    conversation,
    currentRun,
    drafts,
    error,
    lastRun,
    loading,
    messages,
    proposals,
    preferences,
    refreshConfiguration,
    refreshDrafts,
    refreshProposals,
    retry,
    send,
    starting,
    streamingText,
    taskStatus,
  };
}
