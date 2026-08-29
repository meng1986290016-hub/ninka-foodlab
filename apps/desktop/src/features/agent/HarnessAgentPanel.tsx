import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  AgentConversationView,
  AgentEngine,
  AgentModelDirectory,
  AgentModelRoute,
  AgentQueuedMessage,
  AgentRecipeMatch,
  AgentRecipeReference,
  ArtifactManifest,
  HarnessHealth,
  HarnessTask,
  HarnessTaskListScope,
  HarnessTaskEvent,
  HarnessTurn,
} from "../../api/agent-harness-types";
import type { AgentRecipeProposal } from "../../api/agent-recipe-types";
import type {
  ImportFileReference,
  IngredientImportDraft,
} from "../../api/import-types";
import type { RecipeSummary } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import { ImportedVariantReview } from "../ingredients/ImportedVariantReview";
import type { AgentPanelProps } from "./AgentPanel";
import { AgentRecipeProposalReview } from "./AgentRecipeProposalReview";

const ACTIVE_CONVERSATION_KEY = "foodlab.agent.active-conversation.v1";
const CONVERSATION_DRAFTS_KEY = "foodlab.agent.conversation-drafts.v1";

export function HarnessAgentPanel({
  api,
  filePicker,
  open,
  onClose,
  onConfigure,
  onOpenImported,
  onOpenRecipeDraft,
  recipeContext = null,
}: AgentPanelProps) {
  const [health, setHealth] = useState<HarnessHealth | null>(null);
  const [modelDirectory, setModelDirectory] = useState<AgentModelDirectory | null>(null);
  const [tasks, setTasks] = useState<HarnessTask[]>([]);
  const [taskScope, setTaskScope] = useState<HarnessTaskListScope>("active");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() =>
    window.localStorage.getItem(ACTIVE_CONVERSATION_KEY),
  );
  const [view, setView] = useState<AgentConversationView | null>(null);
  const [turns, setTurns] = useState<HarnessTurn[]>([]);
  const [allTurns, setAllTurns] = useState<HarnessTurn[]>([]);
  const [events, setEvents] = useState<HarnessTaskEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactManifest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>(readConversationDrafts);
  const [pendingFiles, setPendingFiles] = useState<ImportFileReference[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [references, setReferences] = useState<AgentRecipeReference[]>([]);
  const [recipeChoices, setRecipeChoices] = useState<AgentRecipeMatch[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [openingPopout, setOpeningPopout] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [queueEditDraft, setQueueEditDraft] = useState("");
  const [editingTurn, setEditingTurn] = useState<HarnessTurn | null>(null);
  const [reviewDraft, setReviewDraft] = useState<IngredientImportDraft | null>(null);
  const [reviewProposal, setReviewProposal] = useState<AgentRecipeProposal | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactManifest | null>(null);
  const [turnEditDraft, setTurnEditDraft] = useState("");
  const [following, setFollowing] = useState(true);
  const [hasNewContent, setHasNewContent] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageLogRef = useRef<HTMLDivElement | null>(null);
  const queueDispatchingRef = useRef(false);

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;
  const archived = activeTask?.archivedAt != null;
  const running = turns.some((turn) => turn.status === "running");
  const ready = health?.status === "ready";
  const draftKey = activeTaskId ?? "__new__";
  const draft = drafts[draftKey] ?? "";
  const queuedMessages = view?.queuedMessages ?? [];
  const queuePaused = view?.queuePaused ?? false;
  const filteredTasks = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("zh-CN");
    return needle
      ? tasks.filter((task) => task.title.toLocaleLowerCase("zh-CN").includes(needle))
      : tasks;
  }, [search, tasks]);
  const mentionTerm = useMemo(() => trailingMention(draft), [draft]);
  const mentionRecipes = useMemo(() => {
    if (mentionTerm === null) return [];
    const needle = normalizeRecipeText(mentionTerm);
    return recipes
      .filter((summary) => summary.recipe.archivedAt === null)
      .filter((summary) => {
        if (!needle) return true;
        return normalizeRecipeText(`${summary.recipe.name} ${summary.recipe.code ?? ""}`).includes(needle);
      })
      .slice(0, 8);
  }, [mentionTerm, recipes]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionTerm]);

  const refreshTasks = useCallback(async () => {
    const next = await api.listHarnessTasks(taskScope);
    setTasks(next);
    setActiveTaskId((current) => {
      if (current && next.some((task) => task.id === current)) return current;
      return next[0]?.id ?? null;
    });
  }, [api, taskScope]);

  const detect = useCallback(async () => {
    let next = await api.getHarnessHealth();
    if (next.status === "idle") {
      setHealth({ status: "starting", lastError: null, reinstallRequired: false });
      next = await api.startHarness();
    }
    setHealth(next);
    if (next.status === "ready") setModelDirectory(await api.getAgentModelDirectory());
    return next;
  }, [api]);

  const refreshActive = useCallback(async (taskId: string, synchronize = false) => {
    if (synchronize) await api.syncHarnessTask(taskId);
    const [nextView, nextAllTurns, nextEvents, nextArtifacts] = await Promise.all([
      api.getAgentConversationView(taskId),
      api.listHarnessTurns(taskId),
      api.listHarnessEvents(taskId, -1),
      api.listHarnessArtifacts(taskId),
    ]);
    setView(nextView);
    setTurns(nextView.activeTurns);
    setAllTurns(nextAllTurns);
    setEvents(nextEvents);
    setArtifacts(nextArtifacts);
  }, [api]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    void refreshTasks().catch((cause: unknown) => {
      if (active) setError(errorMessage(cause, "会话记录读取失败"));
    });
    return () => { active = false; };
  }, [open, refreshTasks]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void api.listRecipes().then((next) => { if (active) setRecipes(next); }).catch(() => undefined);
    void detect().catch((cause: unknown) => {
      if (active) {
        const message = errorMessage(cause, "Agent 服务读取失败");
        setHealth({ status: "failed", lastError: message, reinstallRequired: false });
      }
    });
    return () => { active = false; };
  }, [api, detect, open]);

  useEffect(() => {
    if (taskScope === "active") {
      if (activeTaskId) window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, activeTaskId);
      else window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
    if (!activeTaskId) {
      setTurns([]);
      setAllTurns([]);
      setView(null);
      setEvents([]);
      setArtifacts([]);
      setReferences([]);
      return;
    }
    let active = true;
    void refreshActive(activeTaskId).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause, "会话内容读取失败"));
    });
    return () => { active = false; };
  }, [activeTaskId, refreshActive, taskScope]);

  useEffect(() => {
    if (!activeTask) return;
    setReferences(activeTask.activeRecipeId && activeTask.activeRecipeName
      ? [{ recipeId: activeTask.activeRecipeId, recipeName: activeTask.activeRecipeName }]
      : []);
  }, [activeTask?.activeRecipeId, activeTask?.activeRecipeName, activeTask?.id]);

  useEffect(() => {
    window.localStorage.setItem(CONVERSATION_DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    if (!open || !ready || !activeTask || archived || !running) return;
    let stopped = false;
    let syncing = false;
    const poll = async () => {
      if (stopped || syncing) return;
      syncing = true;
      try {
        await refreshActive(activeTask.id, true);
        await refreshTasks();
      } catch (cause) {
        if (!stopped) setError(errorMessage(cause, "回答进度同步失败"));
      } finally {
        syncing = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeTask, archived, open, ready, refreshActive, refreshTasks, running]);

  useEffect(() => {
    if (following && typeof messageEndRef.current?.scrollIntoView === "function") {
      messageEndRef.current.scrollIntoView({ block: "end" });
      setHasNewContent(false);
    } else if (turns.length) {
      setHasNewContent(true);
    }
  }, [artifacts, following, turns]);

  useEffect(() => {
    if (!activeTask || archived || running || queuePaused || !queuedMessages.some((message) => message.state === "queued") || queueDispatchingRef.current || !ready) return;
    queueDispatchingRef.current = true;
    void api.resumeAgentQueue(activeTask.id)
      .then((next) => {
        setView(next);
        setTurns(next.activeTurns);
        return refreshTasks();
      })
      .catch((cause: unknown) => setError(errorMessage(cause, "排队消息启动失败")))
      .finally(() => { queueDispatchingRef.current = false; });
  }, [activeTask, api, archived, queuePaused, queuedMessages, ready, refreshTasks, running]);

  async function startRuntime() {
    setBusy(true);
    setError("");
    setHealth({ status: "starting", lastError: null, reinstallRequired: false });
    try {
      const next = await api.startHarness();
      setHealth(next);
      if (next.status === "ready") setModelDirectory(await api.getAgentModelDirectory());
    } catch (cause) {
      const message = errorMessage(cause, "Agent 服务启动失败");
      setHealth({ status: "failed", lastError: message, reinstallRequired: false });
    } finally {
      setBusy(false);
    }
  }

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [draftKey]: value }));
  }

  async function send(mode: "queue" | "steer" = "queue") {
    const content = draft.trim();
    if (!content || busy || archived) return;
    if (!ready || !modelDirectory?.currentUsable) {
      onConfigure("models");
      return;
    }
    const selectedModel = findSelectedModel(modelDirectory);
    if (
      pendingFiles.some((file) => isImageFile(file.value))
      && selectedModel?.capabilityStatus !== "unknown"
      && !selectedModel?.inputModalities?.includes("image")
    ) {
      setError("当前模型仅支持文本，不能读取图片。请在上方切换到标注为“支持图片”的模型后重试。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let nextReferences = references;
      if (!nextReferences.length) {
        const resolved = await api.resolveAgentRecipeReferences(content);
        if (resolved.kind === "ambiguous") {
          setRecipeChoices(resolved.matches);
          return;
        }
        if (resolved.kind === "unique") {
          nextReferences = resolved.matches.map(({ recipeId, recipeName }) => ({ recipeId, recipeName }));
          setReferences(nextReferences);
        } else if (mentionTerm !== null) {
          setError("没有找到这个配方，请从 @ 配方列表中选择。");
          return;
        }
      }
      if (!activeTask && recipeContext && !nextReferences.length) {
        await recipeContext.saveDraftNow();
        nextReferences = [{ recipeId: recipeContext.recipe.id, recipeName: recipeContext.recipe.name }];
        setReferences(nextReferences);
      }
      let task = activeTask;
      if (!task) {
        task = await api.createHarnessTask({
          title: conversationTitle(content, nextReferences[0]?.recipeName),
          content,
          ...(nextReferences[0] ? { activeRecipeId: nextReferences[0].recipeId } : {}),
          ...(pendingFiles.length ? { files: pendingFiles } : {}),
        });
        setActiveTaskId(task.id);
      }
      const nextView = await api.submitAgentMessage({
        conversationId: task.id,
        content,
        references: nextReferences,
        mode,
      });
      setView(nextView);
      setTurns(nextView.activeTurns);
      setDraft("");
      setRecipeChoices([]);
      setPendingFiles([]);
      await Promise.all([refreshActive(task.id, true), refreshTasks()]);
    } catch (cause) {
      setError(errorMessage(cause, "消息发送失败"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!activeTask) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.stopAgentConversation(activeTask.id);
      setView(next);
      setTurns(next.activeTurns);
      await Promise.all([refreshActive(activeTask.id), refreshTasks()]);
    } catch (cause) {
      setError(errorMessage(cause, "停止回答失败"));
    } finally {
      setBusy(false);
    }
  }

  async function popOut() {
    if (openingPopout) return;
    setOpeningPopout(true);
    setError("");
    try {
      await openAgentWindow();
      onClose();
    } catch {
      setError("无法打开 Agent 独立窗口，请重试");
    } finally {
      setOpeningPopout(false);
    }
  }

  async function chooseModel(value: string) {
    const route = decodeRoute(value);
    if (!route || running) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.selectAgentDefaultModel(route);
      setModelDirectory((current) => current ? { ...current, current: result.selected, currentUsable: true } : current);
    } catch (cause) {
      setError(errorMessage(cause, "模型切换失败"));
    } finally {
      setBusy(false);
    }
  }

  async function pickFiles() {
    if (activeTask) {
      setError("附件需在新会话首轮选择；当前会话不会读取其他任务的文件。");
      return;
    }
    const files = await filePicker.pickSources();
    if (files.length) setPendingFiles(files);
  }

  async function openArtifact(artifact: ArtifactManifest) {
    setError("");
    const domainId = artifactDomainId(artifact);
    try {
      if (artifact.status === "stale") {
        throw new Error(
          artifact.kind === "recipe_proposal"
            ? "未生成有效配方提案，该成果已过期"
            : "该成果已过期",
        );
      }
      if (artifact.kind === "ingredient_import_draft") {
        if (!domainId) throw new Error("该成果没有关联到真实原料草稿");
        const draft = await api.getIngredientImportDraft(domainId);
        if (draft.status === "imported") onOpenImported(draft);
        else setReviewDraft(draft);
        return;
      }
      if (artifact.kind === "recipe_proposal") {
        if (!domainId) throw new Error("该成果没有关联到真实配方提案");
        setReviewProposal(await api.getAgentRecipeProposal(domainId));
        return;
      }
      setArtifactPreview(artifact);
    } catch (cause) {
      setError(`关联数据已不存在或无法读取：${errorMessage(cause, "请重新生成该成果")}`);
    }
  }

  function beginRename(task: HarnessTask) {
    setRenamingTaskId(task.id);
    setRenameDraft(task.title);
    setError("");
  }

  function cancelRename() {
    setRenamingTaskId(null);
    setRenameDraft("");
  }

  async function commitRename(task: HarnessTask) {
    const title = renameDraft.trim();
    if (!title) {
      setError("会话名称不能为空");
      return;
    }
    if (title === task.title) {
      cancelRename();
      return;
    }
    setRenameSaving(true);
    setError("");
    try {
      const updated = await api.renameHarnessTask(task.id, title);
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      cancelRename();
    } catch (cause) {
      setError(errorMessage(cause, "会话重命名失败"));
    } finally {
      setRenameSaving(false);
    }
  }

  async function archiveTask(task: HarnessTask) {
    setBusy(true);
    setError("");
    try {
      await api.archiveHarnessTask(task.id);
      await refreshTasks();
    } catch (cause) {
      setError(errorMessage(cause, "会话归档失败"));
    } finally {
      setBusy(false);
    }
  }

  async function restoreTask(task: HarnessTask) {
    setBusy(true);
    setError("");
    try {
      const restored = await api.restoreHarnessTask(task.id);
      const activeTasks = await api.listHarnessTasks("active");
      setTaskScope("active");
      setTasks(activeTasks);
      setActiveTaskId(restored.id);
    } catch (cause) {
      setError(errorMessage(cause, "会话恢复失败"));
    } finally {
      setBusy(false);
    }
  }

  function newConversation() {
    setTaskScope("active");
    setActiveTaskId(null);
    setPendingFiles([]);
    setReferences(recipeContext ? [{ recipeId: recipeContext.recipe.id, recipeName: recipeContext.recipe.name }] : []);
    cancelRename();
    setError("");
  }

  function chooseTaskScope(scope: HarnessTaskListScope) {
    if (scope === taskScope) return;
    setTaskScope(scope);
    setTasks([]);
    setActiveTaskId(null);
    setSearch("");
    cancelRename();
    setError("");
  }

  function chooseMention(summary: RecipeSummary) {
    setDraft(replaceTrailingMention(draft, `@${summary.recipe.name} `));
    setReferences([{ recipeId: summary.recipe.id, recipeName: summary.recipe.name }]);
  }

  async function removeRecipeReference() {
    setReferences([]);
    if (!activeTask) return;
    try {
      const next = await api.bindAgentRecipe(activeTask.id, null);
      setView(next);
      await refreshTasks();
    } catch (cause) {
      setError(errorMessage(cause, "配方上下文移除失败"));
    }
  }

  async function chooseRecipeMatch(match: AgentRecipeMatch) {
    setRecipeChoices([]);
    setReferences([{ recipeId: match.recipeId, recipeName: match.recipeName }]);
    if (!activeTask) return;
    try {
      const next = await api.bindAgentRecipe(activeTask.id, match.recipeId);
      setView(next);
      await refreshTasks();
    } catch (cause) {
      setError(errorMessage(cause, "配方上下文绑定失败"));
    }
  }

  function beginQueueEdit(message: AgentQueuedMessage) {
    setEditingQueueId(message.id);
    setQueueEditDraft(message.content);
  }

  async function commitQueueEdit(message: AgentQueuedMessage) {
    try {
      await api.editAgentQueuedMessage({ messageId: message.id, content: queueEditDraft, references: message.references });
      setEditingQueueId(null);
      if (activeTask) await refreshActive(activeTask.id);
    } catch (cause) {
      setError(errorMessage(cause, "排队消息编辑失败"));
    }
  }

  async function deleteQueueMessage(message: AgentQueuedMessage) {
    try {
      await api.deleteAgentQueuedMessage(message.id);
      if (activeTask) await refreshActive(activeTask.id);
    } catch (cause) {
      setError(errorMessage(cause, "排队消息删除失败"));
    }
  }

  async function resumeQueue() {
    if (!activeTask) return;
    try {
      const next = await api.resumeAgentQueue(activeTask.id);
      setView(next);
      setTurns(next.activeTurns);
      await refreshTasks();
    } catch (cause) {
      setError(errorMessage(cause, "继续排队消息失败"));
    }
  }

  function beginTurnEdit(turn: HarnessTurn) {
    setEditingTurn(turn);
    setTurnEditDraft(turn.userContent);
  }

  async function commitTurnEdit() {
    if (!editingTurn) return;
    setBusy(true);
    try {
      const next = await api.editAgentTurn(editingTurn.id, turnEditDraft);
      setView(next);
      setTurns(next.activeTurns);
      setEditingTurn(null);
      await Promise.all([refreshActive(editingTurn.taskId, true), refreshTasks()]);
    } catch (cause) {
      setError(errorMessage(cause, "消息分支创建失败"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseBranch(turnId: string) {
    if (!activeTask) return;
    try {
      const next = await api.selectAgentBranch(activeTask.id, turnId);
      setView(next);
      setTurns(next.activeTurns);
    } catch (cause) {
      setError(errorMessage(cause, "回答分支切换失败"));
    }
  }

  const currentRoute = modelDirectory?.current.provider && modelDirectory.current.model
    ? { ...modelDirectory.current, engine: modelDirectory.current.engine ?? "foodlab_runtime" as AgentEngine }
    : null;
  const isPopout = new URLSearchParams(window.location.search).get("surface") === "agent";
  const dockBlock = [...turns].reverse().flatMap((turn) => turn.contentBlocks).find((block) => block.type === "question" || (block.type === "action" && block.requiresApproval));

  return (
    <aside
      aria-hidden={!open}
      aria-label="Ninka Agent"
      className={`agent-panel harness-agent-panel agent-conversation-surface${open ? " is-open" : ""}${isPopout ? " is-popout" : ""}`}
    >
      <nav aria-label="Agent 会话" className="agent-session-rail">
        <div className="agent-session-rail__top">
          <button aria-label="新建会话" onClick={newConversation} title="新建会话" type="button">
            <Icon name="plus" size={18} /><span>新建会话</span>
          </button>
        </div>
        <label className="agent-session-search">
          <Icon name="search" size={16} />
          <span className="sr-only">搜索会话</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话" value={search} />
        </label>
        <div aria-label="会话分类" className="agent-session-tabs" role="tablist">
          <button aria-selected={taskScope === "active"} className={taskScope === "active" ? "is-active" : undefined} onClick={() => chooseTaskScope("active")} role="tab" type="button">会话</button>
          <button aria-selected={taskScope === "archived"} className={taskScope === "archived" ? "is-active" : undefined} onClick={() => chooseTaskScope("archived")} role="tab" type="button">已归档</button>
        </div>
        <div className="agent-session-list">
          {filteredTasks.map((task) => (
            <div className={task.id === activeTaskId ? "is-active" : ""} key={task.id}>
              <button onClick={() => setActiveTaskId(task.id)} title={`${task.title} · ${taskStatusLabel(task, task.id === activeTaskId ? queuedMessages.length : 0)}`} type="button">
                <span aria-label={taskStatusLabel(task, task.id === activeTaskId ? queuedMessages.length : 0)} className={`agent-session-status is-${taskStatusKind(task)}`} role="img" />
                <span>{task.title}</span>
                {task.id === activeTaskId && queuedMessages.length ? <b>{queuedMessages.length}</b> : null}
              </button>
              <span className="agent-session-actions">
                {taskScope === "archived" ? (
                  <button aria-label={`恢复 ${task.title}`} disabled={busy} onClick={() => void restoreTask(task)} title="恢复会话" type="button"><Icon name="restore" size={14} /></button>
                ) : (
                  <>
                    <button aria-label={`重命名 ${task.title}`} onClick={() => beginRename(task)} title="重命名" type="button"><Icon name="edit" size={14} /></button>
                    <button aria-label={`${task.status === "running" ? "停止并归档" : "归档"} ${task.title}`} disabled={busy} onClick={() => void archiveTask(task)} title={task.status === "running" ? "停止并归档" : "归档"} type="button"><Icon name="archive" size={14} /></button>
                  </>
                )}
              </span>
            </div>
          ))}
          {!filteredTasks.length ? <p className="agent-session-empty">{taskScope === "archived" ? "暂无已归档会话" : "暂无会话"}</p> : null}
        </div>
      </nav>

      <section className="agent-conversation-main">
        <header className="agent-conversation-header">
          <div>
            <span>Ninka Agent</span>
            <strong>{activeTask?.title || "新会话"}</strong>
          </div>
          <div className="agent-conversation-header__actions">
            {archived && activeTask ? (
              <button className="agent-header-restore" disabled={busy} onClick={() => void restoreTask(activeTask)} type="button"><Icon name="restore" size={15} /><span>恢复会话</span></button>
            ) : (
              <ModelPicker directory={modelDirectory} disabled={busy || running || !ready} onChange={(value) => void chooseModel(value)} route={currentRoute} />
            )}
            {!isPopout ? (
              <button aria-label="在独立窗口打开" disabled={openingPopout} onClick={() => void popOut()} title="在独立窗口打开" type="button"><Icon name="export" size={17} /></button>
            ) : null}
            <button aria-label="关闭 Ninka Agent" onClick={() => void closeSurface(isPopout, onClose)} title="关闭" type="button"><Icon name="close" size={18} /></button>
          </div>
        </header>

        {!ready ? (
          <div className="agent-runtime-banner" role="status">
            <Icon name={health?.status === "damaged" ? "warning" : "offline"} size={17} />
            <span>{health?.lastError || runtimeCopy(health?.status)}</span>
            {health?.status !== "damaged" ? <button disabled={busy} onClick={() => void startRuntime()} type="button">重试</button> : null}
          </div>
        ) : modelDirectory && !modelDirectory.currentUsable ? (
          <div className="agent-runtime-banner" role="status">
            <Icon name="settings" size={17} /><span>配置一个可用模型后即可发送消息。</span>
            <button onClick={() => onConfigure("models")} type="button">配置模型</button>
          </div>
        ) : null}

        <div aria-live="polite" aria-relevant="additions text" className="agent-conversation-log" onScroll={() => {
          const element = messageLogRef.current;
          if (!element) return;
          const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          setFollowing(nearBottom);
          if (nearBottom) setHasNewContent(false);
        }} ref={messageLogRef} role="log">
          {!activeTask && turns.length === 0 ? (
            <div className="agent-conversation-empty">
              <Icon name="ai-assistant" size={54} />
              <h2>和 Ninka Agent 一起推进研发</h2>
              <p>直接描述要分析、比较、计算或整理的内容。</p>
            </div>
          ) : null}
          {turns.map((turn) => (
            <ConversationTurn
              artifacts={artifacts.filter((artifact) => artifact.turnId === turn.id)}
              branchSiblings={allTurns.filter((candidate) => candidate.parentTurnId === turn.parentTurnId)}
              events={events.filter((event) => event.turnId === turn.id)}
              key={turn.id}
              onBranch={(turnId) => void chooseBranch(turnId)}
              onChoice={setDraft}
              onEdit={beginTurnEdit}
              onOpenArtifact={(artifact) => void openArtifact(artifact)}
              readOnly={archived}
              turn={turn}
            />
          ))}
          <div ref={messageEndRef} />
        </div>

        {hasNewContent ? <button className="agent-new-content" onClick={() => { setFollowing(true); messageEndRef.current?.scrollIntoView({ block: "end" }); }} type="button">查看新内容</button> : null}

        {error ? (
          <div className="agent-inline-error" role="alert">
            <Icon name="warning" size={17} /><span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError("")} type="button"><Icon name="close" size={15} /></button>
          </div>
        ) : null}

        {archived && activeTask ? (
          <div className="agent-archived-dock">
            <span>此会话已归档，恢复后可继续对话。</span>
            <button className="button button--secondary" disabled={busy} onClick={() => void restoreTask(activeTask)} type="button">恢复会话</button>
          </div>
        ) : <form className="agent-conversation-composer" onSubmit={(event) => { event.preventDefault(); void send("queue"); }}>
          {recipeChoices.length ? <section className="agent-dock-card is-question"><strong>找到多个同名配方，请选择</strong>{recipeChoices.map((match) => <button key={match.recipeId} onClick={() => void chooseRecipeMatch(match)} type="button"><span>{match.recipeName}</span><small>{match.schemeName} · {match.productId}</small></button>)}</section> : null}
          {dockBlock?.type === "question" ? <section className="agent-dock-card is-question"><strong>{dockBlock.prompt}</strong><div>{dockBlock.choices.map((choice) => <button key={choice.id} onClick={() => setDraft(choice.label)} type="button">{choice.label}</button>)}</div></section> : null}
          {dockBlock?.type === "action" ? <section className="agent-dock-card is-review"><Icon name="lock" size={16} /><strong>{dockBlock.action}</strong><span>确认后才会执行</span></section> : null}
          {queuedMessages.length ? <section className="agent-queue"><header><strong>{queuePaused ? `已暂停 · ${queuedMessages.length} 条待执行` : `${queuedMessages.length} 条排队消息`}</strong>{queuePaused ? <button onClick={() => void resumeQueue()} type="button">继续执行</button> : null}</header>{queuedMessages.map((message) => editingQueueId === message.id ? <div className="agent-queue__edit" key={message.id}><textarea onChange={(event) => setQueueEditDraft(event.target.value)} value={queueEditDraft} /><button onClick={() => void commitQueueEdit(message)} type="button">保存</button><button onClick={() => setEditingQueueId(null)} type="button">取消</button></div> : <div className="agent-queue__item" key={message.id}><span>{message.state === "steering" ? "正在补充" : "排队"}</span><p>{message.content}</p>{message.state === "queued" ? <div><button aria-label="编辑排队消息" onClick={() => beginQueueEdit(message)} type="button"><Icon name="edit" size={14} /></button><button aria-label="删除排队消息" onClick={() => void deleteQueueMessage(message)} type="button"><Icon name="close" size={14} /></button></div> : null}</div>)}</section> : null}
          {(references.length || pendingFiles.length) ? (
            <div className="agent-context-chips">
              {references.map((reference) => <span key={reference.recipeId}><Icon name="recipe-workbench" size={15} /><span className="agent-context-chip__label" title={reference.recipeName}>{reference.recipeName}</span><button aria-label={`移除 ${reference.recipeName}`} onClick={() => void removeRecipeReference()} type="button"><Icon name="close" size={12} /></button></span>)}
              {pendingFiles.map((file, index) => (
                <span key={`${file.value}-${index}`}><Icon name="paperclip" size={14} /><span className="agent-context-chip__label" title={fileName(file.value)}>{fileName(file.value)}</span><button aria-label={`移除 ${fileName(file.value)}`} onClick={() => setPendingFiles((current) => current.filter((_, at) => at !== index))} type="button"><Icon name="close" size={12} /></button></span>
              ))}
            </div>
          ) : null}
          <textarea
            aria-label="给 Ninka Agent 发消息"
            disabled={!ready}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (mentionTerm !== null) {
                if (event.key === "ArrowDown" && mentionRecipes.length) {
                  event.preventDefault();
                  setMentionIndex((current) => (current + 1) % mentionRecipes.length);
                  return;
                }
                if (event.key === "ArrowUp" && mentionRecipes.length) {
                  event.preventDefault();
                  setMentionIndex((current) => (current - 1 + mentionRecipes.length) % mentionRecipes.length);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && mentionRecipes[mentionIndex]) {
                  event.preventDefault();
                  chooseMention(mentionRecipes[mentionIndex]);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft(draft.replace(/@([^@\s]*)$/u, "$1"));
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send("queue");
              }
            }}
            placeholder={activeTask ? "继续这个对话…" : "描述你现在要解决的研发问题…"}
            rows={3}
            value={draft}
          />
          {mentionTerm !== null ? <div className="agent-recipe-mentions" role="listbox">{mentionRecipes.length ? mentionRecipes.map((summary, index) => <button aria-selected={index === mentionIndex} className={index === mentionIndex ? "is-active" : undefined} key={summary.recipe.id} onClick={() => chooseMention(summary)} onMouseEnter={() => setMentionIndex(index)} role="option" type="button"><strong>{summary.recipe.name}</strong><small>{summary.recipe.code || summary.recipe.schemeName}</small></button>) : <p>没有匹配的配方</p>}</div> : null}
          <div>
            <button aria-label="添加附件" className="is-icon" disabled={busy || Boolean(activeTask)} onClick={() => void pickFiles()} title="添加附件" type="button"><Icon name="paperclip" size={18} /></button>
            <span>{running ? "Enter 排队 · Shift + Enter 换行" : "Enter 发送 · Shift + Enter 换行"}</span>
            {running ? <><button className="agent-steer-button" disabled={busy || !draft.trim()} onClick={() => void send("steer")} type="button">立即补充</button><button className="agent-stop-button" disabled={busy} onClick={() => void cancel()} type="button">停止</button></> : <button aria-label="发送消息" className="agent-send-button" disabled={busy || !draft.trim() || !ready} type="submit"><Icon name="send" size={17} /></button>}
          </div>
        </form>}
      </section>

      {renamingTaskId ? <div aria-modal="true" className="agent-dialog-backdrop" role="dialog"><form className="agent-dialog" onSubmit={(event) => { event.preventDefault(); const task = tasks.find((item) => item.id === renamingTaskId); if (task) void commitRename(task); }}><strong>重命名会话</strong><input aria-label="会话名称" autoFocus disabled={renameSaving} maxLength={120} onChange={(event) => setRenameDraft(event.target.value)} value={renameDraft} /><div><button className="button button--secondary" onClick={cancelRename} type="button">取消</button><button className="button button--primary" disabled={renameSaving} type="submit">保存</button></div></form></div> : null}
      {editingTurn ? <div aria-modal="true" className="agent-dialog-backdrop" role="dialog"><form className="agent-dialog" onSubmit={(event) => { event.preventDefault(); void commitTurnEdit(); }}><strong>编辑消息并创建新分支</strong><textarea autoFocus onChange={(event) => setTurnEditDraft(event.target.value)} rows={6} value={turnEditDraft} /><small>原消息和回答会保留，可在消息下方切换分支。</small><div><button className="button button--secondary" onClick={() => setEditingTurn(null)} type="button">取消</button><button className="button button--primary" disabled={busy || !turnEditDraft.trim()} type="submit">发送修改</button></div></form></div> : null}
      {reviewDraft ? (
        <ImportedVariantReview
          api={api}
          draft={reviewDraft}
          onCancel={() => setReviewDraft(null)}
          onSaved={() => {
            setReviewDraft(null);
            if (activeTask) void refreshActive(activeTask.id, true);
          }}
        />
      ) : null}
      {reviewProposal ? (
        <AgentRecipeProposalReview
          api={api}
          proposal={reviewProposal}
          onAccepted={(recipeId) => {
            setReviewProposal(null);
            onOpenRecipeDraft?.(recipeId);
          }}
          onClose={() => setReviewProposal(null)}
          onUpdated={setReviewProposal}
        />
      ) : null}
      {artifactPreview ? (
        <ArtifactReviewDrawer
          artifact={artifactPreview}
          onClose={() => setArtifactPreview(null)}
        />
      ) : null}
    </aside>
  );
}

function ConversationTurn({ artifacts, branchSiblings, events, onBranch, onChoice, onEdit, onOpenArtifact, readOnly, turn }: {
  artifacts: ArtifactManifest[];
  branchSiblings: HarnessTurn[];
  events: HarnessTaskEvent[];
  onBranch(turnId: string): void;
  onChoice(value: string): void;
  onEdit(turn: HarnessTurn): void;
  onOpenArtifact(artifact: ArtifactManifest): void;
  readOnly: boolean;
  turn: HarnessTurn;
}) {
  const referenced = new Set(turn.contentBlocks.flatMap((block) => block.type === "artifact_ref" ? [block.artifactId] : []));
  const branchIndex = Math.max(0, branchSiblings.findIndex((candidate) => candidate.id === turn.id));
  return (
    <article className="agent-conversation-turn">
      <div className="agent-chat-message is-user" tabIndex={0}><p>{turn.userContent}</p><MessageActions onCopy={() => void navigator.clipboard.writeText(turn.userContent)} onEdit={readOnly || turn.route.engine === "codex_app_server" ? undefined : () => onEdit(turn)} time={turn.createdAt} /></div>
      <div className="agent-chat-message is-assistant">
        <div className="agent-chat-message__mark"><Icon name="ai-assistant" size={24} /></div>
        <div className="agent-chat-message__body">
          <ToolProgress events={events} running={turn.status === "running"} />
          {turn.contentBlocks.filter((block) => block.type !== "question" && block.type !== "action").map((block, index) => <ContentBlock artifacts={artifacts} block={block} key={`${turn.id}-${index}`} onChoice={onChoice} onOpenArtifact={onOpenArtifact} />)}
          {turn.status === "running" && turn.contentBlocks.length === 0 ? <p className="agent-answering">正在处理…</p> : null}
          {artifacts.filter((artifact) => !referenced.has(artifact.id)).map((artifact) => <ArtifactCard artifact={artifact} key={artifact.id} onOpen={onOpenArtifact} />)}
          {turn.status === "needs_input" ? <InlineOutcome kind="question" text="需要你补充条件后才能继续。" /> : null}
          {turn.status === "needs_review" ? <InlineOutcome kind="review" text="已形成待复核成果，确认后才会正式保存或采纳。" /> : null}
          {turn.status === "failed" ? <InlineOutcome kind="error" text="本轮没有完成，已保留对话和上下文，可以直接重试。" /> : null}
          {turn.status === "cancelled" || turn.status === "interrupted" ? <InlineOutcome kind="muted" text="本轮已停止，可以继续补充条件。" /> : null}
          {branchSiblings.length > 1 ? <div aria-label="回答分支" className="agent-branch-nav"><button aria-label="上一个分支" disabled={branchIndex === 0} onClick={() => onBranch(branchSiblings[branchIndex - 1]!.id)} type="button"><Icon name="arrow-left" size={14} /></button><span>{branchIndex + 1}/{branchSiblings.length}</span><button aria-label="下一个分支" disabled={branchIndex >= branchSiblings.length - 1} onClick={() => onBranch(branchSiblings[branchIndex + 1]!.id)} type="button"><Icon name="arrow-right" size={14} /></button></div> : null}
        </div>
      </div>
    </article>
  );
}

function MessageActions({ onCopy, onEdit, time }: { onCopy(): void; onEdit: (() => void) | undefined; time: string }) {
  return <div className="agent-message-actions"><button aria-label="复制消息" onClick={onCopy} title="复制" type="button"><Icon name="copy" size={14} /></button><time dateTime={time}>{formatMessageTime(time)}</time>{onEdit ? <button aria-label="编辑消息" onClick={onEdit} title="编辑并创建分支" type="button"><Icon name="edit" size={14} /></button> : null}</div>;
}

function ModelPicker({ directory, disabled, onChange, route }: {
  directory: AgentModelDirectory | null;
  disabled: boolean;
  onChange(value: string): void;
  route: AgentModelRoute | null;
}) {
  const selected = route ? encodeRoute(route) : "";
  const groups = directory?.groups.filter((group) => group.engine !== "codex_app_server") ?? [];
  const options = groups.flatMap((group) => group.models.map((model) => ({ engine: group.engine ?? "foodlab_runtime" as AgentEngine, provider: group.provider, model: model.id })));
  return (
    <label className="agent-model-picker">
      <span className="sr-only">当前回答模型</span>
      <select disabled={disabled || options.length === 0} onChange={(event) => onChange(event.target.value)} value={selected}>
        {!route ? <option disabled value="">选择模型</option> : null}
        {route && !options.some((option) => encodeRoute(option) === selected) ? <option value={selected}>{route.provider} · {route.model}</option> : null}
        {groups.map((group) => (
          <optgroup key={`${group.engine ?? "foodlab_runtime"}-${group.provider}`} label={group.displayName || group.provider}>
            {group.models.map((model) => <option key={model.id} value={encodeRoute({ engine: group.engine ?? "foodlab_runtime", provider: group.provider, model: model.id })}>{model.name || model.id} · {modelCapabilityLabel(model)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function ToolProgress({ events, running }: { events: HarnessTaskEvent[]; running: boolean }) {
  const visible = events.filter((event) => event.eventType === "tool/call" || event.eventType === "tool/result" || event.eventType.startsWith("compaction/"));
  if (!visible.length) return null;
  const latest = visible.at(-1)!;
  return (
    <details className="agent-tool-progress" open={running}>
      <summary><span className={running ? "is-running" : ""} />{toolProgressLabel(latest, running)}<Icon name="chevron-down" size={14} /></summary>
      <ol>{visible.map((event) => <li key={`${event.taskId}-${event.seq}`}>{toolProgressLabel(event, false)}</li>)}</ol>
    </details>
  );
}

function ContentBlock({ artifacts, block, onChoice, onOpenArtifact }: {
  artifacts: ArtifactManifest[];
  block: HarnessTurn["contentBlocks"][number];
  onChoice(label: string): void;
  onOpenArtifact(artifact: ArtifactManifest): void;
}) {
  if (block.type === "markdown") return <div className="harness-markdown"><ReactMarkdown components={{ a: ({ children, ...props }) => <a {...props} rel="noreferrer" target="_blank">{children}</a> }} remarkPlugins={[remarkGfm]} skipHtml>{block.text}</ReactMarkdown></div>;
  if (block.type === "table") return <div className="harness-table-wrap"><table><thead><tr>{block.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={block.columns[index]?.key ?? index}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></div>;
  if (block.type === "citations") return <details className="harness-citations" open={block.sources.length <= 3}><summary>来源 · {block.sources.length} 条</summary><ol>{block.sources.map((source) => <li key={source.url}><a href={source.url} rel="noreferrer" target="_blank">{source.title || source.url}</a>{source.snippet ? <p>{source.snippet}</p> : null}{source.publishedAt ? <small>{source.publishedAt}</small> : null}</li>)}</ol></details>;
  if (block.type === "question") return <section className="harness-question"><strong>{block.prompt}</strong><div>{block.choices.map((choice) => <button key={choice.id} onClick={() => onChoice(choice.label)} type="button">{choice.label}</button>)}</div></section>;
  if (block.type === "action") return <section className="harness-action"><Icon name={block.requiresApproval ? "lock" : "check"} size={17} /><span>{block.action}</span>{block.requiresApproval ? <b>需要确认</b> : null}</section>;
  const artifact = artifacts.find((item) => item.id === block.artifactId);
  return artifact ? <ArtifactCard artifact={artifact} onOpen={onOpenArtifact} /> : null;
}

function ArtifactCard({ artifact, onOpen }: { artifact: ArtifactManifest; onOpen(artifact: ArtifactManifest): void }) {
  return <button aria-label={`打开${artifact.title}`} className="agent-artifact-card" onClick={() => onOpen(artifact)} type="button"><Icon name={artifactIcon(artifact.kind)} size={22} /><span><strong>{artifact.title}</strong><small>{artifactKind(artifact.kind)} · {artifactStatus(artifact.status)}</small></span><Icon name="arrow-right" size={16} /></button>;
}

function ArtifactReviewDrawer({ artifact, onClose }: { artifact: ArtifactManifest; onClose(): void }) {
  return (
    <div className="agent-dialog-backdrop agent-artifact-review-backdrop">
      <section aria-labelledby="agent-artifact-review-title" aria-modal="true" className="agent-artifact-review" role="dialog">
        <header>
          <div><span>{artifactKind(artifact.kind)}</span><h2 id="agent-artifact-review-title">{artifact.title}</h2></div>
          <button aria-label="关闭成果复核" onClick={onClose} type="button"><Icon name="close" size={18} /></button>
        </header>
        <dl>
          <div><dt>状态</dt><dd>{artifactStatus(artifact.status)}</dd></div>
          <div><dt>成果类型</dt><dd>{artifact.kind}</dd></div>
          <div><dt>关联数据</dt><dd>{artifact.domainRef ?? "无独立业务对象"}</dd></div>
          <div><dt>生成时间</dt><dd>{formatArtifactTime(artifact.createdAt)}</dd></div>
        </dl>
        <p>该成果当前没有可编辑的专用界面，此处仅供复核状态与来源关联。</p>
        <footer><button className="button button--secondary" onClick={onClose} type="button">关闭</button></footer>
      </section>
    </div>
  );
}

function artifactDomainId(artifact: ArtifactManifest) {
  const prefix = `${artifact.kind}:`;
  return artifact.domainRef?.startsWith(prefix)
    ? artifact.domainRef.slice(prefix.length).trim() || null
    : null;
}

function formatArtifactTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function findSelectedModel(directory: AgentModelDirectory) {
  return directory.groups
    .find((group) =>
      (group.engine ?? "foodlab_runtime") === (directory.current.engine ?? "foodlab_runtime")
      && group.provider === directory.current.provider
    )
    ?.models.find((model) => model.id === directory.current.model);
}

function modelCapabilityLabel(model: AgentModelDirectory["groups"][number]["models"][number]) {
  if (model.inputModalities?.includes("image")) return "支持图片";
  if (model.capabilityStatus === "known" || model.capabilityStatus === "probed") return "仅文本";
  return "首次使用时确认";
}

function isImageFile(value: string) {
  return /\.(?:jpe?g|png|webp)$/i.test(value.trim());
}

function InlineOutcome({ kind, text }: { kind: "question" | "review" | "error" | "muted"; text: string }) {
  return <p className={`agent-inline-outcome is-${kind}`}><Icon name={kind === "error" ? "warning" : kind === "review" ? "lock" : "info"} size={16} />{text}</p>;
}

function toolProgressLabel(event: HarnessTaskEvent, running: boolean) {
  const data = eventData(event);
  if (event.eventType === "compaction/start") return "正在整理较长的对话";
  if (event.eventType === "compaction/end") return "已整理对话上下文";
  if (event.eventType === "tool/call") return `${running ? "正在" : "已开始"}${toolDisplayName(textValue(data.name))}`;
  return recordValue(data.message).isError === true ? "工具执行未成功" : "工具处理完成";
}

function eventData(event: HarnessTaskEvent): Record<string, unknown> { return recordValue(recordValue(event.payload).data); }
function recordValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function textValue(value: unknown) { return typeof value === "string" ? value : "FoodLab 工具"; }

function toolDisplayName(value: string) {
  const name = value.replace(/^mcp__food_rd__/, "");
  const known: Record<string, string> = {
    request_task_input: "确认所需条件",
    create_ingredient_import_draft: "整理原料导入草稿",
    update_ingredient_import_draft: "更新原料导入草稿",
    create_recipe_proposal: "生成配方提案",
    update_recipe_proposal: "更新配方提案",
    create_recipe_estimate_card: "生成研发估算卡",
    create_label_compliance_review: "整理标签合规审查",
    create_research_report_draft: "整理研发报告",
    diagnose_recipe: "分析当前配方",
  };
  return known[name] ?? name.replaceAll("_", " ");
}

function encodeRoute(route: Pick<AgentModelRoute, "engine" | "provider" | "model">) { return [route.engine, route.provider, route.model].map(encodeURIComponent).join("|"); }
function decodeRoute(value: string): AgentModelRoute | null {
  const [engine, provider, model] = value.split("|").map(decodeURIComponent);
  if ((engine !== "foodlab_runtime" && engine !== "codex_app_server") || !provider || !model) return null;
  return { engine, provider, model };
}

function conversationTitle(content: string, recipeName?: string) {
  const firstLine = (content.split(/\r?\n/, 1)[0] ?? "").trim().replace(/\s+/g, " ");
  const title = firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  return recipeName ? `${recipeName} · ${title}` : title || "新研发会话";
}

function readConversationDrafts(): Record<string, string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONVERSATION_DRAFTS_KEY) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function trailingMention(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^@\s]*)$/u);
  return match ? match[1] ?? "" : null;
}

function replaceTrailingMention(value: string, replacement: string) {
  return value.replace(/@[^@\s]*$/u, replacement);
}

function normalizeRecipeText(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s\p{P}]+/gu, "");
}

function taskStatusKind(task: HarnessTask) {
  if (task.status === "running") return "running";
  if (task.status === "needs_input" || task.status === "needs_review") return "waiting";
  if (task.status === "failed") return "failed";
  if (task.status === "completed") return "completed";
  return "idle";
}

function taskStatusLabel(task: HarnessTask, queued: number) {
  const label = task.status === "running"
    ? "正在运行"
    : task.status === "needs_input"
      ? "等待补充"
      : task.status === "needs_review"
        ? "等待复核"
        : task.status === "failed"
          ? "执行失败"
          : task.status === "completed"
            ? "有已完成回答"
            : "已停止";
  return queued ? `${label}，${queued} 条排队消息` : label;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function fileName(path: string) { return path.split(/[\\/]/).at(-1) || path; }
function artifactIcon(kind: string): "nutrition-label" | "report" | "recipe-version" | "ingredient" | "note" {
  if (kind.includes("label")) return "nutrition-label";
  if (kind.includes("report")) return "report";
  if (kind.includes("recipe")) return "recipe-version";
  if (kind.includes("ingredient")) return "ingredient";
  return "note";
}
function artifactKind(kind: string) { return ({ ingredient_import_draft: "原料草稿", recipe_proposal: "配方提案", recipe_estimate: "研发估算", recipe_estimate_card: "研发估算", label_compliance_review: "标签审查", research_report: "研发报告" } as Record<string, string>)[kind] ?? "研发成果"; }
function artifactStatus(status: ArtifactManifest["status"]) { return ({ needs_input: "待补充", needs_review: "待复核", accepted: "已采纳", rejected: "已拒绝", stale: "已过期" })[status]; }
function runtimeCopy(status: HarnessHealth["status"] | undefined) {
  if (!status) return "正在连接 Agent 服务，已有会话仍可查看。";
  if (status === "damaged") return "Agent 组件损坏，请重新安装 FoodLab。";
  if (status === "starting") return "Agent 服务正在启动，已有会话仍可查看。";
  return "Agent 服务暂不可用，已有会话仍可查看。";
}
function errorMessage(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
async function openAgentWindow() {
  if (!("__TAURI_INTERNALS__" in window)) throw new Error("native window unavailable");
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel("foodlab-agent");
  if (existing) {
    await existing.setFocus();
    return;
  }
  const windowHandle = new WebviewWindow("foodlab-agent", { title: "Ninka Agent", url: "/?surface=agent", width: 920, height: 780, minWidth: 620, minHeight: 640, resizable: true });
  await new Promise<void>((resolve, reject) => {
    void windowHandle.once("tauri://created", () => resolve());
    void windowHandle.once("tauri://error", () => reject(new Error("window creation failed")));
  });
}

async function closeSurface(isPopout: boolean, onClose: () => void) {
  if (!isPopout || !("__TAURI_INTERNALS__" in window)) {
    onClose();
    return;
  }
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().close();
}
