import {
  getNutritionLabelRulePack,
  type NutritionLabelCalculation,
  type NutritionLabelSourceValue,
} from "@food-rd/core";

import type { NutritionLabelDraftSaveInput } from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import {
  recipeEstimateSource,
  reconcileNutritionLabelDraft,
} from "./nutrition-label-draft";

interface NutritionSourceEditorProps {
  calculation: NutritionLabelCalculation | null;
  input: NutritionLabelDraftSaveInput;
  recipeVersion: RecipeVersion;
  selectedCode: string;
  onChange(input: NutritionLabelDraftSaveInput): void;
  onSelectCode(code: string): void;
}

export function NutritionSourceEditor({
  calculation,
  input,
  recipeVersion,
  selectedCode,
  onChange,
  onSelectCode,
}: NutritionSourceEditorProps) {
  const pack = getNutritionLabelRulePack(input.rulePackId);
  const codes = [
    ...pack.mandatoryNutrientCodes,
    ...input.optionalNutrientCodes,
  ];
  const selectedSource = input.sourceValues.find(
    (source) => source.nutrientCode === selectedCode,
  );

  function updateSource(
    code: string,
    update: (
      source: NutritionLabelSourceValue,
    ) => NutritionLabelSourceValue,
  ) {
    onChange({
      ...input,
      sourceValues: input.sourceValues.map((source) =>
        source.nutrientCode === code ? update(source) : source,
      ),
    });
  }

  function changeSourceKind(
    code: string,
    sourceKind: NutritionLabelSourceValue["sourceKind"],
  ) {
    const estimate = recipeEstimateSource(
      recipeVersion,
      code,
      input.basis,
    );
    updateSource(code, (current) =>
      sourceKind === "recipe_estimate"
        ? estimate
        : {
            ...current,
            value: current.value ?? estimate.value,
            sourceKind,
            sourceReference:
              current.sourceKind === "recipe_estimate"
                ? ""
                : current.sourceReference,
            observedAt:
              current.sourceKind === "recipe_estimate"
                ? null
                : current.observedAt,
            completeness:
              (current.value ?? estimate.value) !== null
                ? "complete"
                : "unknown",
          },
    );
    onSelectCode(code);
  }

  function addOptionalNutrient() {
    if (input.optionalNutrientCodes.includes("dietary_fiber")) return;
    onChange(
      reconcileNutritionLabelDraft(input, recipeVersion, {
        optionalNutrientCodes: [
          ...input.optionalNutrientCodes,
          "dietary_fiber",
        ],
      }),
    );
    onSelectCode("dietary_fiber");
  }

  return (
    <section className="nutrition-source-pane">
      <div className="nutrition-label-section-title">
        <div>
          <h2>数据来源复核</h2>
          <p>配方估算不会覆盖检测值或人工确认值</p>
        </div>
      </div>
      <div className="nutrition-source-table-scroll">
        <table className="nutrition-source-table">
          <thead>
            <tr>
              <th>营养项目</th>
              <th>配方估算</th>
              <th>检测 / 人工值</th>
              <th>最终来源</th>
              <th>完整性</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const rule = pack.nutrients.find(
                (candidate) => candidate.nutrientCode === code,
              );
              if (!rule) return null;
              const estimate =
                code === "energy"
                  ? calculation?.rows.find(
                      (row) => row.nutrientCode === "energy",
                    )?.rawValue ?? null
                  : recipeEstimateSource(
                      recipeVersion,
                      code,
                      input.basis,
                    ).value;
              const source = input.sourceValues.find(
                (candidate) => candidate.nutrientCode === code,
              );
              const issue = calculation?.issues.find(
                (candidate) =>
                  candidate.nutrientCode === code &&
                  candidate.severity === "error",
              );
              const complete = !issue && (code === "energy" || source?.value !== null);
              return (
                <tr
                  className={selectedCode === code ? "is-selected" : undefined}
                  key={code}
                  onClick={() => onSelectCode(code)}
                >
                  <th scope="row">{rule.name}</th>
                  <td>
                    {estimate === null
                      ? "未知"
                      : `${estimate} ${rule.unit}`}
                  </td>
                  <td>
                    {code === "energy" ? (
                      <span className="nutrition-source-table__automatic">
                        自动计算
                      </span>
                    ) : (
                      <label>
                        <span className="sr-only">
                          {rule.name}检测或人工值
                        </span>
                        <input
                          aria-label={`${rule.name}检测或人工值`}
                          disabled={
                            source?.sourceKind === "recipe_estimate"
                          }
                          inputMode="decimal"
                          onChange={(event) =>
                            updateSource(code, (current) => ({
                              ...current,
                              value:
                                event.target.value.trim() === ""
                                  ? null
                                  : event.target.value,
                              completeness:
                                event.target.value.trim() === ""
                                  ? "unknown"
                                  : "complete",
                            }))
                          }
                          value={
                            source?.sourceKind === "recipe_estimate"
                              ? ""
                              : source?.value ?? ""
                          }
                        />
                        <span>{rule.unit}</span>
                      </label>
                    )}
                  </td>
                  <td>
                    {code === "energy" ? (
                      <span>配方估算</span>
                    ) : (
                      <select
                        aria-label={`${rule.name}最终来源`}
                        onChange={(event) =>
                          changeSourceKind(
                            code,
                            event.target.value as NutritionLabelSourceValue["sourceKind"],
                          )
                        }
                        value={source?.sourceKind ?? "recipe_estimate"}
                      >
                        <option value="recipe_estimate">配方估算</option>
                        <option value="lab_result">检测结果</option>
                        <option value="manual_confirmation">人工确认</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        complete
                          ? "nutrition-source-status"
                          : "nutrition-source-status has-error"
                      }
                      title={issue?.message}
                    >
                      <Icon
                        name={complete ? "check" : "warning"}
                        size={16}
                      />
                      {complete ? "完整" : "缺失"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        className="nutrition-add-optional"
        disabled={input.optionalNutrientCodes.includes("dietary_fiber")}
        onClick={addOptionalNutrient}
        type="button"
      >
        <Icon name="plus" size={17} />
        {input.optionalNutrientCodes.includes("dietary_fiber")
          ? "已添加膳食纤维"
          : "添加可选营养项目"}
      </button>

      <section className="nutrition-source-evidence">
        <h3>
          来源凭证
          {selectedSource ? (
            <span>
              （基于选中行：
              {pack.nutrients.find(
                (rule) => rule.nutrientCode === selectedCode,
              )?.name ?? selectedCode}
              ）
            </span>
          ) : null}
        </h3>
        {selectedSource ? (
          <div className="nutrition-source-evidence__fields">
            <label>
              <span>来源类型</span>
              <select
                aria-label="来源类型"
                onChange={(event) =>
                  changeSourceKind(
                    selectedCode,
                    event.target.value as NutritionLabelSourceValue["sourceKind"],
                  )
                }
                value={selectedSource.sourceKind}
              >
                <option value="recipe_estimate">配方估算</option>
                <option value="lab_result">检测结果</option>
                <option value="manual_confirmation">人工确认</option>
              </select>
            </label>
            <label className="nutrition-source-evidence__reference">
              <span>来源参考</span>
              <input
                aria-label="来源参考"
                disabled={selectedSource.sourceKind === "recipe_estimate"}
                onChange={(event) =>
                  updateSource(selectedCode, (current) => ({
                    ...current,
                    sourceReference: event.target.value,
                  }))
                }
                placeholder="检测报告编号或人工复核记录"
                value={selectedSource.sourceReference ?? ""}
              />
            </label>
            <label>
              <span>观测日期</span>
              <input
                aria-label="观测日期"
                disabled={selectedSource.sourceKind === "recipe_estimate"}
                onChange={(event) =>
                  updateSource(selectedCode, (current) => ({
                    ...current,
                    observedAt: event.target.value || null,
                  }))
                }
                type="date"
                value={selectedSource.observedAt?.slice(0, 10) ?? ""}
              />
            </label>
          </div>
        ) : (
          <p>能量由供能营养素自动计算，无需单独填写来源。</p>
        )}
        <p className="nutrition-source-evidence__help">
          检测 / 人工值优先于配方估算作为最终值；若留空则使用配方估算。
        </p>
      </section>
    </section>
  );
}
