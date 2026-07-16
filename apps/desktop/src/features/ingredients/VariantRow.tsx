import type { IngredientVariant } from "../../api/types";
import { Icon } from "../../components/Icon";

interface VariantRowProps {
  materialName: string;
  onArchive: (variant: IngredientVariant) => void;
  onCopy?: ((variant: IngredientVariant) => void) | undefined;
  onEdit?: ((variant: IngredientVariant) => void) | undefined;
  variant: IngredientVariant;
}

function completenessClass(percent: number) {
  if (percent >= 85) return "completeness completeness--good";
  if (percent >= 70) return "completeness completeness--warning";
  return "completeness completeness--low";
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});

export function VariantRow({
  materialName,
  onArchive,
  onCopy,
  onEdit,
  variant,
}: VariantRowProps) {
  const recordName = `${materialName} · ${variant.supplierName}`;

  return (
    <tr className="variant-row">
      <td aria-label={`${materialName} 的供应商版本`}>
        <span className="variant-branch" aria-hidden="true" />
      </td>
      <td className="variant-category-placeholder">—</td>
      <td>{variant.supplierName}</td>
      <td title={variant.modelOrSpecification || undefined}>
        {variant.modelOrSpecification || "—"}
      </td>
      <td className="mono-cell">
        {variant.currentPrice === null
          ? "—"
          : `¥${variant.currentPrice}/${variant.priceUnit}`}
      </td>
      <td>
        <span className={completenessClass(variant.completeness.percent)}>
          {variant.completeness.percent}%
        </span>
      </td>
      <td className="mono-cell">
        {dateFormatter.format(new Date(variant.updatedAt))}
      </td>
      <td className="row-actions">
        <button
          aria-label={`编辑 ${recordName}`}
          className="icon-button"
          disabled={onEdit === undefined}
          onClick={() => onEdit?.(variant)}
          title={onEdit === undefined ? "供应商版本编辑器即将接入" : "编辑"}
          type="button"
        >
          <Icon name="edit" size={17} />
        </button>
        <button
          aria-label={`复制 ${recordName}`}
          className="icon-button"
          disabled={onCopy === undefined}
          onClick={() => onCopy?.(variant)}
          title={onCopy === undefined ? "选择目标供应商后可复制" : "复制"}
          type="button"
        >
          <Icon name="copy" size={17} />
        </button>
        <button
          aria-label={`归档 ${recordName}`}
          className="icon-button icon-button--danger"
          onClick={() => onArchive(variant)}
          title="归档"
          type="button"
        >
          <Icon name="archive" size={17} />
        </button>
      </td>
    </tr>
  );
}
