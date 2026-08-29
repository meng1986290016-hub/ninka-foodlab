import { describe, expect, it } from "vitest";

import { STYLE_TEST_DURATION, STYLE_TEST_TIMING } from "./timing";

describe("reference style test timing", () => {
  it("runs for exactly 12.5 seconds at 30 fps", () => {
    expect(STYLE_TEST_DURATION).toBe(375);
  });

  it("keeps every scene contiguous", () => {
    expect(STYLE_TEST_TIMING.kineticStatement.start).toBe(
      STYLE_TEST_TIMING.formulaQuestion.start +
        STYLE_TEST_TIMING.formulaQuestion.duration,
    );
    expect(STYLE_TEST_TIMING.brandReveal.start).toBe(
      STYLE_TEST_TIMING.kineticStatement.start +
        STYLE_TEST_TIMING.kineticStatement.duration,
    );
    expect(STYLE_TEST_TIMING.ingredientProof.start).toBe(
      STYLE_TEST_TIMING.brandReveal.start +
        STYLE_TEST_TIMING.brandReveal.duration,
    );
    expect(
      STYLE_TEST_TIMING.ingredientProof.start +
        STYLE_TEST_TIMING.ingredientProof.duration,
    ).toBe(STYLE_TEST_DURATION);
  });
});
