import { useState } from "react";
import Decimal from "decimal.js";

import type {
  RecipeTarget,
  RecipeTargetEvaluation,
} from "../../api/recipe-types";
import type { NutrientDefinition } from "../../api/types";
import { Icon } from "../../components/Icon";

interface RecipeTargetEditorProps {
  evaluations: RecipeTargetEvaluation[];
  nutrientDefinitions: NutrientDefinition[];
  targets: RecipeTarget[];
  onChange(targets: RecipeTarget[]): void;
}

export function RecipeTargetEditor({
  evaluations,
  nutrientDefinitions,
  targets,
  onChange,
}: RecipeTargetEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editing = editingId !== null;

  function openNew() {
    setEditingId("new");
    setMetricKey(
      nutrientDefinitions[0]
        ? `nutrition:${nutrientDefinitions[0].id}`
        : "cost:batch",
    );
    setMinimum("");
    setMaximum("");
    setError(null);
  }

  function openEdit(target: RecipeTarget) {
    setEditingId(target.id);
    setMetricKey(targetMetricKey(target));
    setMinimum(target.minimum ?? "");
    setMaximum(target.maximum ?? "");
    setError(null);
  }

  function closeEditor() {
    setEditingId(null);
    setError(null);
  }

  function saveTarget() {
    const validation = validateBounds(minimum, maximum);
    if (validation !== null) {
      setError(validation);
      return;
    }
    const metric = metricFromKey(metricKey, nutrientDefinitions);
    if (metric === null) {
      setError("请选择目标指标");
      return;
    }
    const target: RecipeTarget = {
      id:
        editingId === "new" || editingId === null
          ? createTargetId()
          : editingId,
      metric,
      minimum: minimum.trim() === "" ? null : minimum.trim(),
      maximum: maximum.trim() === "" ? null : maximum.trim(),
    };
    onChange(
      editingId === "new"
        ? [...targets, target]
        : targets.map((item) =>
            item.id === editingId ? target : item,
          ),
    );
    closeEditor();
  }

  return (
    <section
      aria-label="配方目标"
      className="recipe-result-section recipe-target-editor"
    >
      <h3>目标</h3>
      {targets.length === 0 && !editing ? (
        <p className="recipe-result-muted">
          尚未设置营养或成本目标。
        </p>
      ) : null}
      <div className="recipe-target-list">
        {targets.map((target) => {
          const label = targetLabel(target);
          const evaluation = evaluations.find(
            (item) => item.targetId === target.id,
          );
          return (
            <div className="recipe-target-row" key={target.id}>
              <span>
                <strong>{label}</strong>
                <small>{targetCondition(target)}</small>
              </span>
              <span
                className={`recipe-target-status is-${evaluation?.status ?? "unknown"}`}
              >
                {targetStatus(evaluation?.status)}
              </span>
              <button
                aria-label={`编辑${label}目标`}
                className="recipe-icon-button"
                onClick={() => openEdit(target)}
                type="button"
              >
                <Icon name="edit" size={14} />
              </button>
              <button
                aria-label={`删除${label}目标`}
                className="recipe-icon-button"
                onClick={() =>
                  onChange(
                    targets.filter((item) => item.id !== target.id),
                  )
                }
                type="button"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {editing ? (
        <div className="recipe-target-form">
          <label>
            <span>指标</span>
            <select
              aria-label="目标指标"
              onChange={(event) => setMetricKey(event.target.value)}
              value={metricKey}
            >
              <optgroup label="营养（每100g）">
                {nutrientDefinitions.map((definition) => (
                  <option
                    key={definition.id}
                    value={`nutrition:${definition.id}`}
                  >
                    {definition.name}（{definition.unit}）
                  </option>
                ))}
              </optgroup>
              <optgroup label="成本">
                <option value="cost:batch">整批成本</option>
                <option value="cost:per_kg">每 kg 成本</option>
                <option value="cost:per_100g">每 100g 成本</option>
              </optgroup>
            </select>
          </label>
          <div>
            <label>
              <span>下限</span>
              <input
                aria-label="目标下限"
                inputMode="decimal"
                onChange={(event) => setMinimum(event.target.value)}
                placeholder="可不填"
                value={minimum}
              />
            </label>
            <label>
              <span>上限</span>
              <input
                aria-label="目标上限"
                inputMode="decimal"
                onChange={(event) => setMaximum(event.target.value)}
                placeholder="可不填"
                value={maximum}
              />
            </label>
          </div>
          {error ? (
            <p className="recipe-target-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button
              className="button button--secondary"
              onClick={closeEditor}
              type="button"
            >
              取消
            </button>
            <button
              className="button button--primary"
              onClick={saveTarget}
              type="button"
            >
              保存目标
            </button>
          </footer>
        </div>
      ) : (
        <button
          className="recipe-add-target"
          onClick={openNew}
          type="button"
        >
          <Icon name="plus" size={16} />
          添加目标
        </button>
      )}
    </section>
  );
}

function targetMetricKey(target: RecipeTarget) {
  return target.metric.kind === "nutrition_per_100g"
    ? `nutrition:${target.metric.nutrientDefinitionId}`
    : `cost:${target.metric.basis}`;
}

function metricFromKey(
  key: string,
  definitions: NutrientDefinition[],
): RecipeTarget["metric"] | null {
  if (key.startsWith("nutrition:")) {
    const id = key.slice("nutrition:".length);
    const definition = definitions.find((item) => item.id === id);
    return definition
      ? {
          kind: "nutrition_per_100g",
          nutrientDefinitionId: definition.id,
          nutrientName: definition.name,
          unit: definition.unit,
        }
      : null;
  }
  if (key === "cost:batch") {
    return { kind: "cost", basis: "batch", unit: "CNY" };
  }
  if (key === "cost:per_kg") {
    return { kind: "cost", basis: "per_kg", unit: "CNY" };
  }
  if (key === "cost:per_100g") {
    return { kind: "cost", basis: "per_100g", unit: "CNY" };
  }
  return null;
}

function validateBounds(minimum: string, maximum: string) {
  if (minimum.trim() === "" && maximum.trim() === "") {
    return "请至少填写一个下限或上限";
  }
  try {
    const min =
      minimum.trim() === "" ? null : new Decimal(minimum.trim());
    const max =
      maximum.trim() === "" ? null : new Decimal(maximum.trim());
    if (min !== null && !min.isFinite()) throw new Error();
    if (max !== null && !max.isFinite()) throw new Error();
    if (min !== null && max !== null && min.gt(max)) {
      return "目标下限不能大于上限";
    }
  } catch {
    return "目标上下限必须是有效数字";
  }
  return null;
}

function targetLabel(target: RecipeTarget) {
  if (target.metric.kind === "nutrition_per_100g") {
    return `${target.metric.nutrientName}（每100g）`;
  }
  return {
    batch: "整批成本",
    per_kg: "每 kg 成本",
    per_100g: "每 100g 成本",
    per_serving: "每份成本",
    per_package: "每包装成本",
  }[target.metric.basis];
}

function targetCondition(target: RecipeTarget) {
  const unit =
    target.metric.kind === "nutrition_per_100g"
      ? target.metric.unit
      : "元";
  if (target.minimum !== null && target.maximum !== null) {
    return `${target.minimum}–${target.maximum} ${unit}`;
  }
  if (target.minimum !== null) {
    return `≥ ${target.minimum} ${unit}`;
  }
  return `≤ ${target.maximum ?? ""} ${unit}`;
}

function targetStatus(
  status: RecipeTargetEvaluation["status"] | undefined,
) {
  return {
    met: "已达到",
    below: "低于目标",
    above: "高于目标",
    unknown: "数据不足",
  }[status ?? "unknown"];
}

function createTargetId() {
  return globalThis.crypto?.randomUUID?.() ??
    `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
