import type {
  Recipe,
  RecipeDraft,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import type { RecipeDraftSaveStatus } from "./useRecipeDraft";

interface RecipeHeaderProps {
  draft: RecipeDraft;
  hasFormulaInput: boolean;
  name: string;
  recipe: Recipe;
  saveStatus: RecipeDraftSaveStatus;
  onNameChange(value: string): void;
  onNameCommit(): void;
}

export function RecipeHeader({
  draft,
  hasFormulaInput,
  name,
  recipe,
  saveStatus,
  onNameChange,
  onNameCommit,
}: RecipeHeaderProps) {
  const invalidInput = draft.calculationIssues.some((issue) =>
    ["invalid_number", "negative_value"].includes(issue.code) ||
      (issue.code === "non_positive_value" && hasFormulaInput),
  );
  const status = invalidInput
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
      <label className="recipe-header__field recipe-header__name">
        <span>配方名称</span>
        <span className="recipe-header__input-wrap">
          <input
            aria-label="配方名称"
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
          disabled
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
      <button
        className="button button--primary recipe-version-button"
        disabled
        title="完成正式版本功能后启用"
        type="button"
      >
        保存为正式版本
      </button>
      <button
        aria-label="更多配方操作"
        className="recipe-icon-button"
        type="button"
      >
        <Icon name="more" size={19} />
      </button>
    </header>
  );
}
