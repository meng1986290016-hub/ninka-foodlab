import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  IngredientVariant,
  MaterialGroup,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import {
  DataQualityDrawer,
  type DataQualityDrawerContent,
} from "../data-quality/DataQualityDrawer";
import { buildCalculationDataGapReport } from "../data-quality/data-quality";
import {
  analyzeIngredientSubstitution,
  diagnoseRecipeDraft,
  type RecipeAgentDiagnosis,
  type RecipeAgentSubstitutionAnalysis,
  type RecipeAgentWorkbenchContext,
} from "../recipes/recipe-agent-analysis";

interface RecipeAgentWorkspaceProps {
  api: DesktopApi;
  busy: boolean;
  canUseModel: boolean;
  context: RecipeAgentWorkbenchContext;
  onOpenReferenceLibrary(): void;
  onRequestEstimate(): void;
  onRequestRetrospective(): void;
}

export function RecipeAgentWorkspace({
  api,
  busy,
  canUseModel,
  context,
  onOpenReferenceLibrary,
  onRequestEstimate,
  onRequestRetrospective,
}: RecipeAgentWorkspaceProps) {
  const [diagnosis, setDiagnosis] = useState<RecipeAgentDiagnosis | null>(null);
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [sourceItemId, setSourceItemId] = useState("");
  const [candidateVariantId, setCandidateVariantId] = useState("");
  const [substitution, setSubstitution] =
    useState<RecipeAgentSubstitutionAnalysis | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const ingredientItems = useMemo(
    () => context.draft.items.filter((item) => item.kind === "ingredient"),
    [context.draft.items],
  );
  const sourceItem = ingredientItems.find((item) => item.id === sourceItemId);
  const sourceGroup = sourceItem
    ? groups.find(
        (group) => group.id === sourceItem.ingredientVariant.materialGroupId,
      )
    : undefined;
  const candidateVariants = (sourceGroup?.variants ?? []).filter(
    (variant) =>
      variant.id !== sourceItem?.ingredientVariantId &&
      variant.archivedAt === null,
  );
  const diagnosisStale =
    diagnosis !== null &&
    diagnosis.sourceFingerprint !== context.draftFingerprint;

  useEffect(() => {
    setDiagnosis(null);
    setSubstitution(null);
    setSourceItemId("");
    setCandidateVariantId("");
    setNotice("");
    setError("");
  }, [context.recipe.id]);

  useEffect(() => {
    if (!sourceItemId && ingredientItems[0]) {
      setSourceItemId(ingredientItems[0].id);
    }
  }, [ingredientItems, sourceItemId]);

  useEffect(() => {
    setCandidateVariantId("");
    setSubstitution(null);
  }, [sourceItemId]);

  async function openSubstitution() {
    setSubstitutionOpen(true);
    setError("");
    if (groups.length > 0 || groupsLoading) return;
    setGroupsLoading(true);
    try {
      setGroups(await api.listMaterialGroups());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "供应商原料无法读取");
    } finally {
      setGroupsLoading(false);
    }
  }

  function runDiagnosis() {
    setError("");
    setNotice("");
    setDiagnosis(
      diagnoseRecipeDraft({
        recipe: context.recipe,
        draft: context.draft,
        referencedVersions: context.referencedVersions,
        nutrientDefinitions: context.nutrientDefinitions,
      }),
    );
  }

  function runSubstitution() {
    if (!sourceItem || !sourceGroup || !candidateVariantId) return;
    const variant = sourceGroup.variants.find(
      (candidate) => candidate.id === candidateVariantId,
    );
    if (!variant) return;
    setError("");
    setNotice("");
    try {
      setSubstitution(
        analyzeIngredientSubstitution({
          recipe: context.recipe,
          draft: context.draft,
          referencedVersions: context.referencedVersions,
          nutrientDefinitions: context.nutrientDefinitions,
          itemId: sourceItem.id,
          group: sourceGroup,
          variant,
        }),
      );
    } catch (cause) {
      setSubstitution(null);
      setError(cause instanceof Error ? cause.message : "替代原料试算失败");
    }
  }

  function applySubstitution() {
    if (!substitution || !sourceGroup) return;
    if (substitution.sourceFingerprint !== context.draftFingerprint) {
      setError("配方在分析后发生了变化，请重新试算再应用。");
      return;
    }
    const variant = sourceGroup.variants.find(
      (candidate) => candidate.id === substitution.candidate.variantId,
    );
    if (!variant) {
      setError("候选供应商版本已不可用，请重新选择。");
      return;
    }
    context.applyIngredientSubstitution(substitution.itemId, sourceGroup, variant);
    setNotice(
      `已将当前草稿中的原料替换为 ${variant.supplierName} · ${variant.modelOrSpecification || "未填写规格"}，等待自动保存。`,
    );
    setSubstitution(null);
  }

  return (
    <section className="agent-recipe-workspace" aria-label="当前配方 Agent 工具">
      <header>
        <div>
          <span>当前工作台</span>
          <strong>{context.recipe.name}</strong>
        </div>
        <small>{context.readOnly ? "只读" : "草稿实时上下文"}</small>
      </header>
      <p>
        诊断和替代分析使用当前界面数据与确定性计算引擎，不由模型心算。
      </p>
      <div className="agent-recipe-workspace__actions">
        <button disabled={busy} onClick={runDiagnosis} type="button">
          <Icon name="trend" size={15} />
          诊断当前配方
        </button>
        <button disabled={busy || ingredientItems.length === 0} onClick={() => void openSubstitution()} type="button">
          <Icon name="ingredient" size={15} />
          替代原料分析
        </button>
        <button
          disabled={busy || !canUseModel}
          onClick={onRequestEstimate}
          title={canUseModel ? undefined : "请先启用一个聊天模型"}
          type="button"
        >
          <Icon name="scale" size={15} />
          估算当前甜度
        </button>
        <button disabled={busy} onClick={onOpenReferenceLibrary} type="button">
          <Icon name="report" size={15} />
          参考资料库
        </button>
        <button
          className="is-wide"
          disabled={busy || !canUseModel}
          onClick={onRequestRetrospective}
          title={canUseModel ? undefined : "请先启用一个聊天模型"}
          type="button"
        >
          <Icon name="recipe-workbench" size={15} />
          复盘研发记录
        </button>
      </div>

      {diagnosis ? (
        <DiagnosisCard
          diagnosis={diagnosis}
          itemNames={new Map(
            context.draft.items.map((item) => [
              item.id,
              item.kind === "ingredient"
                ? `${item.materialName}（${item.ingredientVariant.supplierName}${item.ingredientVariant.modelOrSpecification ? ` · ${item.ingredientVariant.modelOrSpecification}` : ""}）`
                : item.kind === "recipe_version"
                  ? `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`
                  : `${item.materialNeed.materialName}（待补充原料）`,
            ]),
          )}
          stale={diagnosisStale}
        />
      ) : null}

      {substitutionOpen ? (
        <div className="agent-substitution-form">
          <strong>比较同一种原料的供应商版本</strong>
          <label>
            <span>当前原料</span>
            <select
              aria-label="要替代的配方原料"
              onChange={(event) => setSourceItemId(event.target.value)}
              value={sourceItemId}
            >
              {ingredientItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.materialName} · {item.ingredientVariant.supplierName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>候选供应商版本</span>
            <select
              aria-label="候选供应商版本"
              disabled={groupsLoading || candidateVariants.length === 0}
              onChange={(event) => setCandidateVariantId(event.target.value)}
              value={candidateVariantId}
            >
              <option value="">
                {groupsLoading
                  ? "正在读取…"
                  : candidateVariants.length === 0
                    ? "没有其他可用供应商版本"
                    : "请选择"}
              </option>
              {candidateVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variantLabel(variant)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="agent-substitution-form__analyze"
            disabled={!candidateVariantId || groupsLoading}
            onClick={runSubstitution}
            type="button"
          >
            计算替代影响
          </button>
        </div>
      ) : null}

      {substitution ? (
        <SubstitutionCard
          analysis={substitution}
          applyDisabled={
            context.readOnly ||
            substitution.sourceFingerprint !== context.draftFingerprint
          }
          onApply={applySubstitution}
        />
      ) : null}

      {notice ? <p className="agent-recipe-workspace__notice" role="status">{notice}</p> : null}
      {error ? <p className="agent-recipe-workspace__error" role="alert">{error}</p> : null}
    </section>
  );
}

function DiagnosisCard({
  diagnosis,
  itemNames,
  stale,
}: {
  diagnosis: RecipeAgentDiagnosis;
  itemNames: ReadonlyMap<string, string>;
  stale: boolean;
}) {
  const [dataDrawer, setDataDrawer] =
    useState<DataQualityDrawerContent | null>(null);
  return (
    <article className={`agent-diagnosis-card is-${diagnosis.status}`}>
      <header>
        <strong>配方诊断</strong>
        <span>{stale ? "草稿已变化" : diagnosisStatusLabel(diagnosis.status)}</span>
      </header>
      {stale ? (
        <p className="agent-diagnosis-card__stale">
          当前配方已在诊断后修改，请重新诊断后再参考结果。
        </p>
      ) : null}
      <p>{diagnosis.summary}</p>
      {diagnosis.calculation ? (
        <dl className="agent-analysis-metrics">
          <div>
            <dt>数据完整度</dt>
            <dd>
              {diagnosis.calculation.completeness.percent >= 100 ? (
                "100%"
              ) : (
                <button
                  className="data-quality-trigger"
                  onClick={() =>
                    setDataDrawer({
                      kind: "gaps",
                      report: buildCalculationDataGapReport(
                        "配方诊断",
                        diagnosis.calculation!,
                        itemNames,
                      ),
                      initialGrouping: "source",
                    })
                  }
                  type="button"
                >
                  {diagnosis.calculation.completeness.percent}% · 查看缺失
                </button>
              )}
            </dd>
          </div>
          <div><dt>批次成本</dt><dd>¥{money(diagnosis.calculation.cost.batchTotal)}</dd></div>
          <div><dt>得率</dt><dd>{diagnosis.calculation.yieldPercent ? `${number(diagnosis.calculation.yieldPercent)}%` : "未填写"}</dd></div>
        </dl>
      ) : null}
      <ul className="agent-diagnosis-card__findings">
        {diagnosis.findings.slice(0, 6).map((finding) => (
          <li className={`is-${finding.severity}`} key={`${finding.code}:${finding.title}`}>
            <strong>{finding.title}</strong>
            <span>{finding.detail}</span>
          </li>
        ))}
      </ul>
      {diagnosis.topCostContributors.length > 0 ? (
        <div className="agent-diagnosis-card__costs">
          <strong>主要原料成本</strong>
          {diagnosis.topCostContributors.map((item) => (
            <span key={item.id}>{item.name} <em>{item.percent}%</em></span>
          ))}
        </div>
      ) : null}
      {diagnosis.recommendations.length > 0 ? (
        <div className="agent-diagnosis-card__recommendations">
          <strong>建议下一步</strong>
          {diagnosis.recommendations.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <DataQualityDrawer
        content={dataDrawer}
        onClose={() => setDataDrawer(null)}
      />
    </article>
  );
}

function SubstitutionCard({
  analysis,
  applyDisabled,
  onApply,
}: {
  analysis: RecipeAgentSubstitutionAnalysis;
  applyDisabled: boolean;
  onApply(): void;
}) {
  const costDirection = new Decimal(analysis.batchCostDifference).cmp(0);
  return (
    <article className="agent-substitution-card">
      <header>
        <div>
          <span>替代影响</span>
          <strong>{analysis.source.supplierName} → {analysis.candidate.supplierName}</strong>
        </div>
        <small>{analysis.amount} {analysis.unit} 用量不变</small>
      </header>
      <dl className="agent-analysis-metrics">
        <div>
          <dt>批次成本</dt>
          <dd>¥{money(analysis.before.cost.batchTotal)} → ¥{money(analysis.after.cost.batchTotal)}</dd>
          <small className={costDirection > 0 ? "is-negative" : "is-positive"}>
            {signedMoney(analysis.batchCostDifference)}
          </small>
        </div>
        <div>
          <dt>每 kg 成本</dt>
          <dd>{signedMoney(analysis.perKgCostDifference)}</dd>
        </div>
        <div>
          <dt>完整度变化</dt>
          <dd>{signed(analysis.completenessDifference)}%</dd>
        </div>
      </dl>
      {analysis.nutrientDifferences.length > 0 ? (
        <div className="agent-substitution-card__nutrients">
          <strong>每 100 g 营养变化</strong>
          {analysis.nutrientDifferences.slice(0, 6).map((item) => (
            <span key={item.nutrientDefinitionId}>
              {item.name}
              <em>{signedNumber(item.difference)} {item.unit}</em>
            </span>
          ))}
        </div>
      ) : (
        <p className="agent-substitution-card__quiet">已知营养数据未发生变化。</p>
      )}
      <AllergenDifference analysis={analysis} />
      {analysis.warnings.length > 0 ? (
        <ul className="agent-substitution-card__warnings">
          {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      <button
        className="agent-substitution-card__apply"
        disabled={applyDisabled}
        onClick={onApply}
        type="button"
      >
        {applyDisabled ? "配方已变化，请重新试算" : "确认应用到当前草稿"}
      </button>
      <small className="agent-substitution-card__footnote">
        只替换当前行的供应商版本，不改变用量；感官、工艺与法规适用性仍需人工复核。
      </small>
    </article>
  );
}

function AllergenDifference({ analysis }: { analysis: RecipeAgentSubstitutionAnalysis }) {
  const changes = [
    ...analysis.allergensAdded.map((item) => `新增含有：${item}`),
    ...analysis.allergensRemoved.map((item) => `移除含有：${item}`),
    ...analysis.mayContainAdded.map((item) => `新增可能含有：${item}`),
    ...analysis.mayContainRemoved.map((item) => `移除可能含有：${item}`),
  ];
  if (changes.length === 0) return null;
  return (
    <div className="agent-substitution-card__allergens">
      <strong>过敏原变化</strong>
      {changes.map((change) => <span key={change}>{change}</span>)}
    </div>
  );
}

function variantLabel(variant: IngredientVariant) {
  const price = variant.currentPrice
    ? ` · ¥${number(variant.currentPrice)}/${variant.priceUnit}`
    : " · 价格缺失";
  return `${variant.supplierName} · ${variant.modelOrSpecification || "未填写规格"}${price}`;
}

function diagnosisStatusLabel(status: RecipeAgentDiagnosis["status"]) {
  return status === "healthy" ? "可继续试算" : status === "blocked" ? "存在阻断" : "需要复核";
}

function money(value: string) {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2);
}

function number(value: string) {
  return new Decimal(value).toDecimalPlaces(2).toString();
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function signedMoney(value: string) {
  const parsed = new Decimal(value);
  const prefix = parsed.gt(0) ? "+" : "";
  return `${prefix}¥${parsed.toDecimalPlaces(2).toFixed(2)}`;
}

function signedNumber(value: string) {
  const parsed = new Decimal(value);
  const prefix = parsed.gt(0) ? "+" : "";
  return `${prefix}${parsed.toDecimalPlaces(3).toString()}`;
}
