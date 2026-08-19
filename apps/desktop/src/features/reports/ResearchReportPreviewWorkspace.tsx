import { useState } from "react";
import {
  renderResearchReportSvg,
  type ResearchReportExportFormat,
} from "@food-rd/core";

import type { DesktopApi } from "../../api/desktop-api";
import type { NutritionLabelVersion } from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import {
  createResearchReportFilePicker,
  type ResearchReportFilePicker,
} from "../../api/research-report-file-picker";
import type { ResearchReportRecord } from "../../api/research-report-types";
import { Icon, type IconName } from "../../components/Icon";
import {
  DataQualityDrawer,
  type DataQualityDrawerContent,
} from "../data-quality/DataQualityDrawer";
import { buildVersionDataGapReport } from "../data-quality/data-quality";
import { loadRecipeVersionClosure } from "../recipes/recipe-current-price";
import { buildResearchReportDocument } from "./research-report-document";
import {
  buildResearchReportExport,
  bytesToBase64,
  type ResearchReportRasterizer,
} from "./research-report-export";

interface ResearchReportPreviewWorkspaceProps {
  api: DesktopApi;
  recipeVersion: RecipeVersion;
  nutritionLabelVersion: NutritionLabelVersion;
  onBack(): void;
  now?: () => string;
  createId?: () => string;
  filePicker?: ResearchReportFilePicker;
  rasterize?: ResearchReportRasterizer;
}

interface ReportContentItem {
  icon: IconName;
  label: string;
}

const reportContent: ReportContentItem[] = [
  { icon: "recipe-workbench", label: "配方" },
  { icon: "supplier", label: "供应商" },
  { icon: "nutrition", label: "营养" },
  { icon: "cost", label: "成本" },
  { icon: "target", label: "目标" },
  { icon: "allergen", label: "过敏原" },
  { icon: "note", label: "研发备注" },
];

const defaultNow = () => new Date().toISOString();

const exportFormats: Array<{
  format: ResearchReportExportFormat;
  label: string;
  detail: string;
}> = [
  { format: "png", label: "PNG 图片", detail: "适合预览和分享" },
  { format: "pdf", label: "PDF 文档", detail: "适合归档和打印" },
  { format: "xlsx", label: "XLSX 数据", detail: "七个结构化工作表" },
  { format: "json", label: "JSON 快照", detail: "完整机器可读记录" },
];

function defaultCreateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ResearchReportPreviewWorkspace({
  api,
  recipeVersion,
  nutritionLabelVersion,
  onBack,
  now = defaultNow,
  createId = defaultCreateId,
  filePicker,
  rasterize,
}: ResearchReportPreviewWorkspaceProps) {
  const [defaultFilePicker] = useState(createResearchReportFilePicker);
  const [artifact] = useState(() => {
    const document = buildResearchReportDocument({
      id: createId(),
      generatedAt: now(),
      recipeVersion,
      nutritionLabelVersion,
    });
    return {
      document,
      svg: renderResearchReportSvg(document),
    };
  });
  const [savedRecord, setSavedRecord] =
    useState<ResearchReportRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] =
    useState<ResearchReportExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dataDrawer, setDataDrawer] =
    useState<DataQualityDrawerContent | null>(null);
  const previewSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    artifact.svg,
  )}`;

  async function saveRecord(): Promise<ResearchReportRecord | null> {
    if (savedRecord !== null) return savedRecord;
    if (saving) return null;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createResearchReport(artifact);
      setSavedRecord(saved);
      return saved;
    } catch (cause) {
      setError(messageFrom(cause, "研发报告记录无法保存"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function exportReport(format: ResearchReportExportFormat) {
    if (exporting !== null || saving) return;
    setExporting(format);
    setExportMenuOpen(false);
    setError(null);
    setNotice(null);
    try {
      const record = await saveRecord();
      if (record === null) return;
      const exportArtifact = await buildResearchReportExport(
        record,
        format,
        rasterize,
      );
      const suffix = `.${format}`;
      const defaultName = exportArtifact.fileName.endsWith(suffix)
        ? exportArtifact.fileName.slice(0, -suffix.length)
        : exportArtifact.fileName;
      const destinationPath = await (
        filePicker ?? defaultFilePicker
      ).pickDestination(format, defaultName);
      if (destinationPath === null) return;
      await api.exportResearchReport({
        reportId: record.id,
        format,
        destinationPath,
        fileName: exportArtifact.fileName,
        documentHash: exportArtifact.documentHash,
        bytesBase64: bytesToBase64(exportArtifact.bytes),
      });
      const label = exportFormats.find((item) => item.format === format)?.label;
      setNotice(`${label ?? format.toUpperCase()} 已导出`);
    } catch (cause) {
      setError(messageFrom(cause, "研发报告无法导出"));
    } finally {
      setExporting(null);
    }
  }

  async function openDataGaps() {
    setError(null);
    try {
      const referencedVersions = await loadRecipeVersionClosure(
        (id) => api.getRecipeVersion(id),
        recipeVersion,
      );
      setDataDrawer({
        kind: "gaps",
        report: buildVersionDataGapReport({
          rootVersion: recipeVersion,
          referencedVersions,
        }),
        initialGrouping: "source",
      });
    } catch (cause) {
      setError(messageFrom(cause, "缺失数据详情无法读取"));
    }
  }

  return (
    <section className="research-report-workspace">
      <header className="research-report-header">
        <div className="research-report-header__identity">
          <button
            className="nutrition-label-back"
            onClick={onBack}
            type="button"
          >
            <Icon name="arrow-left" size={17} />
            返回营养标签
          </button>
          <div>
            <h1>研发报告预览</h1>
            <p>
              {recipeVersion.snapshot.recipe.name} · 配方 V
              {recipeVersion.versionNumber} · 标签 V
              {nutritionLabelVersion.versionNumber}
            </p>
          </div>
        </div>
        <div className="research-report-header__actions">
          <button
            className="button button--secondary"
            disabled={savedRecord !== null || saving}
            onClick={() => void saveRecord()}
            type="button"
          >
            <Icon name="report" size={17} />
            {savedRecord !== null
              ? "报告记录已保存"
              : saving
                ? "正在保存…"
                : "保存报告记录"}
          </button>
          <button
            className="button button--secondary"
            onClick={() => window.print()}
            type="button"
          >
            <Icon name="printer" size={17} />
            打印
          </button>
          <div className="research-report-export">
            <button
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              className="button button--secondary"
              disabled={exporting !== null || saving}
              onClick={() => setExportMenuOpen((open) => !open)}
              type="button"
            >
              <Icon name="export" size={17} />
              {exporting !== null ? "正在导出…" : "导出报告"}
              <Icon name="chevron-down" size={15} />
            </button>
            {exportMenuOpen ? (
              <div
                aria-label="选择研发报告导出格式"
                className="research-report-export__popover"
                role="menu"
              >
                {exportFormats.map((item) => (
                  <button
                    key={item.format}
                    onClick={() => void exportReport(item.format)}
                    role="menuitem"
                    type="button"
                  >
                    <span>{item.label}</span>
                    <small>{item.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {notice !== null ? (
        <p className="research-report-message is-success" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      ) : null}

      {error !== null ? (
        <p className="research-report-message has-error" role="alert">
          <Icon name="warning" size={16} />
          {error}
        </p>
      ) : null}

      {recipeVersion.snapshot.calculation.completeness.percent < 100 ? (
        <div className="research-report-message has-warning">
          <Icon name="warning" size={16} />
          <span>
            数据完整度 {recipeVersion.snapshot.calculation.completeness.percent}%
          </span>
          <button
            className="data-quality-trigger"
            onClick={() => void openDataGaps()}
            type="button"
          >
            查看缺失
          </button>
        </div>
      ) : null}

      <div className="research-report-workspace__body">
        <main className="research-report-preview-canvas">
          <div className="research-report-sheet">
            <img
              alt="食品研发报告 SVG 预览"
              src={previewSource}
            />
          </div>
        </main>

        <aside
          aria-label="研发报告信息"
          className="research-report-sidebar"
        >
          <section className="research-report-sidebar__section">
            <h2>报告来源</h2>
            <dl className="research-report-source-list">
              <div>
                <dt>
                  <span className="research-report-source-list__check">
                    <Icon name="check" size={14} />
                  </span>
                  配方正式版本
                </dt>
                <dd>V{recipeVersion.versionNumber}</dd>
              </div>
              <div>
                <dt>
                  <span className="research-report-source-list__check">
                    <Icon name="check" size={14} />
                  </span>
                  营养标签正式版本
                </dt>
                <dd>V{nutritionLabelVersion.versionNumber}</dd>
              </div>
              <div>
                <dt>
                  <span className="research-report-source-list__check">
                    <Icon name="check" size={14} />
                  </span>
                  规则包修订
                </dt>
                <dd>{nutritionLabelVersion.rulePackRevision}</dd>
              </div>
            </dl>
          </section>

          <section className="research-report-sidebar__section">
            <div className="research-report-section-heading">
              <h2>报告记录</h2>
              <span className={savedRecord !== null ? "is-saved" : ""}>
                {savedRecord !== null ? "已保存" : "未保存"}
              </span>
            </div>
            <p>
              {savedRecord !== null
                ? "记录保存后不可修改或删除。"
                : "保存后固定当前文档模型，不随原料价格变化。"}
            </p>
            {savedRecord !== null ? (
              <small>
                记录时间：
                {savedRecord.createdAt.slice(0, 19).replace("T", " ")}
              </small>
            ) : null}
          </section>

          <section className="research-report-sidebar__section">
            <h2>包含内容</h2>
            <ul className="research-report-content-list">
              {reportContent.map((item) => (
                <li key={item.label}>
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          <p className="research-report-disclaimer">
            <Icon name="warning" size={15} />
            结果用于研发记录与规则校验，不替代企业最终合规审核。
          </p>
        </aside>
      </div>
      <DataQualityDrawer
        content={dataDrawer}
        onClose={() => setDataDrawer(null)}
      />
    </section>
  );
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
