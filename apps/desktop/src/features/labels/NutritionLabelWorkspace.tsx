import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getNutritionLabelRulePack,
  recommendNutritionLabelRulePack,
  type NutritionLabelBasis,
  type NutritionLabelCalculation,
  type NutritionLabelRulePackId,
} from "@food-rd/core";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  NutritionLabel,
  NutritionLabelDraftSaveInput,
  NutritionLabelVersion,
} from "../../api/nutrition-label-types";
import type { Recipe, RecipeVersion } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import { ResearchReportPreviewWorkspace } from "../reports/ResearchReportPreviewWorkspace";
import { NutritionFactsPreview } from "./NutritionFactsPreview";
import { NutritionSourceEditor } from "./NutritionSourceEditor";
import {
  createNutritionLabelDraftInput,
  reconcileNutritionLabelDraft,
} from "./nutrition-label-draft";

interface NutritionLabelWorkspaceProps {
  api: DesktopApi;
  recipeId: string;
  recipeVersionId: string;
  onBack(): void;
}

interface LoadedLabelContext {
  recipe: Recipe;
  recipeVersion: RecipeVersion;
  label: NutritionLabel;
  versions: NutritionLabelVersion[];
}

const basisOptions: Array<{
  kind: NutritionLabelBasis["kind"];
  label: string;
}> = [
  { kind: "per_100g", label: "每 100g" },
  { kind: "per_100ml", label: "每 100mL" },
  { kind: "per_serving", label: "每份" },
];

