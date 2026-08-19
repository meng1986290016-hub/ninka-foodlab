import { useMemo, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  NutrientDefinition,
  NutrientDefinitionCategory,
  NutritionBasis,
  VariantNutrition,
} from "../../api/types";

interface NutritionEditorProps {
  api: DesktopApi;
  category?: NutrientDefinitionCategory;
  definitions: NutrientDefinition[];
  densityGPerMl: string | null;
  nutrition: VariantNutrition;
  onChange: (nutrition: VariantNutrition) => void;
  onDefinitionCreated: (definition: NutrientDefinition) => void;
  onDefinitionUpdated?: (definition: NutrientDefinition) => void;
  onDefinitionArchived?: (definitionId: string, archivedAt: string) => void;
  allowCustomDefinition?: boolean;
  showBasis?: boolean;
}

export function NutritionEditor({
  api,
  category = "nutrition",
  definitions,
  densityGPerMl,
  nutrition,
  onChange,
  onDefinitionCreated,
  onDefinitionUpdated,
  onDefinitionArchived,
  allowCustomDefinition = true,
  showBasis = true,
}: NutritionEditorProps) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [selectedDefinitionId, setSelectedDefinitionId] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values = useMemo(
    () =>
      new Map(
        nutrition.values.map((value) => [
          value.nutrientDefinitionId,
          value.value,
        ]),
      ),
    [nutrition.values],
  );
  const selectedIds = useMemo(() => new Set(values.keys()), [values]);
  const visibleDefinitions = definitions.filter(
    (definition) =>
      definition.category === category &&
      ((category === "nutrition" && definition.builtIn) ||
        selectedIds.has(definition.id)),
  );
  const availableDefinitions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    return definitions.filter(
      (definition) =>
        definition.category === category &&
        definition.archivedAt === null &&
        !selectedIds.has(definition.id) &&
        (query === "" ||
          `${definition.name} ${definition.unit}`
            .toLocaleLowerCase("zh-CN")
            .includes(query)),
    );
  }, [category, definitions, search, selectedIds]);
  const managedDefinitions = definitions.filter(
    (definition) => !definition.builtIn && definition.category === category,
  );

  function updateValue(definitionId: string, value: string) {
    const nextValue = value === "" ? null : value;
    const existing = nutrition.values.some(
      (item) => item.nutrientDefinitionId === definitionId,
    );
    onChange({
      ...nutrition,
      values: existing
        ? nutrition.values.map((item) =>
            item.nutrientDefinitionId === definitionId
              ? { ...item, value: nextValue }
              : item,
          )
        : [
            ...nutrition.values,
            { nutrientDefinitionId: definitionId, value: nextValue },
          ],
    });
  }

  function attachDefinition(definition: NutrientDefinition) {
    if (selectedIds.has(definition.id)) return;
    onChange({
      ...nutrition,
      values: [
        ...nutrition.values,
        { nutrientDefinitionId: definition.id, value: null },
      ],
    });
    setSelectedDefinitionId("");
    setSearch("");
  }

  function removeDefinition(definition: NutrientDefinition) {
    const value = values.get(definition.id) ?? null;
    if (
      value !== null &&
      !globalThis.confirm(
        `“${definition.name}”已有数值 ${value}${definition.unit}，确认从当前原料移除吗？`,
      )
    ) {
      return;
    }
    onChange({
      ...nutrition,
      values: nutrition.values.filter(
        (item) => item.nutrientDefinitionId !== definition.id,
      ),
    });
  }

  function resetDefinitionForm() {
    setEditingId(null);
    setCustomName("");
    setCustomUnit("");
    setAdding(false);
  }

  async function saveDefinition() {
    const name = customName.trim();
    const unit = customUnit.trim();
    if (name === "" || unit === "") {
      setError("请填写含量项名称和单位");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      if (editingId === null) {
        const created = await api.createNutrientDefinition(
          name,
          unit,
          category,
        );
        onDefinitionCreated(created);
        attachDefinition(created);
      } else {
        const updated = await api.updateNutrientDefinition(
          editingId,
          name,
          unit,
          category,
        );
        onDefinitionUpdated?.(updated);
      }
      resetDefinitionForm();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "自定义含量项保存失败",
      );
    } finally {
      setCreating(false);
    }
  }

  async function archiveDefinition(definition: NutrientDefinition) {
    if (
      !globalThis.confirm(
        `停用“${definition.name}”后，它不会再出现在新增下拉框中；已有原料数据仍会保留。确认停用吗？`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.archiveNutrientDefinition(definition.id);
      onDefinitionArchived?.(definition.id, new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模板停用失败");
    }
  }

  function startEditing(definition: NutrientDefinition) {
    setEditingId(definition.id);
    setCustomName(definition.name);
    setCustomUnit(definition.unit);
    setAdding(true);
  }

  return (
    <div className="nutrition-editor">
      <div className="editor-section-heading field--full">
        <div>
          <h3>{category === "nutrition" ? "营养成分" : "研发指标"}</h3>
          <p>
            {category === "nutrition"
              ? "维护标签与配方计算需要的基础营养数据。"
              : "只选择当前原料需要维护和参与配方汇总的研发指标。"}
          </p>
        </div>
      </div>

      {showBasis ? (
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
      ) : null}

      {showBasis && nutrition.basis === "per_100ml" && !densityGPerMl ? (
        <p className="nutrition-warning" role="status">
          可以保存原始数据，但无法换算为质量基准。
        </p>
      ) : null}

      <div className="nutrition-table field--full">
        <div className="nutrition-table__header">
          <span>{category === "nutrition" ? "营养成分" : "已选研发指标"}</span>
          <span>数值</span>
          <span>单位</span>
          <span aria-hidden="true" />
        </div>
        {visibleDefinitions.map((definition) => (
          <div className="nutrition-row" key={definition.id}>
            <span>
              {definition.name}
              {definition.archivedAt ? <small>（已停用）</small> : null}
            </span>
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
            {definition.builtIn && category === "nutrition" ? (
              <span />
            ) : (
              <button
                aria-label={`移除${definition.name}`}
                className="text-button"
                onClick={() => removeDefinition(definition)}
                type="button"
              >
                移除
              </button>
            )}
          </div>
        ))}
        {visibleDefinitions.length === 0 ? (
          <p className="data-helper">尚未选择研发指标。</p>
        ) : null}
      </div>

      {allowCustomDefinition ? (
        <div className="custom-definition-picker field--full">
          <div className="custom-definition-picker__heading">
            <strong>添加指标</strong>
            <span>从模板选择，或创建一个可供其他原料复用的模板。</span>
          </div>
          <label className="field field--full">
            <span>搜索已有模板</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入名称或单位筛选"
              value={search}
            />
          </label>
          <div className="custom-definition-picker__select-row">
            <label className="field">
              <span>选择模板</span>
              <select
                onChange={(event) => setSelectedDefinitionId(event.target.value)}
                value={selectedDefinitionId}
              >
                <option value="">请选择</option>
                {availableDefinitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}（{definition.unit}）
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button--secondary"
              disabled={selectedDefinitionId === ""}
              onClick={() => {
                const definition = definitions.find(
                  (item) => item.id === selectedDefinitionId,
                );
                if (definition) attachDefinition(definition);
              }}
              type="button"
            >
              添加
            </button>
          </div>
          <div className="custom-definition-picker__links">
            <button
              className="text-button"
              onClick={() => {
                resetDefinitionForm();
                setAdding(true);
              }}
              type="button"
            >
              新建全局模板
            </button>
            <button
              className="text-button"
              onClick={() => setManaging((current) => !current)}
              type="button"
            >
              {managing ? "收起模板管理" : "管理模板"}
            </button>
          </div>
        </div>
      ) : null}

      {allowCustomDefinition && adding ? (
        <div className="custom-nutrient-form">
          <p className="data-helper field--full">
            {editingId === null
              ? "确认创建后会立即成为全局模板，即使取消当前原料编辑也会保留。"
              : "模板一旦被原料使用，名称、单位和分类将锁定。"}
          </p>
          <label className="field">
            <span>含量项名称</span>
            <input
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="例如：乳糖"
              value={customName}
            />
          </label>
          <label className="field">
            <span>单位</span>
            <input
              onChange={(event) => setCustomUnit(event.target.value)}
              placeholder="例如：g"
              value={customUnit}
            />
          </label>
          <div className="custom-definition-actions">
            <button
              className="button button--secondary"
              disabled={creating}
              onClick={() => void saveDefinition()}
              type="button"
            >
              {creating
                ? "正在保存…"
                : editingId === null
                  ? "创建并选择"
                  : "保存修改"}
            </button>
            <button
              className="text-button"
              onClick={resetDefinitionForm}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {allowCustomDefinition && managing ? (
        <div className="custom-definition-manager field--full">
          {managedDefinitions.map((definition) => (
            <div key={definition.id}>
              <span>
                <strong>{definition.name}</strong>
                <small>
                  {definition.unit} · {definition.archivedAt ? "已停用" : "使用中"}
                </small>
              </span>
              {definition.archivedAt === null ? (
                <span>
                  <button
                    className="text-button"
                    onClick={() => startEditing(definition)}
                    type="button"
                  >
                    修改
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void archiveDefinition(definition)}
                    type="button"
                  >
                    停用
                  </button>
                </span>
              ) : null}
            </div>
          ))}
          {managedDefinitions.length === 0 ? (
            <p className="data-helper">暂无自定义模板。</p>
          ) : null}
        </div>
      ) : null}

      {error !== null ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="data-helper nutrition-editor__footnote">
        {category === "research"
          ? "留空表示未知；输入 0 表示已经确认数值为 0。未选择的研发指标不会参与配方汇总。"
          : "留空表示未知；输入 0 表示已经确认数值为 0。未选择的自定义项不会参与配方汇总。"}
      </p>
    </div>
  );
}
