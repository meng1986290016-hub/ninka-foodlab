import type { VariantComparison } from "../../api/types";
import { Icon } from "../../components/Icon";

interface VariantComparisonDrawerProps {
  comparison: VariantComparison;
  materialName: string;
  onClose: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

function displayValue(key: string, value: string | null, unit: string | null) {
  if (value === null || value.trim() === "") return "未知";
  if (key === "updatedAt") return dateTimeFormatter.format(new Date(value));
  return unit === null ? value : `${value} ${unit}`;
}

export function VariantComparisonDrawer({
  comparison,
  materialName,
  onClose,
}: VariantComparisonDrawerProps) {
  return (
    <aside
      aria-label="原料版本比较"
      aria-modal="true"
      className="ingredient-drawer comparison-drawer"
      role="dialog"
    >
      <div className="drawer-header">
        <div>
          <h2>原料版本比较</h2>
          <p>{materialName}</p>
        </div>
        <button
          aria-label="关闭原料版本比较"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>项目</th>
              {comparison.variants.map((variant) => {
                const specification =
                  variant.modelOrSpecification.trim() || "未填写型号/规格";
                return (
                  <th
                    aria-label={`${variant.supplierName} · ${specification}`}
                    key={variant.id}
                  >
                    <strong>{variant.supplierName}</strong>
                    <small aria-hidden="true">{specification}</small>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {comparison.variants.map((variant) => {
                  const displayed = displayValue(
                    row.key,
                    row.values[variant.id] ?? null,
                    row.unit,
                  );
                  return (
                    <td
                      className={displayed === "未知" ? "comparison-unknown" : undefined}
                      key={variant.id}
                    >
                      {displayed}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="comparison-actions">
        <button className="button button--secondary" onClick={onClose} type="button">
          关闭
        </button>
      </div>
    </aside>
  );
}
