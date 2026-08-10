import { useEffect, useRef } from "react";

import { Icon } from "../../components/Icon";
import type {
  RecipeVersionPreparation,
  RecipeVersionValidationIssue,
} from "./recipe-versioning";

interface RecipeVersionDialogProps {
  error: string | null;
  issues: RecipeVersionValidationIssue[];
  open: boolean;
  preparation: RecipeVersionPreparation | null;
  saving: boolean;
  versionNumber: number;
  onClose(): void;
  onConfirm(): void;
}

export function RecipeVersionDialog({
  error,
  issues,
  open,
  preparation,
  saving,
  versionNumber,
  onClose,
  onConfirm,
}: RecipeVersionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, saving]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;
  const snapshot = preparation?.input.snapshot ?? null;

  return (
    <div
      aria-label="关闭正式版本确认"
      className="recipe-version-dialog-backdrop"
      onMouseDown={(event) => {
        if (
          !saving &&
          event.currentTarget === event.target
        ) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-label={
          preparation === null
            ? "正式版本保存检查"
            : "确认保存正式版本"
        }
        aria-modal="true"
        className="recipe-version-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="recipe-version-dialog__icon">
              <Icon
                name={preparation === null ? "warning" : "recipe-version"}
                size={22}
              />
            </span>
            <div>
              <h2>
                {preparation === null
                  ? "暂时不能保存正式版本"
                  : `确认保存 V${versionNumber}`}
              </h2>
              <p>
                {preparation === null
                  ? "请处理以下问题后再保存。草稿仍会继续自动保存。"
                  : "保存后内容将冻结，后续修改会基于此版本生成工作草稿。"}
              </p>
            </div>
          </div>
          <button
            aria-label="关闭正式版本确认"
            className="recipe-icon-button"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={19} />
          </button>
        </header>

        {preparation === null ? (
          <ul className="recipe-version-validation-list">
            {issues.map((issue) => (
              <li key={`${issue.field}:${issue.message}`}>
                <strong>{issue.field}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : snapshot === null ? null : (
          <div className="recipe-version-preview">
            <dl>
              <div>
                <dt>配方名称</dt>
                <dd>{snapshot.recipe.name}</dd>
              </div>
              <div>
                <dt>项目</dt>
                <dd>{snapshot.items.length} 项</dd>
              </div>
              <div>
                <dt>投料合计</dt>
                <dd>{snapshot.calculation.inputMassGrams} g</dd>
              </div>
              <div>
                <dt>出成重量</dt>
                <dd>
                  {snapshot.finishedMassGrams === null
                    ? "未填写"
                    : `${snapshot.finishedMassGrams} g`}
                </dd>
              </div>
              <div>
                <dt>整批成本</dt>
                <dd>¥{snapshot.calculation.cost.batchTotal}</dd>
              </div>
              <div>
                <dt>数据完整度</dt>
                <dd>{snapshot.calculation.completeness.percent}%</dd>
              </div>
            </dl>
            {preparation.input.dependencyVersionIds.length > 0 ? (
              <section>
                <h3>引用的半成品版本</h3>
                <ul>
                  {snapshot.items
                    .filter((item) => item.kind === "recipe_version")
                    .map((item) =>
                      item.kind === "recipe_version" ? (
                        <li key={item.id}>
                          {item.recipeVersion.recipeName} V
                          {item.recipeVersion.versionNumber}
                        </li>
                      ) : null,
                    )}
                </ul>
              </section>
            ) : null}
            {preparation.warnings.length > 0 ? (
              <section className="recipe-version-warning">
                <h3>保存提醒</h3>
                <ul>
                  {preparation.warnings.map((warning, index) => (
                    <li key={`${warning.code}:${warning.itemId}:${index}`}>
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="page-error" role="alert">
            {error}
          </p>
        ) : null}

        <footer>
          <button
            className="button button--secondary"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            {preparation === null ? "返回修改" : "取消"}
          </button>
          {preparation === null ? null : (
            <button
              className="button button--primary"
              disabled={saving}
              onClick={onConfirm}
              type="button"
            >
              {saving
                ? "正在保存…"
                : `确认保存 V${versionNumber}`}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
