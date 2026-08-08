# Ninka FoodLab icon approval status

| Icon | Revision | State | Reference | Notes |
| --- | --- | --- | --- | --- |
| 原料库 (`ingredient-library`) | `r01` | `rejected` | `ingredient-library-reference.png` | Replaced after review: rotated droplet reuse made the four center marks inconsistent. Never integrated. |
| 原料库 (`ingredient-library`) | `r02` | `approved` | `ingredient-library-reference.png` | Explicitly approved by the user after four-seed revision; reconfirmed with the completed batch. Not integrated. |
| 原料 (`ingredient`) | `r01` | `approved` | `ingredient-reference.png` | Reference-measured pouch silhouette, single Grain mark, and two rules; explicitly approved with the completed batch. Not integrated. |
| 供应商 (`supplier`) | `r01` | `approved` | `supplier-reference.png` | Three-person Forest-only construction measured from the reference; explicitly approved with the completed batch. Not integrated. |
| 原料版本 (`ingredient-version`) | `r01` | `approved` | `ingredient-version-reference.png` | Layered cards with the approved vertically aligned four-seed signature; explicitly approved with the completed batch. Not integrated. |
| 配方库 (`recipe-library`) | `r01` | `rejected` | `recipe-library-reference.png` | Replaced after review: the left rear edge was too rounded and protruding. Never integrated. |
| 配方库 (`recipe-library`) | `r02` | `rejected` | `recipe-library-reference.png` + user screenshot | The rear edge was straightened, but this did not address the actual inward notch at the front folder junction. Never integrated. |
| 配方库 (`recipe-library`) | `r03` | `rejected` | `recipe-library-reference.png` + user clarification | Square front-folder junction was reviewed, then rejected in favor of restoring the original curved top-left corner. Never integrated. |
| 配方库 (`recipe-library`) | `r04` | `rejected` | `recipe-library-reference.png` + user clarification | Restored the wrong corner: the requested upper rear arc was still missing and the lower junction notch remained. Never integrated. |
| 配方库 (`recipe-library`) | `r05` | `approved` | `recipe-library-reference.png` + coordinate annotations | Retains the upper rear rounded corner and removes the lower junction notch; explicitly approved with the completed batch. Not integrated. |
| 配方工作台 (`recipe-workbench`) | `r01` | `rejected` | `recipe-workbench-reference.png` | Ingredient-convergence trace was rejected for poor fidelity to the desired direction. Never integrated. |
| 配方工作台 (`recipe-workbench`) | `r02` | `approved` | `recipe-workbench-reference-r02.png` | Explicitly approved by the user on 2026-08-06. Measured arc bounds, baseline height, and seed centers are aligned to the locked reference; local SVG validation and 16/20/24px checks passed. Master locked; Figma sync pending. Not integrated. |
| 配方版本 (`recipe-version`) | `r01` | `approved` | `../selected/batch-02/recipe-version-reference-main.png` | Explicitly approved by the user. Local overlay, 16/20/24px checks, and SVG validation passed; Figma sync is pending because the Starter MCP limit was reached. Not integrated. |
| 营养标签 (`nutrition-label`) | `c01` | `draft` | `../selected/batch-02/nutrition-label-reference.png` | User-selected structured-label direction locked on 2026-08-07. SVG tracing not started. Not integrated. |
| 研发报告 (`report`) | `c01` | `draft` | `../selected/batch-02/research-report-reference.png` | User-selected report-and-trend direction locked on 2026-08-07. SVG tracing not started. Not integrated. |
| 小试表 (`sample-sheet`) | `c01` | `draft` | `../selected/batch-02/sample-sheet-reference.png` | User-selected clipboard-and-trial-grid direction locked on 2026-08-07. SVG tracing not started. Not integrated. |

Allowed states: `draft`, `review`, `approved`, `rejected`, `integrated`.

Only the user can move an icon from `review` to `approved`. Application integration is a later, separate milestone.
