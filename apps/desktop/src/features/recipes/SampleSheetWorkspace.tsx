import { useEffect, useMemo, useState } from "react";
import {
  calculateSamplingSheet,
  createSampleSheetXlsxExport,
  formatSamplingAmount,
  type SamplingBasis,
  type SamplingCalculation,
  type SamplingHierarchy,
  type SamplingRecipeNode,
  type SamplingTargetUnit,
} from "@food-rd/core";
import Decimal from "decimal.js";

import type { DesktopApi } from "../../api/desktop-api";
import {
  createSampleSheetFilePicker,
  type SampleSheetFilePicker,
} from "../../api/sample-sheet-file-picker";
import type {
  Recipe,
  RecipeDraft,
  RecipeVersion,
} from "../../api/recipe-types";
import { recipeSchemeName } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import { loadRecipeVersionClosure } from "./recipe-current-price";
import {
  buildSamplingSourceFromDraft,
  buildSamplingSourceFromVersion,
  type SampleSheetLaunch,
  type SamplingSourceBuildResult,
} from "./sample-sheet-source";

interface SampleSheetWorkspaceProps {
  api: DesktopApi;
  launch: SampleSheetLaunch;
  onBack(): void;
  filePicker?: SampleSheetFilePicker;
  now?: () => Date;
}

interface SourceContext {
  recipe: Recipe;
  draft: RecipeDraft | null;
  draftReferences: RecipeVersion[];
  versions: RecipeVersion[];
}

