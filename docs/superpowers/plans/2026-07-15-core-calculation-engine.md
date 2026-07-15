# Deterministic Food R&D Calculation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a framework-independent TypeScript package that deterministically calculates units, nutrition, cost, targets, formula rebalancing, and nested semi-finished recipes.

**Architecture:** Use a pnpm workspace with a focused @food-rd/core package. All public numeric values cross the package boundary as decimal strings; decimal.js performs arithmetic internally. Every calculator returns an explicit success/error result, while incomplete nutrition or price data remains a visible partial estimate instead of silently becoming zero.

**Tech Stack:** Node.js 24.18.0 LTS, pnpm 11.7.0, TypeScript 5.9, Vitest 4.1, decimal.js, GitHub Actions.

## Global Constraints

- Core calculation must run fully offline and must not depend on React, Tauri, SQLite, a browser, or an AI provider.
- All persisted and public numeric values use base-10 decimal strings; never expose IEEE-754 calculation artifacts.
- Unknown nutrient or price data is distinct from confirmed zero.
- All quantities are normalized to grams before nutrition, cost, or nested-recipe calculations.
- Volume conversion requires a positive density in grams per millilitre.
- Historical recipe inputs are immutable snapshots; this package never loads a floating “latest version.”
- Use test-driven development: write a failing test, verify the failure, implement the minimum behavior, then rerun the focused and full suites.
- Package dependencies are locked in pnpm-lock.yaml and CI uses frozen-lockfile.

---

## File Map

