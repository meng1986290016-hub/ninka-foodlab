import { describe, expectTypeOf, it } from "vitest";

import type { DesktopApi } from "./desktop-api";
import type {
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "./import-types";
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

  it("exposes the model-independent ingredient import contract", () => {
    expectTypeOf<
      Parameters<DesktopApi["createIngredientImportJob"]>[0]
    >().toEqualTypeOf<IngredientImportJobRequest>();
    expectTypeOf<
      Awaited<ReturnType<DesktopApi["getIngredientImportJob"]>>
    >().toEqualTypeOf<IngredientImportJob>();
    expectTypeOf<
      Parameters<DesktopApi["updateIngredientImportDraft"]>[1]
    >().toEqualTypeOf<ReviewedIngredientImportDraft>();
    expectTypeOf<
      Awaited<ReturnType<DesktopApi["commitIngredientImportJob"]>>
    >().toEqualTypeOf<IngredientImportCommitResult>();
    expectTypeOf<
      Awaited<ReturnType<DesktopApi["listIngredientImportDrafts"]>>
    >().toEqualTypeOf<IngredientImportDraft[]>();
  });
});
