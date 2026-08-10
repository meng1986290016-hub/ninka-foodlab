import { describe, expect, it } from "vitest";

import { calculateSweetness } from "./sweetness.js";

describe("calculateSweetness", () => {
  it("calculates sucrose equivalent on the finished-mass basis", () => {
    const result = calculateSweetness({
      components: [
        {
          id: "sucrose",
          massGrams: "10",
          sweetness: {
            basis: "w_w_percent",
            content: "100",
            relativeFactor: "1",
          },
        },
      ],
      finishedMassGrams: "100",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalSucroseEquivalentGrams).toBe("10");
    expect(result.value.per100gSucroseEquivalent).toBe("10");
    expect(result.value.status).toBe("complete");
  });

  it("converts w/v content with density and preserves partial results", () => {
    const result = calculateSweetness({
      components: [
        {
          id: "syrup",
          massGrams: "25",
          densityGPerMl: "1.25",
          sweetness: {
            basis: "w_v_per_100ml",
            content: "50",
            relativeFactor: "1",
          },
        },
        {
          id: "unknown",
          massGrams: "10",
          densityGPerMl: null,
          sweetness: {
            basis: "w_v_per_100ml",
            content: "20",
            relativeFactor: "1",
          },
        },
      ],
      finishedMassGrams: "100",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalSucroseEquivalentGrams).toBe("10");
    expect(result.value.per100gSucroseEquivalent).toBe("10");
    expect(result.value.status).toBe("partial");
    expect(result.value.missingComponentIds).toEqual(["unknown"]);
  });

  it("marks configured rows with missing inputs as unknown", () => {
    const result = calculateSweetness({
      components: [
        {
          id: "sweetener",
          massGrams: "1",
          sweetness: {
            basis: "w_w_percent",
            content: null,
            relativeFactor: "600",
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("unknown");
    expect(result.value.per100gSucroseEquivalent).toBe("0");
  });

  it("uses the full formula input mass when only some ingredients configure sweetness", () => {
    const result = calculateSweetness({
      components: [
        {
          id: "sucrose-solution",
          massGrams: "100",
          sweetness: {
            basis: "w_w_percent",
            content: "10",
            relativeFactor: "1",
          },
        },
      ],
      totalInputMassGrams: "200",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inputMassGrams).toBe("200");
    expect(result.value.per100gSucroseEquivalent).toBe("5");
  });
});
