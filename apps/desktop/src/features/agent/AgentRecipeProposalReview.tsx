import { useEffect, useMemo, useState } from "react";

import type {
  AgentRecipeProposal,
  AgentRecipeProposalDestination,
  AgentRecipeProposalItem,
  AgentRecipeProposalPayload,
} from "../../api/agent-recipe-types";
import type { DesktopApi } from "../../api/desktop-api";
import type { MaterialGroup } from "../../api/types";
import type { RecipeSummary, RecipeVersion } from "../../api/recipe-types";
import { recipeSchemeName } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface AgentRecipeProposalReviewProps {
  api: DesktopApi;
  proposal: AgentRecipeProposal;
  onAccepted(recipeId: string): void;
  onClose(): void;
  onUpdated(proposal: AgentRecipeProposal): void;
}

export function AgentRecipeProposalReview({
  api,
  proposal,
  onAccepted,
  onClose,
  onUpdated,
}: AgentRecipeProposalReviewProps) {
  const [payload, setPayload] = useState(() => structuredClone(proposal.payload));
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [destinationKind, setDestinationKind] = useState<"new_product" | "alternative">("new_product");
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [schemeName, setSchemeName] = useState("");
  const [evaluation, setEvaluation] = useState(proposal.evaluation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listMaterialGroups(), api.listRecipes()])
      .then(async ([nextGroups, nextRecipes]) => {
        const nextVersions = (
          await Promise.all(
            nextRecipes
              .filter((summary) => summary.latestVersion !== null)
              .map((summary) => api.listRecipeVersions(summary.recipe.id)),
          )
        ).flat();
        if (!active) return;
        setGroups(nextGroups);
        setRecipes(nextRecipes);
        setVersions(nextVersions);
        setSourceVersionId(nextVersions[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause, "复核资料无法读取"));
      });
    return () => {
      active = false;
    };
  }, [api]);

  const variantOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.variants
          .filter((variant) => variant.archivedAt === null)
          .map((variant) => ({ group, variant })),
      ),
    [groups],
  );

  function patch(next: Partial<AgentRecipeProposalPayload>) {
    setPayload((current) => ({ ...current, ...next }));
    setDirty(true);
  }

  function updateItem(id: string, update: (item: AgentRecipeProposalItem) => AgentRecipeProposalItem) {
    patch({ items: payload.items.map((item) => (item.id === id ? update(item) : item)) });
  }

  async function recalculate() {
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateAgentRecipeProposal(proposal.id, payload);
      setPayload(structuredClone(updated.payload));
      setEvaluation(updated.evaluation);
      setDirty(false);
      onUpdated(updated);
    } catch (cause) {
      setError(message(cause, "提案重新试算失败"));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError("");
    try {
      let current = proposal;
      if (dirty) {
        current = await api.updateAgentRecipeProposal(proposal.id, payload);
        setEvaluation(current.evaluation);
        onUpdated(current);
      }
      const destination: AgentRecipeProposalDestination =
        destinationKind === "new_product"
          ? { kind: "new_product" }
          : { kind: "alternative", sourceVersionId, schemeName };
      const accepted = await api.acceptAgentRecipeProposal({
        proposalId: current.id,
        destination,
      });
      onAccepted(accepted.recipe.id);
    } catch (cause) {
      setError(message(cause, "工作草稿创建失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-proposal-review-backdrop">
      <section aria-labelledby="agent-proposal-review-title" aria-modal="true" className="agent-proposal-review" role="dialog">
        <header>
          <div>
            <span>{payload.mode === "goal_design" ? "产品配方设计" : "产品标签逆向"}</span>
            <h2 id="agent-proposal-review-title">复核配方提案</h2>
          </div>
          <button aria-label="关闭配方提案复核" disabled={busy} onClick={onClose} type="button">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="agent-proposal-review__body">
          {payload.yieldAssumption === "assumed_100_percent" ? (
            <p className="agent-proposal-review__alert"><Icon name="warning" size={16} />得率未知，当前暂按 100% 试算。请结合工艺填写出成重量。</p>
          ) : null}
          <div className="agent-proposal-review__fields">
            <label><span>产品名称</span><input onChange={(event) => patch({ productName: event.target.value })} value={payload.productName} /></label>
            <label><span>配方类型</span><select onChange={(event) => patch({ recipeKind: event.target.value as AgentRecipeProposalPayload["recipeKind"] })} value={payload.recipeKind}><option value="formula">成品配方</option><option value="semi_finished">半成品</option></select></label>
            <label><span>计划投料总量（g）</span><input inputMode="decimal" onChange={(event) => patch({ plannedInputGrams: event.target.value })} value={payload.plannedInputGrams} /></label>
            <label><span>出成重量（g）</span><input inputMode="decimal" onChange={(event) => patch({ finishedMassGrams: event.target.value || null, yieldAssumption: event.target.value ? "provided" : "assumed_100_percent" })} placeholder="未知" value={payload.finishedMassGrams ?? ""} /></label>
          </div>

          <div className="agent-proposal-review__summary">
            <span>当前投料 <strong>{evaluation.calculation.inputMassGrams} g</strong></span>
            <span>预计成本 <strong>¥{Number(evaluation.calculation.cost.batchTotal).toFixed(2)}</strong></span>
            <span>完整度 <strong>{evaluation.calculation.completeness.percent}%</strong></span>
          </div>

          <div className="agent-proposal-review__table-wrap">
            <table>
              <thead><tr><th>原料与供应商版本</th><th>建议用量</th><th>估算范围 / 可信度</th></tr></thead>
              <tbody>
                {payload.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.kind === "ingredient" ? (
                        <select
                          aria-label={`${item.materialName}供应商版本`}
                          onChange={(event) => {
                            const selected = variantOptions.find(({ variant }) => variant.id === event.target.value);
                            if (!selected) return;
                            updateItem(item.id, (current) => current.kind === "ingredient" ? {
                              ...current,
                              ingredientVariantId: selected.variant.id,
                              ingredientUpdatedAt: selected.variant.updatedAt,
                              materialName: selected.group.name,
                              supplierName: selected.variant.supplierName,
                              modelOrSpecification: selected.variant.modelOrSpecification,
                            } : current);
                          }}
                          value={item.ingredientVariantId}
                        >
                          {variantOptions.map(({ group, variant }) => <option key={variant.id} value={variant.id}>{group.name} · {variant.supplierName}{variant.modelOrSpecification ? ` · ${variant.modelOrSpecification}` : ""}</option>)}
                        </select>
                      ) : (
                        <div className="agent-proposal-review__need"><strong>{item.materialName}</strong><small>待补充原料 · {item.desiredSpecification || item.missingReason}</small></div>
                      )}
                      {item.kind === "ingredient" && item.selectionReason ? <small>{item.selectionReason}</small> : null}
                    </td>
                    <td><div className="agent-proposal-review__amount"><input inputMode="decimal" onChange={(event) => updateItem(item.id, (current) => ({ ...current, amount: event.target.value }))} value={item.amount} /><select onChange={(event) => updateItem(item.id, (current) => ({ ...current, unit: event.target.value as "g" | "kg" }))} value={item.unit}><option value="g">g</option><option value="kg">kg</option></select></div></td>
                    <td>{item.estimatedMinimum ?? "—"}–{item.estimatedMaximum ?? "—"} {item.unit}<small>{confidenceLabel(item.confidence)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(payload.assumptions.length > 0 || payload.warnings.length > 0) ? (
            <section className="agent-proposal-review__notes"><h3>假设与风险</h3>{payload.assumptions.map((value) => <p key={`a:${value}`}>假设：{value}</p>)}{payload.warnings.map((value) => <p key={`w:${value}`}>风险：{value}</p>)}</section>
          ) : null}

          <section className="agent-proposal-review__destination">
            <h3>创建方式</h3>
            <label><input checked={destinationKind === "new_product"} name="proposal-destination" onChange={() => setDestinationKind("new_product")} type="radio" />新产品主配方</label>
            <label><input checked={destinationKind === "alternative"} name="proposal-destination" onChange={() => setDestinationKind("alternative")} type="radio" />现有产品替代配方</label>
            {destinationKind === "alternative" ? <div><select aria-label="替代配方来源版本" onChange={(event) => setSourceVersionId(event.target.value)} value={sourceVersionId}>{versions.map((version) => { const recipe = recipes.find((summary) => summary.recipe.id === version.recipeId)?.recipe; return <option key={version.id} value={version.id}>{recipe?.name ?? version.snapshot.recipe.name} · {recipe ? recipeSchemeName(recipe) : "主配方"} · V{version.versionNumber}</option>; })}</select><input aria-label="替代配方名称" onChange={(event) => setSchemeName(event.target.value)} placeholder="例如：供应商 B 可可粉版本" value={schemeName} /></div> : null}
          </section>
          {error ? <p className="page-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <button className="button button--secondary" disabled={busy} onClick={() => void recalculate()} type="button">重新试算</button>
          <span />
          <button className="button button--secondary" disabled={busy} onClick={onClose} type="button">取消</button>
          <button className="button button--primary" disabled={busy || (destinationKind === "alternative" && (!sourceVersionId || !schemeName.trim()))} onClick={() => void accept()} type="button">{busy ? "正在处理…" : "创建为工作草稿"}</button>
        </footer>
      </section>
    </div>
  );
}

function confidenceLabel(value: AgentRecipeProposalItem["confidence"]) {
  return value === "high" ? "高可信" : value === "medium" ? "中等可信" : "低可信";
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
