import { useEffect, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  IngredientVariant,
  IngredientVariantInput,
  PriceUnit,
} from "../../api/types";
import { SupplierCombobox } from "./SupplierCombobox";

interface VariantBasicFieldsProps {
  api: DesktopApi;
  input: IngredientVariantInput;
  onChange: (input: IngredientVariantInput) => void;
  variant: IngredientVariant | null;
  showInternalCode?: boolean;
  allowReferenceCreation?: boolean;
}

const updateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function VariantBasicFields({
  api,
  input,
  onChange,
  variant,
  showInternalCode = true,
  allowReferenceCreation = true,
}: VariantBasicFieldsProps) {
  const [showMore, setShowMore] = useState(variant?.internalCode != null);

  useEffect(() => {
    setShowMore(variant?.internalCode != null);
  }, [variant]);

  function update<K extends keyof IngredientVariantInput>(
    key: K,
    value: IngredientVariantInput[K],
  ) {
    onChange({ ...input, [key]: value });
  }

  return (
    <div className="variant-fields">
      <SupplierCombobox
        allowCreate={allowReferenceCreation}
        api={api}
        onChange={(supplierId) => update("supplierId", supplierId ?? "")}
        value={input.supplierId || null}
      />

      <label className="field field--full">
        <span>型号/规格</span>
        <input
          onChange={(event) =>
            update("modelOrSpecification", event.target.value)
          }
          placeholder="例如：低热粉、MD-300"
          value={input.modelOrSpecification}
        />
      </label>

      <label className="field">
        <span>当前含税价</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            update("currentPrice", event.target.value || null)
          }
          placeholder="0.00"
          value={input.currentPrice ?? ""}
        />
      </label>

      <label className="field">
        <span>价格单位</span>
        <select
          onChange={(event) =>
            update("priceUnit", event.target.value as PriceUnit)
          }
          value={input.priceUnit}
        >
          <option value="kg">kg</option>
          <option value="g">g</option>
          <option value="L">L</option>
          <option value="mL">mL</option>
        </select>
      </label>

      <label className="field field--full">
        <span>密度（g/mL，可选）</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            update("densityGPerMl", event.target.value || null)
          }
          placeholder="体积数据换算为质量时使用"
          value={input.densityGPerMl ?? ""}
        />
      </label>

      <label className="field field--full">
        <span>数据来源</span>
        <input
          onChange={(event) => update("source", event.target.value)}
          placeholder="例如：供应商规格书、第三方检测"
          value={input.source}
        />
      </label>

      <label className="field field--full">
        <span>研发备注</span>
        <textarea
          maxLength={1000}
          onChange={(event) => update("researchNotes", event.target.value)}
          placeholder="记录溶解性、风味、适用产品或试验观察"
          rows={4}
          value={input.researchNotes}
        />
        <small>{input.researchNotes.length} / 1000</small>
      </label>

      {variant !== null ? (
        <div className="readonly-meta field--full">
          <span>最新更新日期</span>
          <strong>{updateFormatter.format(new Date(variant.updatedAt))}</strong>
          <small>保存内容变动后自动更新</small>
        </div>
      ) : null}

      {showInternalCode ? <div className="more-fields field--full">
        <button
          aria-expanded={showMore}
          className="text-button"
          onClick={() => setShowMore((current) => !current)}
          type="button"
        >
          {showMore ? "收起更多字段" : "更多字段"}
        </button>
        {showMore ? (
          <label className="field field--full">
            <span>内部编号（可选）</span>
            <input
              aria-label="内部编号"
              onChange={(event) =>
                update("internalCode", event.target.value || null)
              }
              placeholder="例如：RM-0004"
              value={input.internalCode ?? ""}
            />
          </label>
        ) : null}
      </div> : null}
    </div>
  );
}
