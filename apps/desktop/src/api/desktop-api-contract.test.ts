import { describe, expectTypeOf, it } from "vitest";

import type { DesktopApi } from "./desktop-api";
import type {
  IngredientVariantInput,
  MaterialGroup,
  NutritionBasis,
  VariantComparison,
} from "./types";

describe("supplier-specific DesktopApi contract", () => {
  it("exposes grouped materials and supplier variants", () => {
    expectTypeOf<
      Awaited<ReturnType<DesktopApi["listMaterialGroups"]>>
    >().toEqualTypeOf<MaterialGroup[]>();
    expectTypeOf<
      Parameters<DesktopApi["saveIngredientVariant"]>[0]
    >().toEqualTypeOf<IngredientVariantInput>();
    expectTypeOf<
      Awaited<ReturnType<DesktopApi["compareIngredientVariants"]>>
    >().toEqualTypeOf<VariantComparison>();
    expectTypeOf<NutritionBasis>().toEqualTypeOf<
      "per_100g" | "per_100ml"
    >();
  });
});
