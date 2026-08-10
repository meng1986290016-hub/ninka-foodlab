import { describe, expect, it } from "vitest";

import { APP_NAME, APP_WORKSPACE_NAME } from "./app-metadata";

describe("desktop application metadata", () => {
  it("uses the public brand name while preserving the Chinese workspace descriptor", () => {
    expect(APP_NAME).toBe("Ninka FoodLab");
    expect(APP_WORKSPACE_NAME).toBe("食研工作台");
  });
});
