import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateNutritionLabel,
  type NutritionLabelCalculationInput,
} from "../src/index.js";

interface GoldenFixture {
  name: string;
  reference: string;
  input: NutritionLabelCalculationInput;
  expected: {
    publishable: boolean;
    requiredNotice: string | null;
    rows: Array<{
      nutrientCode: string;
      rawValue: string | null;
      declaredValue: string | null;
      nrvPercent: string | null;
    }>;
    issues: Array<{
      code: string;
      severity: string;
      nutrientCode: string | null;
    }>;
  };
}

const fixtureDirectory = fileURLToPath(
  new URL("./fixtures/nutrition-labels", import.meta.url),
);

describe("GB 28050 golden fixtures", async () => {
  const fileNames = (await readdir(fixtureDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  it("contains a bounded, explicitly reviewed fixture set", () => {
    expect(fileNames).toEqual([
      "per-serving-2011.json",
      "solid-2011.json",
      "solid-2025.json",
      "unknown-required-2025.json",
      "zero-boundaries-2011.json",
    ]);
  });

  for (const fileName of fileNames) {
    it(`matches ${fileName}`, async () => {
      const fixture = JSON.parse(
        await readFile(`${fixtureDirectory}/${fileName}`, "utf8"),
      ) as GoldenFixture;
      const result = calculateNutritionLabel(fixture.input);

      expect({
        publishable: result.publishable,
        requiredNotice: result.requiredNotice,
        rows: result.rows.map((row) => ({
          nutrientCode: row.nutrientCode,
          rawValue: row.rawValue,
          declaredValue: row.declaredValue,
          nrvPercent: row.nrvPercent,
        })),
        issues: result.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          nutrientCode: issue.nutrientCode ?? null,
        })),
      }).toEqual(fixture.expected);
      expect(fixture.reference).toMatch(/^https:\/\/www\.nhc\.gov\.cn\//);
    });
  }
});
