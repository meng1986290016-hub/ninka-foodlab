import { describe, expect, it } from "vitest";

import { APP_NAME } from "./app-metadata";

describe("desktop application metadata", () => {
  it("exposes the Chinese product name", () => {
    expect(APP_NAME).toBe("食研工作台");
  });
});
