import { describe, expect, it } from "vitest";

import { PROMO_DURATION, reviewFrames, sceneFrames } from "./timing";

describe("promo timeline", () => {
  it("is exactly 45 seconds at 30 fps", () => {
    expect(PROMO_DURATION).toBe(1350);
    expect(Object.values(sceneFrames)).toEqual([75, 210, 600, 270, 120, 75]);
  });

  it("keeps all review frames inside the composition", () => {
    expect(reviewFrames).toHaveLength(6);
    expect(reviewFrames.every((frame) => frame >= 0 && frame < PROMO_DURATION)).toBe(true);
  });
});
