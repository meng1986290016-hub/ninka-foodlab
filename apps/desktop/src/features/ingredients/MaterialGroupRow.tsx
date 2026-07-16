import type { MaterialGroup } from "../../api/types";
import { Icon } from "../../components/Icon";

interface MaterialGroupRowProps {
  expanded: boolean;
  group: MaterialGroup;
  onToggle: () => void;
}

export function MaterialGroupRow({
  expanded,
  group,
  onToggle,
}: MaterialGroupRowProps) {
  const action = expanded ? "收起" : "展开";

  return (
    <tr className="material-group-row">
      <td className="material-group-name">
        <button
          aria-expanded={expanded}
          aria-label={`${action} ${group.name}`}
          className="disclosure-button"
          onClick={onToggle}
          type="button"
        >
          <span className={expanded ? "disclosure-icon is-expanded" : "disclosure-icon"}>
            <Icon name="chevron-down" size={16} />
          </span>
          <span>{group.name}</span>
        </button>
      </td>
      <td>{group.categoryName ?? "—"}</td>
      <td>
        <span className="variant-count">{group.variants.length} 家供应商</span>
      </td>
      <td aria-label="组级型号规格不适用">—</td>
      <td aria-label="组级价格不适用">—</td>
      <td aria-label="组级完整度不适用">—</td>
      <td aria-label="组级更新日期不显示">—</td>
      <td />
    </tr>
  );
}
