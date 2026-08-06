import type { MaterialGroup } from "../../api/types";
import { Icon } from "../../components/Icon";

interface MaterialGroupRowProps {
  group: MaterialGroup;
  onSelect: () => void;
  selected: boolean;
}

export function MaterialGroupRow({
  group,
  onSelect,
  selected,
}: MaterialGroupRowProps) {
  return (
    <button
      aria-label={`查看 ${group.name} 的具体原料`}
      aria-pressed={selected}
      className={
        selected ? "material-master-item is-selected" : "material-master-item"
      }
      onClick={onSelect}
      type="button"
    >
      <span className="material-master-item__content">
        <strong>{group.name}</strong>
        <small>{group.categoryName ?? "未分类"}</small>
      </span>
      <span
        className="material-master-item__count"
        title="每一组供应商与型号/规格计为一款；同一供应商的不同型号分别计数"
      >
        {group.variants.length} 款
      </span>
      <span className="material-master-item__arrow">
        <Icon name="chevron-down" size={15} />
      </span>
    </button>
  );
}
