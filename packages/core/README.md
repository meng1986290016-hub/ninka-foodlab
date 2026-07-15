# @food-rd/core

食品研发工具的确定性计算引擎。该包不依赖 React、Tauri、SQLite 或大模型。

## 数值规则

- 所有公开输入和输出使用十进制字符串。
- 质量统一换算为克。
- 体积换算必须提供 g/mL 密度。
- 未知营养值和未知价格不会按零处理。
- 配方版本引用必须指向不可变的明确版本。

## 公开能力

- 单位换算：`toGrams`
- 营养计算：`calculateNutrition`
- 成本计算：`calculateCost`
- 目标判断：`evaluateTarget`
- 锁定与补足：`rebalanceFormula`
- 半成品展开：`flattenRecipeVersion`
- 完整配方计算：`calculateRecipe`

## 验证

运行 `pnpm typecheck`、`pnpm test` 和 `pnpm build`。