export function NutritionLabelWorkspace({
  api,
  recipeId,
  recipeVersionId,
  onBack,
}: NutritionLabelWorkspaceProps) {
  const [context, setContext] = useState<LoadedLabelContext | null>(
    null,
  );
  const [input, setInput] =
    useState<NutritionLabelDraftSaveInput | null>(null);
  const [calculation, setCalculation] =
    useState<NutritionLabelCalculation | null>(null);
  const [selectedCode, setSelectedCode] = useState("protein");
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportVersion, setReportVersion] =
    useState<NutritionLabelVersion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recipe, recipeVersion, labels] = await Promise.all([
        api.getRecipe(recipeId),
        api.getRecipeVersion(recipeVersionId),
        api.listNutritionLabels(recipeId),
      ]);
      if (recipeVersion.recipeId !== recipe.id) {
        throw new Error("所选正式版本不属于当前配方");
      }
      const label =
        labels.find((candidate) => candidate.archivedAt === null) ??
        (await api.createNutritionLabel({
          recipeId,
          name: "营养成分表",
        }));
      const [draft, versions] = await Promise.all([
        api.getNutritionLabelDraft(label.id),
        api.listNutritionLabelVersions(label.id),
      ]);
      setContext({ recipe, recipeVersion, label, versions });
      setInput(
        createNutritionLabelDraftInput(label.id, recipeVersion, draft),
      );
    } catch (cause) {
      setError(messageFrom(cause, "营养标签无法读取"));
    } finally {
      setLoading(false);
    }
  }, [api, recipeId, recipeVersionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (input === null) return;
    let active = true;
    setCalculating(true);
    void api
      .calculateNutritionLabelPreview(input)
      .then((result) => {
        if (active) {
          setCalculation(result);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(messageFrom(cause, "营养标签无法计算"));
        }
      })
      .finally(() => {
        if (active) setCalculating(false);
      });
    return () => {
      active = false;
    };
  }, [api, input]);

  const implementationStatus = useMemo(() => {
    if (input === null) return "";
    const recommendation = recommendNutritionLabelRulePack(
      new Date().toISOString().slice(0, 10),
    );
    if (input.rulePackId === recommendation.recommendedRulePackId) {
      return input.rulePackId === "gb-28050-2025"
        ? "已实施"
        : "现行标准";
    }
    return "可提前采用";
  }, [input]);

  const newStandardIsEffective =
    recommendNutritionLabelRulePack(
      new Date().toISOString().slice(0, 10),
    ).recommendedRulePackId === "gb-28050-2025";

  async function saveDraft(showNotice = true) {
    if (input === null) return null;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveNutritionLabelDraft(input);
      setCalculation(saved.calculation);
      if (showNotice) setNotice("草稿已保存");
      return saved;
    } catch (cause) {
      setError(messageFrom(cause, "营养标签草稿无法保存"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (
      input === null ||
      context === null ||
      calculation?.publishable !== true
    ) {
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const saved = await saveDraft(false);
      if (saved === null) return;
      const version = await api.publishNutritionLabel(context.label.id);
      setContext((current) =>
        current
          ? {
              ...current,
              versions: [
                version,
                ...current.versions.filter(
                  (candidate) => candidate.id !== version.id,
                ),
              ],
            }
          : current,
      );
      setNotice(`已发布正式标签 V${version.versionNumber}`);
    } catch (cause) {
      setError(messageFrom(cause, "营养标签无法发布"));
    } finally {
      setPublishing(false);
    }
  }

  function changeRulePack(rulePackId: NutritionLabelRulePackId) {
    if (input === null || context === null) return;
    setInput(
      reconcileNutritionLabelDraft(input, context.recipeVersion, {
        rulePackId,
      }),
    );
    const pack = getNutritionLabelRulePack(rulePackId);
    const firstEditable = pack.mandatoryNutrientCodes.find(
      (code) => code !== "energy",
    );
    if (firstEditable) setSelectedCode(firstEditable);
    setNotice(null);
  }

  function changeBasis(kind: NutritionLabelBasis["kind"]) {
    if (input === null || context === null) return;
    const basis: NutritionLabelBasis =
      kind === "per_100g"
        ? { kind, quantity: "100", unit: "g" }
        : kind === "per_100ml"
          ? { kind, quantity: "100", unit: "mL" }
          : {
              kind,
              quantity:
                context.recipeVersion.snapshot.servingMassGrams ?? "100",
              unit: "g",
              servingDescription: "每份",
            };
    setInput(
      reconcileNutritionLabelDraft(input, context.recipeVersion, {
        basis,
      }),
    );
    setNotice(null);
  }

  if (loading) {
    return (
      <section className="nutrition-label-workspace nutrition-label-workspace--state">
        <p>正在读取营养标签…</p>
      </section>
    );
  }

  if (context === null || input === null) {
    return (
      <section className="nutrition-label-workspace nutrition-label-workspace--state">
        <Icon name="warning" size={28} />
        <h1>营养标签无法打开</h1>
        <p>{error ?? "请先从配方库选择一个正式版本。"}</p>
        <button className="button button--secondary" onClick={onBack} type="button">
          返回配方库
        </button>
      </section>
    );
  }

  if (reportVersion !== null) {
    return (
      <ResearchReportPreviewWorkspace
        api={api}
        nutritionLabelVersion={reportVersion}
        onBack={() => setReportVersion(null)}
        recipeVersion={context.recipeVersion}
      />
    );
  }

  const publishable =
    calculation?.publishable === true && !calculating && !publishing;
  return (
    <section className="nutrition-label-workspace">
      <header className="nutrition-label-header">
        <div className="nutrition-label-header__identity">
          <button
            className="nutrition-label-back"
            onClick={onBack}
            type="button"
          >
            <Icon name="arrow-left" size={17} />
            返回配方库
          </button>
          <div>
            <h1>营养标签工作台</h1>
            <p>
              {context.recipe.name} · 配方 V
              {context.recipeVersion.versionNumber}
            </p>
          </div>
        </div>
        <div className="nutrition-label-header__standard">
          <label>
            <span className="sr-only">营养标签标准</span>
            <select
              aria-label="营养标签标准"
              onChange={(event) =>
                changeRulePack(
                  event.target.value as NutritionLabelRulePackId,
                )
              }
              value={input.rulePackId}
            >
              <option value="gb-28050-2011">GB 28050-2011</option>
              <option value="gb-28050-2025">GB 28050-2025</option>
            </select>
          </label>
          <span>{implementationStatus}</span>
          {context.versions[0] ? (
            <span>已发布 V{context.versions[0].versionNumber}</span>
          ) : null}
        </div>
        <div className="nutrition-label-header__actions">
          <button
            className="button button--secondary"
            disabled={context.versions.length === 0}
            onClick={() => setReportVersion(context.versions[0] ?? null)}
            title={
              context.versions.length === 0
                ? "请先发布一个正式营养标签版本"
                : undefined
            }
            type="button"
          >
            预览研发报告
          </button>
          <button
            className="button button--secondary"
            disabled={saving || publishing}
            onClick={() => void saveDraft()}
            type="button"
          >
            {saving ? "正在保存…" : "保存草稿"}
          </button>
          <button
            className="button button--primary"
            disabled={!publishable}
            onClick={() => void publish()}
            title={
              calculation?.publishable === false
                ? "请先处理发布检查中的必填数据问题"
                : undefined
            }
            type="button"
          >
            {publishing ? "正在发布…" : "发布正式标签"}
          </button>
        </div>
      </header>

      <div className="nutrition-label-settings">
        <fieldset>
          <legend>标示基准</legend>
          <div className="nutrition-basis-options">
            {basisOptions.map((option) => (
              <label key={option.kind}>
                <input
                  checked={input.basis.kind === option.kind}
                  name="nutrition-label-basis"
                  onChange={() => changeBasis(option.kind)}
                  type="radio"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="nutrition-rounding-field">
          <span>修约方式</span>
          <select
            aria-label="修约方式"
            onChange={(event) =>
              setInput({
                ...input,
                roundingMode: event.target.value as typeof input.roundingMode,
              })
            }
            value={input.roundingMode}
          >
            <option value="half_up">四舍五入</option>
            <option value="half_even">银行家舍入</option>
          </select>
        </label>
        <p>
          {newStandardIsEffective
            ? "GB 28050-2025 已实施，新建正式标签推荐使用 2025 版"
            : input.rulePackId === "gb-28050-2011"
              ? "2027年3月16日前推荐使用 2011 版，可提前采用 2025 版"
              : "GB 28050-2025 可提前采用，并将于 2027年3月16日实施"}
        </p>
      </div>

      {error ? (
        <p className="nutrition-label-message has-error" role="alert">
          <Icon name="warning" size={16} />
          {error}
        </p>
      ) : notice ? (
        <p className="nutrition-label-message" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      ) : null}

      <div className="nutrition-label-workspace__body">
        <NutritionSourceEditor
          calculation={calculation}
          input={input}
          onChange={(next) => {
            setInput(next);
            setNotice(null);
          }}
          onSelectCode={setSelectedCode}
          recipeVersion={context.recipeVersion}
          selectedCode={selectedCode}
        />
        <NutritionFactsPreview
          calculating={calculating}
          calculation={calculation}
          input={input}
          recipeVersion={context.recipeVersion}
        />
      </div>
    </section>
  );
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