- package.json: root scripts and toolchain constraints.
- pnpm-workspace.yaml: workspace package discovery.
- tsconfig.base.json: shared strict TypeScript settings.
- packages/core/package.json: framework-independent package manifest.
- packages/core/src/result.ts: calculation result and issue contracts.
- packages/core/src/decimal.ts: validated decimal parsing and canonical formatting.
- packages/core/src/units.ts: mass/volume normalization.
- packages/core/src/nutrition.ts: nutrient aggregation, yield basis, and completeness.
- packages/core/src/cost.ts: raw material, packaging, additional, and unit cost.
- packages/core/src/targets.ts: minimum/maximum/range evaluation.
- packages/core/src/rebalance.ts: locked, proportional, and auto-fill formula adjustment.
- packages/core/src/recipe-graph.ts: immutable nested recipe expansion and cycle detection.
- packages/core/src/recipe-calculator.ts: end-to-end composition of graph, nutrition, and cost.
- packages/core/src/index.ts: the only public export surface.
- packages/core/test/*.test.ts: focused unit and integration tests.
- .github/workflows/ci.yml: deterministic typecheck and test gate.

### Task 1: Bootstrap the repository and core workspace

**Files:**
- Create: .gitignore
- Create: .nvmrc
- Create: package.json
- Create: pnpm-workspace.yaml
- Create: tsconfig.base.json
- Create: packages/core/package.json
- Create: packages/core/tsconfig.json
- Create: packages/core/src/index.ts
- Create: packages/core/test/smoke.test.ts

**Interfaces:**
- Produces: workspace scripts pnpm typecheck and pnpm test.
- Produces: package @food-rd/core with temporary export CORE_VERSION.

- [ ] **Step 1: Verify the initialized repository and main branch**

Run:

~~~bash
git rev-parse --is-inside-work-tree
git branch --show-current
git status --short
~~~

Expected: the first two lines are true and main; the design and plan documents are already committed.

- [ ] **Step 2: Add the workspace configuration**

Create .nvmrc:

~~~text
24.18.0
~~~

Create .gitignore:

~~~text
node_modules/
dist/
coverage/
.DS_Store
*.log
src-tauri/target/
~~~

Create package.json:

~~~json
{
  "name": "food-rd-studio",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.7.0",
  "engines": {
    "node": ">=24.18.0 <25"
  },
  "scripts": {
    "typecheck": "pnpm --filter @food-rd/core typecheck",
    "test": "pnpm --filter @food-rd/core test"
  }
}
~~~

Create pnpm-workspace.yaml:

~~~yaml
packages:
  - packages/*
  - apps/*
~~~

Create tsconfig.base.json:

~~~json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
~~~

- [ ] **Step 3: Add the core package and smoke test**

Create packages/core/package.json:

~~~json
{
  "name": "@food-rd/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "decimal.js": "^10.6.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.1.0"
  }
}
~~~

Create packages/core/tsconfig.json:

~~~json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts"]
}
~~~

Create packages/core/src/index.ts:

~~~ts
export const CORE_VERSION = "0.1.0";
~~~

Create packages/core/test/smoke.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "../src/index.js";

describe("@food-rd/core", () => {
  it("exposes a versioned public entrypoint", () => {
    expect(CORE_VERSION).toBe("0.1.0");
  });
});
~~~

- [ ] **Step 4: Install locked dependencies**

Run:

~~~bash
pnpm install
~~~

Expected: pnpm-lock.yaml is created and installation completes without peer-dependency errors.

- [ ] **Step 5: Verify the workspace**

Run:

~~~bash
pnpm typecheck
pnpm test
~~~

Expected: TypeScript exits 0 and Vitest reports one passing test.

- [ ] **Step 6: Commit the bootstrap**

~~~bash
git add .gitignore .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json packages
git commit -m "chore: bootstrap food R&D core workspace"
~~~

### Task 2: Add decimal and result primitives

**Files:**
- Create: packages/core/src/result.ts
- Create: packages/core/src/decimal.ts
- Create: packages/core/test/decimal.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Produces: CalcResult<T>, CalculationIssue, ok(), fail().
- Produces: DecimalInput, parseDecimal(), parseNonNegative(), parsePositive(), decimalString().

- [ ] **Step 1: Write failing decimal and result tests**

Create packages/core/test/decimal.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
} from "../src/index.js";

describe("decimal primitives", () => {
  it("normalizes decimal strings without binary floating-point artifacts", () => {
    const result = parseNonNegative("0.1000", "amount");
    expect(result.ok).toBe(true);
    if (result.ok) expect(decimalString(result.value)).toBe("0.1");
  });

  it("rejects non-numeric values", () => {
    const result = parseNonNegative("abc", "amount");
    expect(result).toEqual({
      ok: false,
      issues: [{
        code: "invalid-number",
        field: "amount",
        severity: "error",
        message: "amount 必须是有效数字",
      }],
    });
  });

  it("distinguishes non-negative and positive validation", () => {
    expect(parseNonNegative("0", "amount").ok).toBe(true);
    expect(parsePositive("0", "density")).toEqual({
      ok: false,
      issues: [{
        code: "non-positive-value",
        field: "density",
        severity: "error",
        message: "density 必须大于 0",
      }],
    });
  });
});
~~~

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/decimal.test.ts
~~~

Expected: FAIL because decimal exports do not exist.

- [ ] **Step 3: Implement the result contract**

Create packages/core/src/result.ts:

~~~ts
export type IssueSeverity = "warning" | "error";

export type IssueCode =
  | "invalid-number"
  | "negative-value"
  | "non-positive-value"
  | "missing-density"
  | "invalid-unit"
  | "missing-price"
  | "target-conflict"
  | "duplicate-id"
  | "missing-recipe-version"
  | "recipe-cycle";

export interface CalculationIssue {
  code: IssueCode;
  field?: string;
  itemId?: string;
  severity: IssueSeverity;
  message: string;
}

export type CalcResult<T> =
  | { ok: true; value: T; warnings: CalculationIssue[] }
  | { ok: false; issues: CalculationIssue[] };

export function ok<T>(
  value: T,
  warnings: CalculationIssue[] = [],
): CalcResult<T> {
  return { ok: true, value, warnings };
}

export function fail<T = never>(
  ...issues: CalculationIssue[]
): CalcResult<T> {
  return { ok: false, issues };
}
~~~

- [ ] **Step 4: Implement canonical decimal parsing**

Create packages/core/src/decimal.ts:

~~~ts
import Decimal from "decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});

export type DecimalInput = string | number;
export type DecimalString = string;

export function parseDecimal(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  try {
    const value = new Decimal(input);
    if (!value.isFinite()) throw new Error("not finite");
    return ok(value);
  } catch {
    return fail({
      code: "invalid-number",
      field,
      severity: "error",
      message: field + " 必须是有效数字",
    });
  }
}

export function parseNonNegative(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  const parsed = parseDecimal(input, field);
  if (!parsed.ok) return parsed;
  if (parsed.value.isNegative()) {
    return fail({
      code: "negative-value",
      field,
      severity: "error",
      message: field + " 不能小于 0",
    });
  }
  return parsed;
}

export function parsePositive(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  const parsed = parseDecimal(input, field);
  if (!parsed.ok) return parsed;
  if (parsed.value.lte(0)) {
    return fail({
      code: "non-positive-value",
      field,
      severity: "error",
      message: field + " 必须大于 0",
    });
  }
  return parsed;
}

export function decimalString(value: Decimal): DecimalString {
  return value.toFixed();
}
~~~

Replace packages/core/src/index.ts with:

~~~ts
export const CORE_VERSION = "0.1.0";

export * from "./decimal.js";
export * from "./result.js";
~~~

- [ ] **Step 5: Verify focused and full suites**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/decimal.test.ts
pnpm typecheck
pnpm test
~~~

Expected: all commands exit 0; decimal.test.ts reports three passing tests.

- [ ] **Step 6: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): add decimal result primitives"
~~~

### Task 3: Normalize mass and volume units

**Files:**
- Create: packages/core/src/units.ts
- Create: packages/core/test/units.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Consumes: parseNonNegative(), parsePositive(), decimalString(), CalcResult.
- Produces: Unit, Quantity, toGrams(quantity, densityGPerMl?).

- [ ] **Step 1: Write failing unit conversion tests**

Create packages/core/test/units.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { toGrams } from "../src/index.js";

describe("toGrams", () => {
  it.each([
    [{ value: "2500", unit: "mg" as const }, undefined, "2.5"],
    [{ value: "2.5", unit: "g" as const }, undefined, "2.5"],
    [{ value: "1.2", unit: "kg" as const }, undefined, "1200"],
    [{ value: "500", unit: "mL" as const }, "1.03", "515"],
    [{ value: "2", unit: "L" as const }, "0.9", "1800"],
  ])("converts %o to grams", (quantity, density, expected) => {
    const result = toGrams(quantity, density);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it("requires density for volume", () => {
    expect(toGrams({ value: "10", unit: "mL" })).toEqual({
      ok: false,
      issues: [{
        code: "missing-density",
        field: "densityGPerMl",
        severity: "error",
        message: "体积换算需要填写大于 0 的密度",
      }],
    });
  });

  it("rejects a negative quantity", () => {
    const result = toGrams({ value: "-1", unit: "g" });
    expect(result.ok).toBe(false);
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/units.test.ts
~~~

Expected: FAIL because toGrams is not exported.

- [ ] **Step 3: Implement unit conversion**

Create packages/core/src/units.ts:

~~~ts
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalInput,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export type MassUnit = "mg" | "g" | "kg";
export type VolumeUnit = "mL" | "L";
export type Unit = MassUnit | VolumeUnit;

export interface Quantity {
  value: DecimalInput;
  unit: Unit;
}

export function toGrams(
  quantity: Quantity,
  densityGPerMl?: DecimalInput,
): CalcResult<DecimalString> {
  const amount = parseNonNegative(quantity.value, "quantity.value");
  if (!amount.ok) return amount;

  if (quantity.unit === "mg") return ok(decimalString(amount.value.div(1000)));
  if (quantity.unit === "g") return ok(decimalString(amount.value));
  if (quantity.unit === "kg") return ok(decimalString(amount.value.mul(1000)));

  if (quantity.unit !== "mL" && quantity.unit !== "L") {
    return fail({
      code: "invalid-unit",
      field: "quantity.unit",
      severity: "error",
      message: "不支持的计量单位",
    });
  }

  if (densityGPerMl === undefined) {
    return fail({
      code: "missing-density",
      field: "densityGPerMl",
      severity: "error",
      message: "体积换算需要填写大于 0 的密度",
    });
  }

  const density = parsePositive(densityGPerMl, "densityGPerMl");
  if (!density.ok) {
    return fail({
      code: "missing-density",
      field: "densityGPerMl",
      severity: "error",
      message: "体积换算需要填写大于 0 的密度",
    });
  }

  const millilitres = quantity.unit === "L"
    ? amount.value.mul(1000)
    : amount.value;
  return ok(decimalString(millilitres.mul(density.value)));
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./units.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/units.test.ts
pnpm typecheck
pnpm test
~~~

Expected: units.test.ts reports seven passing cases and the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): normalize mass and volume units"
~~~

### Task 4: Calculate nutrition and data completeness

**Files:**
- Create: packages/core/src/nutrition.ts
- Create: packages/core/test/nutrition.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Consumes: decimal parsing and CalcResult.
- Produces: NutritionComponentInput, NutrientEstimate, NutritionSummary, calculateNutrition().

- [ ] **Step 1: Write failing nutrition tests**

Create packages/core/test/nutrition.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { calculateNutrition } from "../src/index.js";

describe("calculateNutrition", () => {
  it("calculates totals and per-100g values using finished mass", () => {
    const result = calculateNutrition({
      components: [
        {
          id: "soy",
          name: "大豆粉",
          massGrams: "20",
          nutrientsPer100g: { protein: "40", sugar: "10" },
        },
        {
          id: "water",
          name: "水",
          massGrams: "80",
          nutrientsPer100g: { protein: "0", sugar: "0" },
        },
      ],
      finishedMassGrams: "90",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.basis).toBe("finished-mass");
    expect(result.value.nutrients.protein).toMatchObject({
      totalKnownAmount: "8",
      per100gKnownAmount: "8.888888888888888888888888888888888888889",
      status: "complete",
      completenessRatio: "1",
    });
  });

  it("keeps unknown distinct from confirmed zero", () => {
    const result = calculateNutrition({
      components: [
        {
          id: "a",
          name: "原料A",
          massGrams: "60",
          nutrientsPer100g: { sugar: null },
        },
        {
          id: "b",
          name: "原料B",
          massGrams: "40",
          nutrientsPer100g: { sugar: "0" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nutrients.sugar).toEqual({
      totalKnownAmount: "0",
      per100gKnownAmount: "0",
      status: "partial",
      completenessRatio: "0.4",
      missingComponentIds: ["a"],
    });
  });

  it("uses input mass when finished mass is absent", () => {
    const result = calculateNutrition({
      components: [{
        id: "a",
        name: "原料A",
        massGrams: "50",
        nutrientsPer100g: { protein: "10" },
      }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.basis).toBe("input-mass");
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/nutrition.test.ts
~~~

Expected: FAIL because calculateNutrition does not exist.

- [ ] **Step 3: Implement nutrient aggregation**

Create packages/core/src/nutrition.ts:

~~~ts
import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { ok, type CalcResult } from "./result.js";

export interface NutritionComponentInput {
  id: string;
  name: string;
  massGrams: DecimalString;
  nutrientsPer100g: Record<string, DecimalString | null>;
}

export interface NutritionInput {
  components: NutritionComponentInput[];
  finishedMassGrams?: DecimalString;
}

export type EstimateStatus = "complete" | "partial" | "unknown";

export interface NutrientEstimate {
  totalKnownAmount: DecimalString;
  per100gKnownAmount: DecimalString;
  status: EstimateStatus;
  completenessRatio: DecimalString;
  missingComponentIds: string[];
}

export interface NutritionSummary {
  inputMassGrams: DecimalString;
  basisMassGrams: DecimalString;
  basis: "input-mass" | "finished-mass";
  nutrients: Record<string, NutrientEstimate>;
}

export function calculateNutrition(
  input: NutritionInput,
): CalcResult<NutritionSummary> {
  let inputMass = new Decimal(0);
  const masses = new Map<string, Decimal>();

  for (const component of input.components) {
    const mass = parseNonNegative(component.massGrams, "massGrams");
    if (!mass.ok) return mass;
    masses.set(component.id, mass.value);
    inputMass = inputMass.add(mass.value);
  }

  let basisMass = inputMass;
  let basis: NutritionSummary["basis"] = "input-mass";
  if (input.finishedMassGrams !== undefined) {
    const parsed = parsePositive(input.finishedMassGrams, "finishedMassGrams");
    if (!parsed.ok) return parsed;
    basisMass = parsed.value;
    basis = "finished-mass";
  } else {
    const parsed = parsePositive(decimalString(inputMass), "inputMassGrams");
    if (!parsed.ok) return parsed;
  }

  const codes = new Set<string>();
  for (const component of input.components) {
    for (const code of Object.keys(component.nutrientsPer100g)) codes.add(code);
  }

  const nutrients: Record<string, NutrientEstimate> = {};
  for (const code of codes) {
    let totalKnown = new Decimal(0);
    let knownMass = new Decimal(0);
    const missingComponentIds: string[] = [];

    for (const component of input.components) {
      const mass = masses.get(component.id) ?? new Decimal(0);
      const amount = component.nutrientsPer100g[code];
      if (amount === null || amount === undefined) {
        missingComponentIds.push(component.id);
        continue;
      }
      const parsedAmount = parseNonNegative(amount, code);
      if (!parsedAmount.ok) return parsedAmount;
      totalKnown = totalKnown.add(parsedAmount.value.mul(mass).div(100));
      knownMass = knownMass.add(mass);
    }

    const status: EstimateStatus = missingComponentIds.length === 0
      ? "complete"
      : missingComponentIds.length === input.components.length
        ? "unknown"
        : "partial";
    const completeness = inputMass.isZero()
      ? new Decimal(0)
      : knownMass.div(inputMass);

    nutrients[code] = {
      totalKnownAmount: decimalString(totalKnown),
      per100gKnownAmount: decimalString(totalKnown.div(basisMass).mul(100)),
      status,
      completenessRatio: decimalString(completeness),
      missingComponentIds,
    };
  }

  return ok({
    inputMassGrams: decimalString(inputMass),
    basisMassGrams: decimalString(basisMass),
    basis,
    nutrients,
  });
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./nutrition.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/nutrition.test.ts
pnpm typecheck
pnpm test
~~~

Expected: three nutrition tests pass; the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): calculate nutrition completeness"
~~~

### Task 5: Calculate batch and unit costs

**Files:**
- Create: packages/core/src/cost.ts
- Create: packages/core/test/cost.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Produces: CostComponentInput, NamedCostInput, CostInput, CostSummary, calculateCost().
- Missing component prices produce partial status and missingComponentIds.

- [ ] **Step 1: Write failing cost tests**

Create packages/core/test/cost.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { calculateCost } from "../src/index.js";

describe("calculateCost", () => {
  it("calculates raw, packaging, additional, and unit costs", () => {
    const result = calculateCost({
      components: [
        { id: "a", name: "原料A", massGrams: "500", pricePerKg: "20" },
        { id: "b", name: "原料B", massGrams: "500", pricePerKg: "10" },
      ],
      finishedMassGrams: "900",
      packaging: [{ id: "bottle", name: "瓶", quantity: "9", unitCost: "0.5" }],
      additional: [{ id: "process", name: "加工费", amount: "3" }],
      servingMassGrams: "100",
      packageCount: "9",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      rawMaterialTotal: "15",
      packagingTotal: "4.5",
      additionalTotal: "3",
      batchTotal: "22.5",
      perKg: "25",
      per100g: "2.5",
      perServing: "2.5",
      perPackage: "2.5",
      status: "complete",
      missingComponentIds: [],
    });
  });

  it("returns a visible partial estimate when a price is unknown", () => {
    const result = calculateCost({
      components: [
        { id: "a", name: "原料A", massGrams: "500", pricePerKg: null },
        { id: "b", name: "原料B", massGrams: "500", pricePerKg: "10" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("partial");
    expect(result.value.rawMaterialTotal).toBe("5");
    expect(result.value.missingComponentIds).toEqual(["a"]);
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/cost.test.ts
~~~

Expected: FAIL because calculateCost is missing.

- [ ] **Step 3: Implement cost calculation**

Create packages/core/src/cost.ts:

~~~ts
import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { ok, type CalcResult } from "./result.js";

export interface CostComponentInput {
  id: string;
  name: string;
  massGrams: DecimalString;
  pricePerKg: DecimalString | null;
}

export interface NamedCostInput {
  id: string;
  name: string;
}

export interface PackagingCostInput extends NamedCostInput {
  quantity: DecimalString;
  unitCost: DecimalString;
}

export interface AdditionalCostInput extends NamedCostInput {
  amount: DecimalString;
}

export interface CostInput {
  components: CostComponentInput[];
  finishedMassGrams?: DecimalString;
  packaging?: PackagingCostInput[];
  additional?: AdditionalCostInput[];
  servingMassGrams?: DecimalString;
  packageCount?: DecimalString;
}

export interface CostBreakdownItem {
  id: string;
  name: string;
  category: "ingredient" | "packaging" | "additional";
  amount: DecimalString;
}

export interface CostSummary {
  rawMaterialTotal: DecimalString;
  packagingTotal: DecimalString;
  additionalTotal: DecimalString;
  batchTotal: DecimalString;
  perKg: DecimalString;
  per100g: DecimalString;
  perServing: DecimalString | null;
  perPackage: DecimalString | null;
  status: "complete" | "partial";
  missingComponentIds: string[];
  breakdown: CostBreakdownItem[];
}

export function calculateCost(input: CostInput): CalcResult<CostSummary> {
  let inputMass = new Decimal(0);
  let rawMaterialTotal = new Decimal(0);
  let packagingTotal = new Decimal(0);
  let additionalTotal = new Decimal(0);
  const missingComponentIds: string[] = [];
  const breakdown: CostBreakdownItem[] = [];

  for (const component of input.components) {
    const mass = parseNonNegative(component.massGrams, "massGrams");
    if (!mass.ok) return mass;
    inputMass = inputMass.add(mass.value);
    if (component.pricePerKg === null) {
      missingComponentIds.push(component.id);
      continue;
    }
    const price = parseNonNegative(component.pricePerKg, "pricePerKg");
    if (!price.ok) return price;
    const amount = mass.value.div(1000).mul(price.value);
    rawMaterialTotal = rawMaterialTotal.add(amount);
    breakdown.push({
      id: component.id,
      name: component.name,
      category: "ingredient",
      amount: decimalString(amount),
    });
  }

  for (const item of input.packaging ?? []) {
    const quantity = parseNonNegative(item.quantity, "packaging.quantity");
    if (!quantity.ok) return quantity;
    const unitCost = parseNonNegative(item.unitCost, "packaging.unitCost");
    if (!unitCost.ok) return unitCost;
    const amount = quantity.value.mul(unitCost.value);
    packagingTotal = packagingTotal.add(amount);
    breakdown.push({
      id: item.id,
      name: item.name,
      category: "packaging",
      amount: decimalString(amount),
    });
  }

  for (const item of input.additional ?? []) {
    const amount = parseNonNegative(item.amount, "additional.amount");
    if (!amount.ok) return amount;
    additionalTotal = additionalTotal.add(amount.value);
    breakdown.push({
      id: item.id,
      name: item.name,
      category: "additional",
      amount: decimalString(amount.value),
    });
  }

  let basisMass = inputMass;
  if (input.finishedMassGrams !== undefined) {
    const parsed = parsePositive(input.finishedMassGrams, "finishedMassGrams");
    if (!parsed.ok) return parsed;
    basisMass = parsed.value;
  } else {
    const parsed = parsePositive(decimalString(inputMass), "inputMassGrams");
    if (!parsed.ok) return parsed;
  }

  const batchTotal = rawMaterialTotal.add(packagingTotal).add(additionalTotal);
  const perGram = batchTotal.div(basisMass);

  let perServing: DecimalString | null = null;
  if (input.servingMassGrams !== undefined) {
    const serving = parsePositive(input.servingMassGrams, "servingMassGrams");
    if (!serving.ok) return serving;
    perServing = decimalString(perGram.mul(serving.value));
  }

  let perPackage: DecimalString | null = null;
  if (input.packageCount !== undefined) {
    const count = parsePositive(input.packageCount, "packageCount");
    if (!count.ok) return count;
    perPackage = decimalString(batchTotal.div(count.value));
  }

  return ok({
    rawMaterialTotal: decimalString(rawMaterialTotal),
    packagingTotal: decimalString(packagingTotal),
    additionalTotal: decimalString(additionalTotal),
    batchTotal: decimalString(batchTotal),
    perKg: decimalString(perGram.mul(1000)),
    per100g: decimalString(perGram.mul(100)),
    perServing,
    perPackage,
    status: missingComponentIds.length === 0 ? "complete" : "partial",
    missingComponentIds,
    breakdown,
  });
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./cost.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/cost.test.ts
pnpm typecheck
pnpm test
~~~

Expected: two cost tests pass and the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): calculate batch and unit costs"
~~~

### Task 6: Evaluate nutrition and cost targets

**Files:**
- Create: packages/core/src/targets.ts
- Create: packages/core/test/targets.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Produces: FormulaTarget, TargetEvaluation, evaluateTarget().
- A null observed value returns unknown rather than failed.

- [ ] **Step 1: Write failing target tests**

Create packages/core/test/targets.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { evaluateTarget } from "../src/index.js";

describe("evaluateTarget", () => {
  it("evaluates a range and reports signed deltas", () => {
    expect(evaluateTarget("8", {
      id: "protein",
      metricCode: "protein.per100g",
      minimum: "10",
      maximum: "15",
    })).toEqual({
      ok: true,
      value: {
        targetId: "protein",
        status: "below",
        observed: "8",
        deltaToMinimum: "-2",
        deltaToMaximum: "-7",
      },
      warnings: [],
    });
  });

  it("reports met when a value is inside the range", () => {
    const result = evaluateTarget("12", {
      id: "protein",
      metricCode: "protein.per100g",
      minimum: "10",
      maximum: "15",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("met");
  });

  it("returns unknown when the observed metric is unavailable", () => {
    const result = evaluateTarget(null, {
      id: "cost",
      metricCode: "cost.perKg",
      maximum: "20",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("unknown");
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/targets.test.ts
~~~

Expected: FAIL because evaluateTarget is missing.

- [ ] **Step 3: Implement target evaluation**

Create packages/core/src/targets.ts:

~~~ts
import {
  decimalString,
  parseDecimal,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface FormulaTarget {
  id: string;
  metricCode: string;
  minimum?: DecimalString;
  maximum?: DecimalString;
}

export interface TargetEvaluation {
  targetId: string;
  status: "met" | "below" | "above" | "unknown";
  observed: DecimalString | null;
  deltaToMinimum: DecimalString | null;
  deltaToMaximum: DecimalString | null;
}

export function evaluateTarget(
  observed: DecimalString | null,
  target: FormulaTarget,
): CalcResult<TargetEvaluation> {
  if (target.minimum === undefined && target.maximum === undefined) {
    return fail({
      code: "target-conflict",
      itemId: target.id,
      severity: "error",
      message: "目标必须包含下限或上限",
    });
  }

  if (observed === null) {
    return ok({
      targetId: target.id,
      status: "unknown",
      observed: null,
      deltaToMinimum: null,
      deltaToMaximum: null,
    });
  }

  const value = parseDecimal(observed, "observed");
  if (!value.ok) return value;
  const minimum = target.minimum === undefined
    ? null
    : parseDecimal(target.minimum, "minimum");
  if (minimum !== null && !minimum.ok) return minimum;
  const maximum = target.maximum === undefined
    ? null
    : parseDecimal(target.maximum, "maximum");
  if (maximum !== null && !maximum.ok) return maximum;

  if (
    minimum !== null &&
    maximum !== null &&
    minimum.value.gt(maximum.value)
  ) {
    return fail({
      code: "target-conflict",
      itemId: target.id,
      severity: "error",
      message: "目标下限不能大于上限",
    });
  }

  const status = minimum !== null && value.value.lt(minimum.value)
    ? "below"
    : maximum !== null && value.value.gt(maximum.value)
      ? "above"
      : "met";

  return ok({
    targetId: target.id,
    status,
    observed: decimalString(value.value),
    deltaToMinimum: minimum === null
      ? null
      : decimalString(value.value.sub(minimum.value)),
    deltaToMaximum: maximum === null
      ? null
      : decimalString(value.value.sub(maximum.value)),
  });
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./targets.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/targets.test.ts
pnpm typecheck
pnpm test
~~~

Expected: three target tests pass and the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): evaluate formula targets"
~~~

### Task 7: Rebalance locked and auto-fill formula items

**Files:**
- Create: packages/core/src/rebalance.ts
- Create: packages/core/test/rebalance.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Produces: FormulaAmount, RebalanceMode, RebalanceInput, rebalanceFormula().
- auto-fill assigns all remaining mass to one unlocked item.
- proportional scales all unlocked items while preserving locked amounts.

- [ ] **Step 1: Write failing rebalance tests**

Create packages/core/test/rebalance.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { rebalanceFormula } from "../src/index.js";

describe("rebalanceFormula", () => {
  it("fills the designated ingredient to the target total", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "100",
      items: [
        { id: "sugar", amountGrams: "10", locked: true },
        { id: "flavor", amountGrams: "1", locked: true },
        { id: "water", amountGrams: "0", locked: false },
      ],
      mode: { type: "auto-fill", itemId: "water" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([
      { id: "sugar", amountGrams: "10", locked: true },
      { id: "flavor", amountGrams: "1", locked: true },
      { id: "water", amountGrams: "89", locked: false },
    ]);
  });

  it("scales unlocked ingredients proportionally", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "100",
      items: [
        { id: "fixed", amountGrams: "20", locked: true },
        { id: "a", amountGrams: "30", locked: false },
        { id: "b", amountGrams: "10", locked: false },
      ],
      mode: { type: "proportional" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((item) => item.amountGrams))
      .toEqual(["20", "60", "20"]);
  });

  it("rejects locked mass above the target", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "10",
      items: [{ id: "fixed", amountGrams: "11", locked: true }],
      mode: { type: "proportional" },
    });
    expect(result.ok).toBe(false);
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/rebalance.test.ts
~~~

Expected: FAIL because rebalanceFormula is missing.

- [ ] **Step 3: Implement rebalancing**

Create packages/core/src/rebalance.ts:

~~~ts
import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface FormulaAmount {
  id: string;
  amountGrams: DecimalString;
  locked: boolean;
}

export type RebalanceMode =
  | { type: "auto-fill"; itemId: string }
  | { type: "proportional" };

export interface RebalanceInput {
  targetTotalGrams: DecimalString;
  items: FormulaAmount[];
  mode: RebalanceMode;
}

export function rebalanceFormula(
  input: RebalanceInput,
): CalcResult<FormulaAmount[]> {
  const target = parsePositive(input.targetTotalGrams, "targetTotalGrams");
  if (!target.ok) return target;

  const seen = new Set<string>();
  const parsed = new Map<string, Decimal>();
  for (const item of input.items) {
    if (seen.has(item.id)) {
      return fail({
        code: "duplicate-id",
        itemId: item.id,
        severity: "error",
        message: "配方项目 ID 不能重复",
      });
    }
    seen.add(item.id);
    const amount = parseNonNegative(item.amountGrams, "amountGrams");
    if (!amount.ok) return amount;
    parsed.set(item.id, amount.value);
  }

  if (input.mode.type === "auto-fill") {
    const filler = input.items.find((item) => item.id === input.mode.itemId);
    if (filler === undefined || filler.locked) {
      return fail({
        code: "target-conflict",
        itemId: input.mode.itemId,
        severity: "error",
        message: "自动补足项必须存在且不能被锁定",
      });
    }
    const otherTotal = input.items
      .filter((item) => item.id !== filler.id)
      .reduce(
        (sum, item) => sum.add(parsed.get(item.id) ?? 0),
        new Decimal(0),
      );
    const remaining = target.value.sub(otherTotal);
    if (remaining.isNegative()) {
      return fail({
        code: "target-conflict",
        itemId: filler.id,
        severity: "error",
        message: "其他原料总量已超过目标批量，无法自动补足",
      });
    }
    return ok(input.items.map((item) => ({
      ...item,
      amountGrams: item.id === filler.id
        ? decimalString(remaining)
        : decimalString(parsed.get(item.id) ?? new Decimal(0)),
    })));
  }

  const lockedTotal = input.items
    .filter((item) => item.locked)
    .reduce(
      (sum, item) => sum.add(parsed.get(item.id) ?? 0),
      new Decimal(0),
    );
  const remaining = target.value.sub(lockedTotal);
  if (remaining.isNegative()) {
    return fail({
      code: "target-conflict",
      severity: "error",
      message: "已锁定原料总量超过目标批量",
    });
  }

  const unlocked = input.items.filter((item) => !item.locked);
  const unlockedTotal = unlocked.reduce(
    (sum, item) => sum.add(parsed.get(item.id) ?? 0),
    new Decimal(0),
  );
  if (unlocked.length === 0 || (unlockedTotal.isZero() && !remaining.isZero())) {
    return fail({
      code: "target-conflict",
      severity: "error",
      message: "没有可按比例调整的未锁定原料",
    });
  }

  const factor = unlockedTotal.isZero()
    ? new Decimal(0)
    : remaining.div(unlockedTotal);
  return ok(input.items.map((item) => ({
    ...item,
    amountGrams: item.locked
      ? decimalString(parsed.get(item.id) ?? new Decimal(0))
      : decimalString((parsed.get(item.id) ?? new Decimal(0)).mul(factor)),
  })));
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./rebalance.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/rebalance.test.ts
pnpm typecheck
pnpm test
~~~

Expected: three rebalance tests pass and the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): rebalance locked formula items"
~~~

### Task 8: Expand nested semi-finished recipe versions

**Files:**
- Create: packages/core/src/recipe-graph.ts
- Create: packages/core/test/recipe-graph.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Produces: IngredientSnapshot, RecipeItem, RecipeVersionNode, FlattenedIngredient, flattenRecipeVersion().
- References always use an explicit recipeVersionId.

- [ ] **Step 1: Write failing graph tests**

Create packages/core/test/recipe-graph.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { flattenRecipeVersion } from "../src/index.js";

const sugar = {
  id: "sugar",
  name: "白砂糖",
  nutrientsPer100g: { sugar: "100" },
  pricePerKg: "8",
};

describe("flattenRecipeVersion", () => {
  it("scales nested ingredients by the referenced output mass", () => {
    const result = flattenRecipeVersion("drink-v1", {
      "syrup-v1": {
        id: "syrup-v1",
        outputMassGrams: "100",
        items: [
          { kind: "ingredient", ingredient: sugar, massGrams: "20" },
        ],
      },
      "drink-v1": {
        id: "drink-v1",
        outputMassGrams: "1000",
        items: [
          { kind: "recipe", recipeVersionId: "syrup-v1", massGrams: "50" },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([{
      ingredient: sugar,
      massGrams: "10",
      sourcePath: ["drink-v1", "syrup-v1"],
    }]);
  });

  it("rejects indirect cycles", () => {
    const result = flattenRecipeVersion("a", {
      a: {
        id: "a",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "b", massGrams: "50" }],
      },
      b: {
        id: "b",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "a", massGrams: "50" }],
      },
    });
    expect(result).toEqual({
      ok: false,
      issues: [{
        code: "recipe-cycle",
        itemId: "a",
        severity: "error",
        message: "检测到配方循环引用: a -> b -> a",
      }],
    });
  });

  it("rejects a missing referenced version", () => {
    const result = flattenRecipeVersion("a", {
      a: {
        id: "a",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "missing", massGrams: "1" }],
      },
    });
    expect(result.ok).toBe(false);
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/recipe-graph.test.ts
~~~

Expected: FAIL because flattenRecipeVersion is missing.

- [ ] **Step 3: Implement immutable graph expansion**

Create packages/core/src/recipe-graph.ts:

~~~ts
import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface IngredientSnapshot {
  id: string;
  name: string;
  nutrientsPer100g: Record<string, DecimalString | null>;
  pricePerKg: DecimalString | null;
}

export type RecipeItem =
  | {
      kind: "ingredient";
      ingredient: IngredientSnapshot;
      massGrams: DecimalString;
    }
  | {
      kind: "recipe";
      recipeVersionId: string;
      massGrams: DecimalString;
    };

export interface RecipeVersionNode {
  id: string;
  outputMassGrams: DecimalString;
  items: RecipeItem[];
}

export interface FlattenedIngredient {
  ingredient: IngredientSnapshot;
  massGrams: DecimalString;
  sourcePath: string[];
}

export function flattenRecipeVersion(
  rootVersionId: string,
  graph: Record<string, RecipeVersionNode>,
): CalcResult<FlattenedIngredient[]> {
  const visit = (
    versionId: string,
    scale: Decimal,
    path: string[],
  ): CalcResult<FlattenedIngredient[]> => {
    if (path.includes(versionId)) {
      const cycle = [...path, versionId];
      return fail({
        code: "recipe-cycle",
        itemId: versionId,
        severity: "error",
        message: "检测到配方循环引用: " + cycle.join(" -> "),
      });
    }

    const node = graph[versionId];
    if (node === undefined) {
      return fail({
        code: "missing-recipe-version",
        itemId: versionId,
        severity: "error",
        message: "找不到被引用的配方版本: " + versionId,
      });
    }

    const outputMass = parsePositive(node.outputMassGrams, "outputMassGrams");
    if (!outputMass.ok) return outputMass;
    const nextPath = [...path, versionId];
    const leaves: FlattenedIngredient[] = [];

    for (const item of node.items) {
      const mass = parseNonNegative(item.massGrams, "massGrams");
      if (!mass.ok) return mass;
      if (item.kind === "ingredient") {
        leaves.push({
          ingredient: item.ingredient,
          massGrams: decimalString(mass.value.mul(scale)),
          sourcePath: nextPath,
        });
        continue;
      }

      const childNode = graph[item.recipeVersionId];
      if (childNode === undefined) {
        return fail({
          code: "missing-recipe-version",
          itemId: item.recipeVersionId,
          severity: "error",
          message: "找不到被引用的配方版本: " + item.recipeVersionId,
        });
      }
      const childOutputMass = parsePositive(
        childNode.outputMassGrams,
        "outputMassGrams",
      );
      if (!childOutputMass.ok) return childOutputMass;
      const childScale = scale.mul(mass.value).div(childOutputMass.value);
      const child = visit(item.recipeVersionId, childScale, nextPath);
      if (!child.ok) return child;
      leaves.push(...child.value);
    }

    return ok(leaves);
  };

  return visit(rootVersionId, new Decimal(1), []);
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./recipe-graph.js";
~~~

- [ ] **Step 4: Verify**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/recipe-graph.test.ts
pnpm typecheck
pnpm test
~~~

Expected: three graph tests pass and the full suite exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): expand nested recipe versions"
~~~

### Task 9: Compose an end-to-end recipe calculator

**Files:**
- Create: packages/core/src/recipe-calculator.ts
- Create: packages/core/test/recipe-calculator.test.ts
- Modify: packages/core/src/index.ts

**Interfaces:**
- Consumes: flattenRecipeVersion(), calculateNutrition(), calculateCost().
- Produces: RecipeCalculationInput, RecipeCalculation, calculateRecipe().

- [ ] **Step 1: Write a failing end-to-end test**

Create packages/core/test/recipe-calculator.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { calculateRecipe } from "../src/index.js";

describe("calculateRecipe", () => {
  it("calculates a parent recipe through a semi-finished version", () => {
    const result = calculateRecipe({
      rootVersionId: "drink",
      graph: {
        syrup: {
          id: "syrup",
          outputMassGrams: "100",
          items: [{
            kind: "ingredient",
            massGrams: "20",
            ingredient: {
              id: "sugar",
              name: "白砂糖",
              nutrientsPer100g: { sugar: "100" },
              pricePerKg: "8",
            },
          }],
        },
        drink: {
          id: "drink",
          outputMassGrams: "1000",
          items: [{
            kind: "recipe",
            recipeVersionId: "syrup",
            massGrams: "500",
          }],
        },
      },
      finishedMassGrams: "500",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nutrition.nutrients.sugar).toMatchObject({
      totalKnownAmount: "100",
      per100gKnownAmount: "20",
      status: "complete",
    });
    expect(result.value.cost).toMatchObject({
      rawMaterialTotal: "0.8",
      perKg: "1.6",
      status: "complete",
    });
  });
});
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/recipe-calculator.test.ts
~~~

Expected: FAIL because calculateRecipe is missing.

- [ ] **Step 3: Implement calculator composition**

Create packages/core/src/recipe-calculator.ts:

~~~ts
import {
  calculateCost,
  type AdditionalCostInput,
  type CostSummary,
  type PackagingCostInput,
} from "./cost.js";
import {
  calculateNutrition,
  type NutritionSummary,
} from "./nutrition.js";
import {
  flattenRecipeVersion,
  type RecipeVersionNode,
} from "./recipe-graph.js";
import { ok, type CalcResult } from "./result.js";
import type { DecimalString } from "./decimal.js";

export interface RecipeCalculationInput {
  rootVersionId: string;
  graph: Record<string, RecipeVersionNode>;
  finishedMassGrams?: DecimalString;
  servingMassGrams?: DecimalString;
  packageCount?: DecimalString;
  packaging?: PackagingCostInput[];
  additional?: AdditionalCostInput[];
}

export interface RecipeCalculation {
  nutrition: NutritionSummary;
  cost: CostSummary;
}

export function calculateRecipe(
  input: RecipeCalculationInput,
): CalcResult<RecipeCalculation> {
  const flattened = flattenRecipeVersion(input.rootVersionId, input.graph);
  if (!flattened.ok) return flattened;

  const nutrition = calculateNutrition({
    components: flattened.value.map((leaf, index) => ({
      id: leaf.ingredient.id + ":" + index,
      name: leaf.ingredient.name,
      massGrams: leaf.massGrams,
      nutrientsPer100g: leaf.ingredient.nutrientsPer100g,
    })),
    ...(input.finishedMassGrams === undefined
      ? {}
      : { finishedMassGrams: input.finishedMassGrams }),
  });
  if (!nutrition.ok) return nutrition;

  const cost = calculateCost({
    components: flattened.value.map((leaf, index) => ({
      id: leaf.ingredient.id + ":" + index,
      name: leaf.ingredient.name,
      massGrams: leaf.massGrams,
      pricePerKg: leaf.ingredient.pricePerKg,
    })),
    ...(input.finishedMassGrams === undefined
      ? {}
      : { finishedMassGrams: input.finishedMassGrams }),
    ...(input.servingMassGrams === undefined
      ? {}
      : { servingMassGrams: input.servingMassGrams }),
    ...(input.packageCount === undefined
      ? {}
      : { packageCount: input.packageCount }),
    ...(input.packaging === undefined ? {} : { packaging: input.packaging }),
    ...(input.additional === undefined ? {} : { additional: input.additional }),
  });
  if (!cost.ok) return cost;

  return ok({
    nutrition: nutrition.value,
    cost: cost.value,
  }, [...nutrition.warnings, ...cost.warnings]);
}
~~~

Append to packages/core/src/index.ts:

~~~ts
export * from "./recipe-calculator.js";
~~~

- [ ] **Step 4: Verify the complete calculation engine**

Run:

~~~bash
pnpm --filter @food-rd/core exec vitest run test/recipe-calculator.test.ts
pnpm typecheck
pnpm test
pnpm --filter @food-rd/core build
~~~

Expected: the integration test passes, all unit tests pass, and packages/core/dist contains JavaScript plus declaration files.

- [ ] **Step 5: Commit**

~~~bash
git add packages/core/src packages/core/test
git commit -m "feat(core): compose recipe calculations"
~~~

### Task 10: Add CI, package documentation, and final verification

**Files:**
- Create: .github/workflows/ci.yml
- Create: packages/core/README.md
- Modify: package.json

**Interfaces:**
- Produces: a CI gate that installs the lockfile, typechecks, tests, and builds.
- Documents the decimal-string boundary and unknown-value behavior for later desktop and Agent plans.

- [ ] **Step 1: Add a root build script**

Add build under scripts in package.json:

~~~json
"build": "pnpm --filter @food-rd/core build"
~~~

The complete scripts object must be:

~~~json
{
  "build": "pnpm --filter @food-rd/core build",
  "typecheck": "pnpm --filter @food-rd/core typecheck",
  "test": "pnpm --filter @food-rd/core test"
}
~~~

- [ ] **Step 2: Add continuous integration**

Create .github/workflows/ci.yml:

~~~yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  core:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.7.0
      - uses: actions/setup-node@v4
        with:
          node-version: 24.18.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
~~~

- [ ] **Step 3: Document the public contract**

Create packages/core/README.md:

~~~markdown
# @food-rd/core

食品研发工具的确定性计算引擎。该包不依赖 React、Tauri、SQLite 或大模型。

## 数值规则

- 所有公开输入和输出使用十进制字符串。
- 质量统一换算为克。
- 体积换算必须提供 g/mL 密度。
- 未知营养值和未知价格不会按零处理。
- 配方版本引用必须指向不可变的明确版本。

## 公开能力

- 单位换算：toGrams
- 营养计算：calculateNutrition
- 成本计算：calculateCost
- 目标判断：evaluateTarget
- 锁定与补足：rebalanceFormula
- 半成品展开：flattenRecipeVersion
- 完整配方计算：calculateRecipe

## 验证

运行 pnpm typecheck、pnpm test 和 pnpm build。
~~~

- [ ] **Step 4: Run final verification from a clean dependency state**

Run:

~~~bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
git status --short
~~~

Expected:

- install, typecheck, test, and build all exit 0;
- all tests from Tasks 1–9 pass;
- only Task 10 files and generated ignored dist output appear in status.

- [ ] **Step 5: Commit**

~~~bash
git add .github package.json packages/core/README.md
git commit -m "ci: verify deterministic calculation engine"
~~~

## Milestone Acceptance

The milestone is complete only when:

- A nested recipe version produces deterministic nutrition and cost results through calculateRecipe().
- Missing nutrient and price values remain visible as partial estimates.
- Yield-adjusted per-100g nutrition and unit cost use finished mass.
- Locked, proportional, and auto-fill formula adjustment tests pass.
- Direct and indirect recipe cycles are rejected.
- Public outputs contain canonical decimal strings.
- pnpm install --frozen-lockfile, pnpm typecheck, pnpm test, and pnpm build all succeed locally and in CI.
- The repository contains no React, Tauri, SQLite, network, or AI dependency in packages/core.
