import type {
  Recipe,
  RecipeDraft,
} from "../../api/recipe-types";
import {
  recipeSchemeName,
  recipeSchemeStatus,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import type { RecipeDraftSaveStatus } from "./useRecipeDraft";

interface RecipeHeaderProps {
  draft: RecipeDraft;
  hasFormulaInput: boolean;
  name: string;
  recipe: Recipe;
  saveStatus: RecipeDraftSaveStatus;
  versionSaving: boolean;
  onNameChange(value: string): void;
  onNameCommit(): void;
  onKindChange(kind: Recipe["kind"]): void;
  onBack(): void;
  onOpenAgent(): void;
  onOpenSampleSheet(): void;
  onSaveVersion(): void;
}

export function RecipeHeader({
  draft,
  hasFormulaInput,
  name,
  recipe,
  saveStatus,
  versionSaving,
  onNameChange,
  onNameCommit,
  onKindChange,
  onBack,
  onOpenAgent,
  onOpenSampleSheet,
  onSaveVersion,
}: RecipeHeaderProps) {
  const invalidInput = draft.calculationIssues.some((issue) =>
    ["invalid_number", "negative_value"].includes(issue.code) ||
      (issue.code === "non_positive_value" && hasFormulaInput),
  );
  const inactive = recipeSchemeStatus(recipe) === "inactive";
  const status = inactive
    ? "该配方方案已停用"
    : invalidInput
    ? "存在无效输入，已保留本地草稿"
    : saveStatus === "saving"
      ? "正在自动保存…"
      : saveStatus === "failed"
        ? "自动保存失败"
        : saveStatus === "saved"
          ? "草稿已自动保存"
          : "本地草稿";

  return (
    <header className="recipe-header">
      <h1>配方工作台</h1>
      <span
        className={`recipe-header__scheme recipe-header__scheme--${recipeSchemeStatus(recipe)}`}
      >
        {recipeSchemeName(recipe)} · {schemeStatusLabel(recipeSchemeStatus(recipe))}
      </span>
      <label className="recipe-header__field recipe-header__name">
        <span>产品名称</span>
        <span className="recipe-header__input-wrap">
          <input
            aria-label="配方名称"
            disabled={inactive}
            onBlur={onNameCommit}
            onChange={(event) => onNameChange(event.target.value)}
            value={name}
          />
          <Icon name="edit" size={16} />
        </span>
      </label>
      <label className="recipe-header__field recipe-header__kind">
        <span>配方类型</span>
        <select
          aria-label="配方类型"
          disabled={inactive}
          onChange={(event) =>
            onKindChange(event.target.value as Recipe["kind"])
          }
          title="半成品保存正式版本后，可作为一个整体加入其他配方"
          value={recipe.kind}
        >
          <option value="formula">成品配方</option>
          <option value="semi_finished">半成品</option>
        </select>
      </label>
      <span
        aria-live="polite"
        className={
          invalidInput || saveStatus === "failed"
            ? "recipe-save-status has-error"
            : "recipe-save-status"
        }
      >
        <Icon
          name={invalidInput || saveStatus === "failed" ? "warning" : "check"}
          size={16}
        />
        {status}
      </span>
      <div className="recipe-header__actions">
        <button
          className="button button--secondary recipe-new-button"
          disabled={versionSaving}
          onClick={onBack}
          type="button"
        >
          <Icon name="arrow-left" size={17} />
          返回配方库
        </button>
        <button
          aria-label="Agent 诊断"
          className="button button--secondary recipe-agent-button"
          disabled={versionSaving}
          onClick={onOpenAgent}
          title="使用 Agent 诊断当前配方"
          type="button"
        >
          <Icon name="ai-assistant" size={17} />
          Agent 诊断
        </button>
        <button
          className="button button--secondary recipe-sample-button"
          disabled={
            versionSaving || draft.items.length === 0 || inactive
          }
          onClick={onOpenSampleSheet}
          type="button"
        >
          <Icon name="sample-sheet" size={17} />
          我要打样
        </button>
        <button
          className="button button--primary recipe-version-button"
          disabled={versionSaving || inactive}
          onClick={onSaveVersion}
          type="button"
        >
          <Icon name="recipe-version" size={17} />
          {versionSaving ? "正在保存…" : "保存为正式版本"}
        </button>
      </div>
    </header>
  );
}

function schemeStatusLabel(status: ReturnType<typeof recipeSchemeStatus>) {
  switch (status) {
    case "current":
      return "当前使用";
    case "approved":
      return "已批准替代";
    case "researching":
      return "研发中";
    case "inactive":
      return "已停用";
  }
}