interface BuiltSource {
  source: SamplingRecipeNode;
  referencedRecipes: Record<string, SamplingRecipeNode>;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function SampleSheetWorkspace({
  api,
  launch,
  onBack,
  filePicker,
  now = () => new Date(),
}: SampleSheetWorkspaceProps) {
  const [defaultFilePicker] = useState(createSampleSheetFilePicker);
  const [context, setContext] = useState<SourceContext | null>(null);
  const [sourceKey, setSourceKey] = useState("");
  const [builtSource, setBuiltSource] = useState<BuiltSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [basis, setBasis] = useState<SamplingBasis>("finished_output");
  const [hierarchy, setHierarchy] =
    useState<SamplingHierarchy>("direct");
  const [targetAmount, setTargetAmount] = useState("500");
  const [targetUnit, setTargetUnit] =
    useState<SamplingTargetUnit>("g");

  useEffect(() => {
    document.body.classList.add("sample-sheet-active");
    return () => document.body.classList.remove("sample-sheet-active");
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      if (launch.origin === "workbench") {
        const versions = await api.listRecipeVersions(launch.recipe.id);
        return {
          recipe: launch.recipe,
          draft: launch.draft,
          draftReferences: launch.referencedVersions,
          versions,
        } satisfies SourceContext;
      }
      const [recipe, draft, versions] = await Promise.all([
        api.getRecipe(launch.recipeId),
        api.getRecipeDraft(launch.recipeId),
        api.listRecipeVersions(launch.recipeId),
      ]);
      return {
        recipe,
        draft: recipe.archivedAt === null ? draft : null,
        draftReferences: [],
        versions,
      } satisfies SourceContext;
    };
    void load()
      .then((loaded) => {
        if (!active) return;
        const versions = [...loaded.versions].sort(
          (left, right) => right.versionNumber - left.versionNumber,
        );
        const nextContext = { ...loaded, versions };
        setContext(nextContext);
        const initial =
          launch.origin === "workbench"
            ? "draft"
            : launch.initialVersionId !== null &&
                versions.some((version) => version.id === launch.initialVersionId)
              ? launch.initialVersionId
              : versions[0]?.id ?? (loaded.draft ? "draft" : "");
        setSourceKey(initial);
        if (initial === "") setError("该配方还没有可用于打样的草稿或正式版本");
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause, "打样来源无法读取"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, launch]);

  useEffect(() => {
    if (context === null || sourceKey === "") return;
    let active = true;
    setSourceLoading(true);
    setBuiltSource(null);
    setError(null);
    const build = async (): Promise<SamplingSourceBuildResult> => {
      if (sourceKey === "draft") {
        if (context.draft === null) {
          return { ok: false, message: "当前配方没有可用草稿" };
        }
        const references =
          context.draftReferences.length > 0
            ? context.draftReferences
            : await loadDraftReferences(api, context.draft);
        return buildSamplingSourceFromDraft(
          context.recipe,
          context.draft,
          references,
        );
      }
      const version = context.versions.find((item) => item.id === sourceKey);
      if (version === undefined) {
        return { ok: false, message: "找不到所选正式版本" };
      }
      const references = await loadRecipeVersionClosure(
        (id) => api.getRecipeVersion(id),
        version,
      );
      return buildSamplingSourceFromVersion(version, references);
    };
    void build()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setBuiltSource(result);
        if (result.source.finishedMassGrams === null) {
          setBasis("planned_input");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause, "打样配料无法计算"));
      })
      .finally(() => {
        if (active) setSourceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, context, sourceKey]);

  const calculation = useMemo(() => {
    if (builtSource === null) return null;
    return calculateSamplingSheet({
      ...builtSource,
      basis,
      hierarchy,
      targetAmount,
      targetUnit,
    });
  }, [basis, builtSource, hierarchy, targetAmount, targetUnit]);
  const value = calculation?.ok ? calculation.value : null;
  const calculationError =
    calculation !== null && !calculation.ok
      ? calculation.issues[0]?.message ?? "打样配料无法计算"
      : null;
  const sourceLabel = builtSource?.source.versionLabel ?? "";
  const generatedDate = dateFormatter.format(now());
  const recipeDisplayName = context === null
    ? ""
    : `${context.recipe.name} · ${recipeSchemeName(context.recipe)}`;

  function printSheet() {
    if (value === null) return;
    setNotice(null);
    window.print();
  }

  async function exportExcel() {
    if (context === null || value === null || builtSource === null || exporting) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const bytes = createSampleSheetXlsxExport({
        recipeName: recipeDisplayName,
        sourceLabel,
        basisLabel: basisLabel(basis),
        targetAmountLabel: targetLabel(targetAmount, targetUnit),
        generatedDate,
        rows: value.lines.map((line) => ({
          name: lineName(line.name, line.sourcePath),
          supplierAndSpecification: supplierLabel(
            line.supplierName,
            line.specification,
          ),
          requiredAmount: lineAmountLabel(line),
        })),
      });
      const defaultName = safeFileName(`${context.recipe.name}-${recipeSchemeName(context.recipe)}-${sourceLabel}-打样配料单`);
      const destinationPath = await (
        filePicker ?? defaultFilePicker
      ).pickDestination(defaultName);
      if (destinationPath === null) return;
      await api.exportSampleSheet({
        destinationPath,
        fileName: `${defaultName}.xlsx`,
        bytesBase64: bytesToBase64(bytes),
      });
      setNotice("Excel 配料单已导出");
    } catch (cause) {
      setError(messageFrom(cause, "Excel 配料单无法导出"));
    } finally {
      setExporting(false);
    }
  }

  if (loading || context === null) {
    return (
      <section className="sample-sheet-workspace sample-sheet-workspace--loading">
        <p>{error ?? "正在准备打样配料单…"}</p>
      </section>
    );
  }

