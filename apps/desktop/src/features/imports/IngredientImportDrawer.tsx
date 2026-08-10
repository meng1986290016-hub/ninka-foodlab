import type { DesktopApi } from "../../api/desktop-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { IngredientImportCommitResult } from "../../api/import-types";
import { Icon } from "../../components/Icon";
import { IngredientImportPreview } from "./IngredientImportPreview";
import { useIngredientImport } from "./useIngredientImport";

interface IngredientImportDrawerProps {
  api: DesktopApi;
  filePicker: ImportFilePicker;
  onClose: () => void;
  onCommitted: (result: IngredientImportCommitResult) => void;
}

const jobStatusText = {
  pending: "等待处理",
  extracting: "正在读取原始资料",
  recognizing: "原始资料已保留，等待 Agent 识别",
  grouping: "正在拆分原料与供应商",
  drafts_ready: "预览已生成，请人工复核",
  partially_completed: "部分草稿已导入",
  failed: "处理失败",
  cancelled: "已取消",
} as const;

export function IngredientImportDrawer({
  api,
  filePicker,
  onClose,
  onCommitted,
}: IngredientImportDrawerProps) {
  const workflow = useIngredientImport(api);
  const activeDrafts = workflow.drafts.filter(
    (draft) => draft.status !== "discarded" && draft.status !== "imported",
  );
  const hasBlockingIssues = activeDrafts.some((draft) =>
    draft.issues.some((issue) => issue.severity === "error"),
  );

  async function chooseSources() {
    const files = await filePicker.pickSources();
    if (files.length === 0) return;
    const spreadsheet = files.every((file) => /\.(csv|xlsx)$/i.test(file.value));
    await workflow.start(files, spreadsheet ? "spreadsheet" : "documents");
  }

  async function commitAll() {
    const customNutrients = [
      ...new Map(
        activeDrafts
          .flatMap((draft) => draft.review.nutrients)
          .filter((nutrient) => nutrient.definitionId === null)
          .map((nutrient) => [
            `${nutrient.name}\u0000${nutrient.unit}\u0000${nutrient.category ?? ""}`,
            `${nutrient.name}（${nutrient.unit}，${nutrient.category === "research" ? "研发指标" : "营养相关"}）`,
          ]),
      ).values(),
    ];
    const customMessage = customNutrients.length === 0
      ? ""
      : `\n\n将同时新建自定义含量项模板：${customNutrients.join("、")}`;
    if (!window.confirm(`将正式保存 ${activeDrafts.length} 个供应商版本，是否继续？${customMessage}`)) {
      return;
    }
    const result = await workflow.commit();
    if (result !== null) onCommitted(result);
  }

  return (
    <aside
      aria-label="导入原料资料"
      aria-modal="true"
      className="ingredient-drawer import-drawer"
      role="dialog"
    >
      <div className="drawer-header">
        <div>
          <h2>导入原料资料</h2>
          <p>可一次选择多个文件，每个供应商版本会分别预览。</p>
        </div>
        <button
          aria-label="关闭原料导入"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="import-drawer-body">
        <section className="import-source-step">
          <button
            className="button button--secondary"
            disabled={workflow.loading}
            onClick={() => void chooseSources()}
            type="button"
          >
            {workflow.job === null ? "选择原料资料" : "重新选择原料资料"}
          </button>
          <p>支持 CSV、XLSX、PDF、DOCX、TXT 和营养标签图片。</p>
        </section>

        {workflow.loading ? (
          <p aria-live="polite" className="import-progress">正在处理原料资料…</p>
        ) : null}
        {workflow.job !== null ? (
          <div aria-live="polite" className="import-job-status">
            <strong>{jobStatusText[workflow.job.status]}</strong>
            <span>{workflow.job.progressCurrent} / {workflow.job.progressTotal} 个文件</span>
          </div>
        ) : null}
        {workflow.error !== null ? (
          <p className="form-error" role="alert">{workflow.error}</p>
        ) : null}

        <IngredientImportPreview
          drafts={workflow.drafts}
          onChange={(id, review) => void workflow.updateDraft(id, review)}
          onDiscard={(id) => void workflow.discardDraft(id)}
        />
      </div>

      <div className="drawer-actions import-drawer-actions">
        <button className="button button--secondary" onClick={onClose} type="button">
          取消
        </button>
        <button
          className="button button--primary"
          disabled={
            workflow.loading || activeDrafts.length === 0 || hasBlockingIssues
          }
          onClick={() => void commitAll()}
          type="button"
        >
          确认导入全部
        </button>
      </div>
    </aside>
  );
}
