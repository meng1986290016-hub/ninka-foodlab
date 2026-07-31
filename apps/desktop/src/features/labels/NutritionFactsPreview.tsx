import type {
  NutritionLabelCalculation,
  NutritionLabelDraftSaveInput,
} from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface NutritionFactsPreviewProps {
  calculation: NutritionLabelCalculation | null;
  calculating: boolean;
  input: NutritionLabelDraftSaveInput;
  recipeVersion: RecipeVersion;
}

export function NutritionFactsPreview({
  calculation,
  calculating,
  input,
  recipeVersion,
}: NutritionFactsPreviewProps) {
  const errors =
    calculation?.issues.filter((issue) => issue.severity === "error") ?? [];
  const sourceNames = [
    ...new Set(
      input.sourceValues.map((source) =>
        source.sourceKind === "recipe_estimate"
          ? "配方估算"
          : source.sourceKind === "lab_result"
            ? "检测结果"
            : "人工确认",
      ),
    ),
  ];
  return (
    <aside
      aria-label="营养成分表预览"
      className="nutrition-label-preview-pane"
    >
      <div className="nutrition-label-section-title">
        <div>
          <h2>营养成分表预览</h2>
          {calculating ? <span>正在重新计算…</span> : null}
        </div>
      </div>

      <div className="nutrition-facts-sheet">
        <table>
          <caption>营养成分表</caption>
          <thead>
            <tr>
              <th scope="col">项目</th>
              <th scope="col">{basisLabel(input)}</th>
              <th scope="col">NRV%</th>
            </tr>
          </thead>
          <tbody>
            {(calculation?.rows ?? []).map((row) => (
              <tr key={row.nutrientCode}>
                <th scope="row">{row.name}</th>
                <td>
                  {row.declaredValue === null
                    ? "未知"
                    : `${row.declaredValue} ${row.unit}`}
                </td>
                <td>
                  {row.nrvPercent === null ? "—" : `${row.nrvPercent}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {calculation?.requiredNotice ? (
          <p className="nutrition-facts-sheet__notice">
            {calculation.requiredNotice}
          </p>
        ) : null}
      </div>

      <section className="nutrition-publish-checks">
        <div className="nutrition-label-section-title">
          <h2>发布检查</h2>
          {errors.length > 0 ? <span>仍有 {errors.length} 项问题</span> : null}
        </div>
        <CheckRow
          complete={errors.length === 0}
          label={
            errors.length === 0
              ? "强制项目完整"
              : "强制项目仍有缺失或错误"
          }
        />
        <CheckRow complete label="配方版本已固定" />
        <CheckRow
          complete
          label={`规则包修订 ${
            calculation?.rulePack.revision ?? "正在读取"
          }`}
        />
        {errors.map((issue) => (
          <p className="nutrition-publish-checks__issue" key={issueKey(issue)}>
            <Icon name="warning" size={15} />
            {issue.message}
          </p>
        ))}
        <p className="nutrition-publish-checks__source">
          基于 {recipeVersion.snapshot.recipe.name} V
          {recipeVersion.versionNumber} · {sourceNames.join("与")}
        </p>
      </section>
    </aside>
  );
}

function CheckRow({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <p
      className={
        complete
          ? "nutrition-publish-checks__row"
          : "nutrition-publish-checks__row has-error"
      }
    >
      <Icon name={complete ? "check" : "warning"} size={16} />
      {label}
    </p>
  );
}

function basisLabel(input: NutritionLabelDraftSaveInput) {
  if (input.basis.kind === "per_100g") return "每100g";
  if (input.basis.kind === "per_100ml") return "每100mL";
  return input.basis.servingDescription?.trim() || "每份";
}

function issueKey(issue: NutritionLabelCalculation["issues"][number]) {
  return `${issue.code}:${issue.nutrientCode ?? "label"}:${issue.message}`;
}
