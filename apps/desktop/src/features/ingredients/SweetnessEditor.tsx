import type { IngredientSweetness } from "../../api/types";

interface SweetnessEditorProps {
  densityGPerMl: string | null;
  sweetness: IngredientSweetness | null;
  onChange(sweetness: IngredientSweetness | null): void;
}

export function SweetnessEditor({
  densityGPerMl,
  sweetness,
  onChange,
}: SweetnessEditorProps) {
  function toggle(enabled: boolean) {
    if (enabled) {
      onChange({
        basis: "w_w_percent",
        content: null,
        relativeFactor: null,
      });
      return;
    }
    const hasValue =
      sweetness?.content !== null || sweetness?.relativeFactor !== null;
    if (
      hasValue &&
      !globalThis.confirm(
        "当前原料已经填写理论甜度数据，确认关闭并删除这些数值吗？",
      )
    ) {
      return;
    }
    onChange(null);
  }

  return (
    <section className="sweetness-editor field--full">
      <div className="sweetness-editor__heading">
        <div>
          <h3>理论甜度</h3>
          <p>用于估算成品的蔗糖当量，不代表感官检测结果。</p>
        </div>
        <label className="switch-field">
          <input
            checked={sweetness !== null}
            onChange={(event) => toggle(event.target.checked)}
            type="checkbox"
          />
          <span>{sweetness === null ? "未启用" : "已启用"}</span>
        </label>
      </div>

      {sweetness ? (
        <div className="sweetness-editor__fields">
          <label className="field">
            <span>甜味物质含量基准</span>
            <select
              onChange={(event) =>
                onChange({
                  ...sweetness,
                  basis: event.target.value as IngredientSweetness["basis"],
                })
              }
              value={sweetness.basis}
            >
              <option value="w_w_percent">w/w（g/100g 原料）</option>
              <option value="w_v_per_100ml">w/v（g/100mL 原料）</option>
            </select>
          </label>
          <label className="field">
            <span>甜味物质含量</span>
            <input
              aria-label="甜味物质含量"
              inputMode="decimal"
              onChange={(event) =>
                onChange({
                  ...sweetness,
                  content: event.target.value === "" ? null : event.target.value,
                })
              }
              placeholder="未知"
              value={sweetness.content ?? ""}
            />
          </label>
          <label className="field">
            <span>相对甜度倍数</span>
            <input
              aria-label="相对甜度倍数"
              inputMode="decimal"
              onChange={(event) =>
                onChange({
                  ...sweetness,
                  relativeFactor:
                    event.target.value === "" ? null : event.target.value,
                })
              }
              placeholder="蔗糖填写 1"
              value={sweetness.relativeFactor ?? ""}
            />
            <small>以蔗糖=1；例如赤藓糖醇可按采用的研发依据填写相应倍数。</small>
          </label>
          {sweetness.basis === "w_v_per_100ml" && !densityGPerMl ? (
            <p className="nutrition-warning" role="status">
              当前原料缺少密度，可以保存甜度原始数据，但配方暂时无法换算。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
