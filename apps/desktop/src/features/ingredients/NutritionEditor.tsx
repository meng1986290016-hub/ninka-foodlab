import { useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  NutrientDefinition,
  NutritionBasis,
  VariantNutrition,
} from "../../api/types";

interface NutritionEditorProps {
  api: DesktopApi;
  definitions: NutrientDefinition[];
  densityGPerMl: string | null;
  nutrition: VariantNutrition;
  onChange: (nutrition: VariantNutrition) => void;
  onDefinitionCreated: (definition: NutrientDefinition) => void;
}

export function NutritionEditor({
  api,
  definitions,
  densityGPerMl,
  nutrition,
  onChange,
  onDefinitionCreated,
}: NutritionEditorProps) {
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values = new Map(
    nutrition.values.map((value) => [value.nutrientDefinitionId, value.value]),
  );

  function updateValue(definitionId: string, value: string) {
    const nextValue = value === "" ? null : value;
    onChange({
      ...nutrition,
      values: definitions.map((definition) => ({
        nutrientDefinitionId: definition.id,
        value:
          definition.id === definitionId
            ? nextValue
            : (values.get(definition.id) ?? null),
      })),
    });
  }

  async function createDefinition() {
    const name = customName.trim();
    const unit = customUnit.trim();
    if (name === "" || unit === "") {
      setError("请填写成分名称和单位");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.createNutrientDefinition(name, unit);
      onDefinitionCreated(created);
      setCustomName("");
      setCustomUnit("");
      setAdding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "自定义成分创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="nutrition-editor">
      <label className="field field--full">
        <span>营养数据基准</span>
        <select
          onChange={(event) =>
            onChange({
              ...nutrition,
              basis: event.target.value as NutritionBasis,
            })
          }
          value={nutrition.basis}
        >
          <option value="per_100g">每 100 g</option>
          <option value="per_100ml">每 100 mL</option>
        </select>
      </label>

      {nutrition.basis === "per_100ml" && !densityGPerMl ? (
        <p className="nutrition-warning" role="status">
          可以保存原始营养数据，但无法换算为质量基准。
        </p>
      ) : null}

      <div className="nutrition-table field--full">
        <div className="nutrition-table__header">
          <span>营养成分</span>
          <span>数值</span>
          <span>单位</span>
        </div>
        {definitions.map((definition) => (
          <label className="nutrition-row" key={definition.id}>
            <span>{definition.name}</span>
            <input
              aria-label={`${definition.name}（${definition.unit}）`}
              inputMode="decimal"
              onChange={(event) =>
                updateValue(definition.id, event.target.value)
              }
              placeholder="未知"
              value={values.get(definition.id) ?? ""}
            />
            <span className="nutrition-unit">{definition.unit}</span>
          </label>
        ))}
      </div>

      <button
        className="text-button nutrition-add-button"
        onClick={() => setAdding((current) => !current)}
        type="button"
      >
        添加自定义成分
      </button>

      {adding ? (
        <div className="custom-nutrient-form">
          <label className="field">
            <span>自定义成分名称</span>
            <input
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="例如：乳糖"
              value={customName}
            />
          </label>
          <label className="field">
            <span>自定义成分单位</span>
            <input
              onChange={(event) => setCustomUnit(event.target.value)}
              placeholder="例如：g"
              value={customUnit}
            />
          </label>
          <button
            className="button button--secondary"
            disabled={creating}
            onClick={() => void createDefinition()}
            type="button"
          >
            {creating ? "正在创建…" : "创建成分"}
          </button>
        </div>
      ) : null}

      {error !== null ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="data-helper">
        留空表示未知；输入 0 表示已经确认该营养成分为 0。
      </p>
    </div>
  );
}
