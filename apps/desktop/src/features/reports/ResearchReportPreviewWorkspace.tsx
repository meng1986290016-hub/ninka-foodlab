import { useState } from "react";
import { renderResearchReportSvg } from "@food-rd/core";

import type { DesktopApi } from "../../api/desktop-api";
import type { NutritionLabelVersion } from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import type { ResearchReportRecord } from "../../api/research-report-types";
import { Icon, type IconName } from "../../components/Icon";
import { buildResearchReportDocument } from "./research-report-document";

interface ResearchReportPreviewWorkspaceProps {
  api: DesktopApi;
  recipeVersion: RecipeVersion;
  nutritionLabelVersion: NutritionLabelVersion;
  onBack(): void;
  now?: () => string;
  createId?: () => string;
}

interface ReportContentItem {
  icon: IconName;
  label: string;
}

const reportContent: ReportContentItem[] = [
  { icon: "formula", label: "配方" },
  { icon: "ingredients", label: "供应商" },
  { icon: "scale", label: "营养" },
  { icon: "database", label: "成本" },
  { icon: "trend", label: "目标" },
  { icon: "warning", label: "过敏原" },
  { icon: "edit", label: "研发备注" },
];

const defaultNow = () => new Date().toISOString();

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
}: ResearchReportPreviewWorkspaceProps) {
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
  const [error, setError] = useState<string | null>(null);
  const previewSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    artifact.svg,
  )}`;

  async function saveRecord() {
    if (savedRecord !== null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createResearchReport(artifact);
      setSavedRecord(saved);
    } catch (cause) {
      setError(messageFrom(cause, "研发报告记录无法保存"));
    } finally {
      setSaving(false);
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
            打印
          </button>
          <button
            className="button button--secondary"
            disabled
            title="下一步将支持 PDF、SVG 与结构化数据导出"
            type="button"
          >
            导出报告（下一步支持）
          </button>
        </div>
      </header>

      {error !== null ? (
        <p className="research-report-message has-error" role="alert">
          <Icon name="warning" size={16} />
          {error}
        </p>
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
    </section>
  );
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
