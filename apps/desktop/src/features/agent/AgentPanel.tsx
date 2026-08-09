import { useEffect, useRef, useState } from "react";

import type { AgentEventSource } from "../../api/agent-event-source";
import type { DesktopApi } from "../../api/desktop-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type {
  ImportFileReference,
  IngredientImportDraft,
} from "../../api/import-types";
import { Icon } from "../../components/Icon";
import { AgentComposer } from "./AgentComposer";
import { AgentMessageList } from "./AgentMessageList";
import { AgentTaskStatus } from "./AgentTaskStatus";
import { AgentRecipeProposalList } from "./AgentRecipeProposalList";
import { AgentRecipeProposalReview } from "./AgentRecipeProposalReview";
import type { AgentRecipeProposal } from "../../api/agent-recipe-types";
import { IngredientImportDraftList } from "./IngredientImportDraftList";
import { useAgentConversation } from "./useAgentConversation";
import type { RecipeAgentWorkbenchContext } from "../recipes/recipe-agent-analysis";
import { RecipeAgentWorkspace } from "./RecipeAgentWorkspace";

interface AgentPanelProps {
  api: DesktopApi;
  events: AgentEventSource;
  filePicker: ImportFilePicker;
  open: boolean;
  onClose(): void;
  onConfigure(section: "general" | "models"): void;
  onReviewDraft(
    draft: IngredientImportDraft,
    queue: IngredientImportDraft[],
  ): void;
  onOpenImported(draft: IngredientImportDraft): void;
  onOpenRecipeDraft?(recipeId: string): void;
  recipeContext?: RecipeAgentWorkbenchContext | null;
  draftRefreshToken?: number;
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
  onReviewDraft,
  onOpenImported,
  onOpenRecipeDraft,
  recipeContext = null,
  draftRefreshToken = 0,
}: AgentPanelProps) {
  const workflow = useAgentConversation(api, events);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ImportFileReference[]>([]);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [approvedRemoteProviders, setApprovedRemoteProviders] = useState(
    () => new Set<string>(),
  );
  const [reviewProposal, setReviewProposal] =
    useState<AgentRecipeProposal | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) void workflow.refreshConfiguration();
  }, [open, workflow.refreshConfiguration]);

  useEffect(() => {
    if (draftRefreshToken > 0) void workflow.refreshDrafts();
  }, [draftRefreshToken, workflow.refreshDrafts]);

  useEffect(() => {
    if (
      open &&
      (workflow.proposals.length > 0 || workflow.drafts.length > 0)
    ) {
      timelineEndRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [open, workflow.drafts.length, workflow.proposals.length]);

  async function sendNow(nextText: string, nextFiles: ImportFileReference[]) {
    const run = await workflow.send(nextText, nextFiles, {
      ...(recipeContext
        ? {
            recipeContext: {
              recipeId: recipeContext.recipe.id,
              recipeName: recipeContext.recipe.name,
              draftFingerprint: recipeContext.draftFingerprint,
            },
          }
        : {}),
    });
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

  async function discardDraft(draft: IngredientImportDraft) {
    if (
      !window.confirm(
        `放弃“${draft.review.materialName || "未命名原料"}”这张草稿？`,
      )
    ) {
      return;
    }
    await api.discardIngredientImportDraft(draft.id);
    await workflow.refreshDrafts();
  }

  async function discardProposal(proposal: AgentRecipeProposal) {
    if (!window.confirm(`放弃“${proposal.payload.productName}”这张配方提案？`)) return;
    await api.discardAgentRecipeProposal(proposal.id);
    await workflow.refreshProposals();
  }

  const needsConfiguration =
    workflow.preferences !== null &&
    (!workflow.preferences.enabled || !workflow.activeProvider);
  const runAttachmentIds = new Set(
    workflow.messages
      .filter(
        (message) =>
          message.runId === workflow.lastRun?.id && message.role === "user",
      )
      .flatMap((message) => message.attachmentIds),
  );
  const assignedAttachmentIds = new Set(
    workflow.drafts.flatMap((draft) =>
      draft.attachments.map((attachment) => attachment.id),
    ),
  );
  const unassignedAttachmentCount = [...runAttachmentIds].filter(
    (id) => !assignedAttachmentIds.has(id),
  ).length;
  const reviewableDrafts = workflow.drafts.filter(
    (draft) => draft.status !== "imported" && draft.status !== "discarded",
  );
  const busy = workflow.starting || Boolean(workflow.currentRun);

  return (
    <aside
      aria-label="食品研发 Agent"
      aria-hidden={!open}
      className={`agent-panel${open ? " is-open" : ""}${recipeContext ? " has-recipe-context" : ""}`}
    >
      <header className="agent-panel__header">
        <div>
          <span className="agent-panel__eyebrow">食品研发助手</span>
          <div className="agent-panel__title-row">
            <h2>食品研发 Agent</h2>
            <span className="agent-panel__provider">
              <i aria-hidden="true" />
              {workflow.activeProvider?.displayName ?? "模型未配置"}
            </span>
          </div>
        </div>
        <div className="agent-panel__header-actions">
          <button
            aria-label="清空 Agent 对话"
            disabled={busy}
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

      {recipeContext ? (
        <RecipeAgentWorkspace
          api={api}
          busy={busy}
          canUseModel={Boolean(
            workflow.preferences?.enabled && workflow.activeProvider,
          )}
          context={recipeContext}
          onRequestRetrospective={() =>
            void sendNow(
              "请复盘当前配方的研发记录：读取当前草稿、研发备注和确定性试算结果，按“已记录事实 / 需要确认 / 下一轮打样建议”整理。没有记录的工艺、感官或调整原因请明确写“未记录”，不要猜测，也不要修改配方或保存正式版本。",
              [],
            )
          }
        />
      ) : null}

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
          <div className="agent-panel__timeline">
            <AgentMessageList
              loading={workflow.loading}
              messages={workflow.messages}
              onQuickStart={
                recipeContext
                  ? undefined
                  : (prompt) => {
                      setText(prompt);
                      window.requestAnimationFrame(() => {
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".agent-composer textarea",
                          )
                          ?.focus();
                      });
                    }
              }
              streamingText={workflow.streamingText}
              thinkingStatus={
                busy && !workflow.streamingText
                  ? workflow.taskStatus || "正在思考"
                  : null
              }
            />
            <IngredientImportDraftList
              busy={busy}
              drafts={workflow.drafts}
              onDiscard={(draft) => void discardDraft(draft)}
              onMerge={(source, target) =>
                void workflow.continueRun(
                  `请将草稿 ${source.id} 合并到草稿 ${target.id}。仅在原料名称、供应商和型号规格一致时合并；如有字段冲突请保留为空并标记来源不一致。`,
                )
              }
              onOpen={(draft) => onReviewDraft(draft, reviewableDrafts)}
              onOpenImported={onOpenImported}
              onRetry={(draft) =>
                void workflow.continueRun(
                  `请重新读取草稿 ${draft.id} 关联的原始资料并更新这张草稿。不要正式保存。`,
                )
              }
              onSplit={(draft) =>
                void workflow.continueRun(
                  `请检查草稿 ${draft.id} 的来源资料；如果包含多个原料、供应商或型号规格，请拆分为独立草稿。不要正式保存。`,
                )
              }
              unassignedAttachmentCount={unassignedAttachmentCount}
            />
            <AgentRecipeProposalList
              busy={busy}
              onDiscard={(proposal) => void discardProposal(proposal)}
              onOpen={setReviewProposal}
              onOpenAccepted={(recipeId) => onOpenRecipeDraft?.(recipeId)}
              proposals={workflow.proposals}
            />
            <div aria-hidden="true" ref={timelineEndRef} />
          </div>
          {!busy ? (
            <AgentTaskStatus
              error={workflow.error}
              lastRun={workflow.lastRun}
              onRetry={() => void workflow.retry()}
              status={workflow.taskStatus}
            />
          ) : null}

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
            disabled={workflow.loading || workflow.starting || !open}
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
      {reviewProposal ? (
        <AgentRecipeProposalReview
          api={api}
          onAccepted={(recipeId) => {
            setReviewProposal(null);
            void workflow.refreshProposals();
            onOpenRecipeDraft?.(recipeId);
          }}
          onClose={() => setReviewProposal(null)}
          onUpdated={(updated) => {
            setReviewProposal(updated);
            void workflow.refreshProposals();
          }}
          proposal={reviewProposal}
        />
      ) : null}
    </aside>
  );
}
