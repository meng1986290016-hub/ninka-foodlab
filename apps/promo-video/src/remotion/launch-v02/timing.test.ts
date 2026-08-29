import { describe, expect, it } from "vitest";

import { launchV02Duration, launchV02Frames, launchV02Starts } from "./timing";

describe("launch storyboard v0.2 timing", () => {
  it("matches the approved 40.4 second timeline", () => {
    expect(launchV02Duration).toBe(1212);
    expect(launchV02Starts.approvedBrandBridge).toBe(945);
    expect(
      Object.values(launchV02Frames).reduce((total, frames) => total + frames, 0),
    ).toBe(1212);
  });

  it("starts the approved bridge 21 frames before scene 7", () => {
    expect(launchV02Starts.approvedBrandBridge + 21).toBe(966);
  });
});