  return (
    <section className="sample-sheet-workspace">
      <div className="sample-sheet-screen">
        <header className="sample-sheet-header">
          <div className="sample-sheet-header__identity">
            <button className="sample-sheet-back" onClick={onBack} type="button">
              <Icon name="arrow-left" size={17} />
              {launch.origin === "workbench" ? "返回配方工作台" : "返回配方库"}
            </button>
            <div>
              <h1>打样配料单</h1>
              <label>
                <span>{recipeDisplayName}</span>
                <select
                  aria-label="打样来源"
                  disabled={sourceLoading}
                  onChange={(event) => setSourceKey(event.target.value)}
                  value={sourceKey}
                >
                  {context.draft ? (
                    <option value="draft">
                      {launch.origin === "workbench"
                        ? "当前工作台草稿（含未保存修改）"
                        : "当前草稿"}
                    </option>
                  ) : null}
                  {context.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      V{version.versionNumber} 正式版本
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="sample-sheet-header__actions">
            <button
              className="button button--secondary"
              disabled={value === null}
              onClick={printSheet}
              type="button"
            >
              <Icon name="printer" size={17} />
              打印
            </button>
            <button
              className="button button--primary"
              disabled={value === null || exporting}
              onClick={() => void exportExcel()}
              type="button"
            >
              <Icon name="export" size={17} />
              {exporting ? "正在导出…" : "导出 Excel"}
            </button>
          </div>
        </header>

        <div className="sample-sheet-controls">
          <fieldset>
            <legend>计算依据</legend>
            <div className="sample-sheet-segmented">
              <button
                className={basis === "finished_output" ? "is-active" : undefined}
                disabled={builtSource?.source.finishedMassGrams === null}
                onClick={() => setBasis("finished_output")}
                title={
                  builtSource?.source.finishedMassGrams === null
                    ? "原配方未填写出成重量"
                    : undefined
                }
                type="button"
              >
                期望成品量
              </button>
              <button
                className={basis === "planned_input" ? "is-active" : undefined}
                onClick={() => setBasis("planned_input")}
                type="button"
              >
                计划投料量
              </button>
            </div>
          </fieldset>
          <label className="sample-sheet-target">
            <span>打样量</span>
            <input
              aria-label="打样量"
              inputMode="decimal"
              onChange={(event) => setTargetAmount(event.target.value)}
              value={targetAmount}
            />
            <select
              aria-label="打样量单位"
              onChange={(event) => setTargetUnit(event.target.value as SamplingTargetUnit)}
              value={targetUnit}
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
          </label>
          <fieldset>
            <legend>清单层级</legend>
            <div className="sample-sheet-segmented">
              <button
                className={hierarchy === "direct" ? "is-active" : undefined}
                onClick={() => setHierarchy("direct")}
                type="button"
              >
                直接投料
              </button>
              <button
                className={hierarchy === "expanded" ? "is-active" : undefined}
                onClick={() => setHierarchy("expanded")}
                type="button"
              >
                展开到底层原料
              </button>
            </div>
          </fieldset>
          <button
            className="button button--primary sample-sheet-recalculate"
            disabled={builtSource === null}
            onClick={() => setNotice("已按当前设置重新计算")}
            type="button"
          >
            重新计算
          </button>
        </div>

        {error || calculationError ? (
          <p className="sample-sheet-message has-error" role="alert">
            <Icon name="warning" size={16} />
            {error ?? calculationError}
          </p>
        ) : notice ? (
          <p className="sample-sheet-message" role="status">
            <Icon name="check" size={16} />
            {notice}
          </p>
        ) : null}

        {value ? (
          <>
            <dl className="sample-sheet-summary">
              <SummaryItem label="原配方成品" value={massLabel(value.sourceFinishedMassGrams)} />
              <SummaryItem label="原投料" value={massLabel(value.sourceInputMassGrams)} />
              <SummaryItem label="得率" value={percentLabel(value.yieldPercent)} />
              <SummaryItem label="缩放倍数" value={shortDecimal(value.scaleFactor)} />
              <SummaryItem label="本次预计投料" value={massLabel(value.expectedInputMassGrams)} />
            </dl>

            <div className="sample-sheet-table-frame">
              <div className="sample-sheet-table-title">
                <h2>本次配料清单</h2>
                <span>{value.lines.length} 项</span>
              </div>
              <div className="sample-sheet-table-scroll">
                <table aria-label="网页打样配料清单" className="sample-sheet-table">
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>原料 / 半成品</th>
                      <th>供应商与规格</th>
                      <th>本次应添加量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {value.lines.map((line, index) => (
                      <tr key={`${line.id}:${line.sourcePath.join("/")}:${index}`}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{line.name}</strong>
                          {line.kind === "recipe_version" ? <small>半成品</small> : null}
                          {line.sourcePath.length > 0 ? (
                            <span>来源：{line.sourcePath.join(" › ")}</span>
                          ) : null}
                        </td>
                        <td>{supplierLabel(line.supplierName, line.specification)}</td>
                        <td>
                          <strong>{formatSamplingAmount(line.amount, line.unit).label}</strong>
                          {line.unit === "mL" || line.unit === "L" ? (
                            <small>≈ {formatSamplingAmount(line.massGrams, "g").label}</small>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>合计预计投料</td>
                      <td>{massLabel(value.expectedInputMassGrams)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <p className="sample-sheet-info">
              <Icon name="warning" size={17} />
              打印与 Excel 会增加“实际称量”和“备注”空白栏。当前打样不会保存为记录。
            </p>
          </>
        ) : sourceLoading ? (
          <div className="sample-sheet-state">正在读取配方层级…</div>
        ) : null}
      </div>

      {value ? (
        <PrintSheet
          basis={basis}
          date={generatedDate}
          recipeName={recipeDisplayName}
          sourceLabel={sourceLabel}
          targetAmount={targetLabel(targetAmount, targetUnit)}
          value={value}
        />
      ) : null}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PrintSheet({
  basis,
  date,
  recipeName,
  sourceLabel,
  targetAmount,
  value,
}: {
  basis: SamplingBasis;
  date: string;
  recipeName: string;
  sourceLabel: string;
  targetAmount: string;
  value: SamplingCalculation;
}) {
  return (
    <article className="sample-sheet-print">
      <h1>{recipeName}打样配料单</h1>
      <dl>
        <div><dt>来源版本</dt><dd>{sourceLabel}</dd></div>
        <div><dt>计算依据</dt><dd>{basisLabel(basis)}</dd></div>
        <div><dt>打样量</dt><dd>{targetAmount}</dd></div>
        <div><dt>生成日期</dt><dd>{date}</dd></div>
      </dl>
      <table aria-label="打印打样配料清单">
        <thead><tr><th>序号</th><th>原料 / 半成品</th><th>供应商与规格</th><th>应添加量</th><th>实际称量</th><th>备注</th></tr></thead>
        <tbody>
          {value.lines.map((line, index) => (
            <tr key={`${line.id}:print:${index}`}>
              <td>{index + 1}</td>
              <td>{lineName(line.name, line.sourcePath)}</td>
              <td>{supplierLabel(line.supplierName, line.specification)}</td>
              <td>{lineAmountLabel(line)}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p>合计预计投料：{massLabel(value.expectedInputMassGrams)}</p>
    </article>
  );
}

async function loadDraftReferences(api: DesktopApi, draft: RecipeDraft) {
  const ids = [
    ...new Set(
      draft.items.flatMap((item) =>
        item.kind === "recipe_version" ? [item.recipeVersionId] : [],
      ),
    ),
  ];
  const roots = await Promise.all(ids.map((id) => api.getRecipeVersion(id)));
  const closures = await Promise.all(
    roots.map((root) =>
      loadRecipeVersionClosure((id) => api.getRecipeVersion(id), root),
    ),
  );
  return [...new Map([...roots, ...closures.flat()].map((item) => [item.id, item])).values()];
}

function lineAmountLabel(line: { amount: string; unit: "mg" | "g" | "kg" | "mL" | "L"; massGrams: string }) {
  const primary = formatSamplingAmount(line.amount, line.unit).label;
  return line.unit === "mL" || line.unit === "L"
    ? `${primary}（≈ ${formatSamplingAmount(line.massGrams, "g").label}）`
    : primary;
}

function supplierLabel(supplier: string | null, specification: string | null) {
  return [supplier, specification].filter((value) => value && value.trim()).join(" · ") || "—";
}

function lineName(name: string, sourcePath: string[]) {
  return sourcePath.length === 0 ? name : `${name}（${sourcePath.join(" › ")}）`;
}

function basisLabel(basis: SamplingBasis) {
  return basis === "finished_output" ? "期望成品量" : "计划投料量";
}

function targetLabel(amount: string, unit: SamplingTargetUnit) {
  try {
    return formatSamplingAmount(amount, unit).label;
  } catch {
    return `${amount} ${unit}`;
  }
}

function massLabel(value: string | null) {
  return value === null ? "—" : formatSamplingAmount(value, "g").label;
}

function percentLabel(value: string | null) {
  return value === null ? "—" : `${shortDecimal(value)}%`;
}

function shortDecimal(value: string) {
  return new Decimal(value).toDecimalPlaces(4).toFixed().replace(/\.0+$/, "");
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "打样配料单";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
