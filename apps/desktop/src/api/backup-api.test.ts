import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import { TauriDesktopApi } from "./tauri-desktop-api";

describe("backup desktop API", () => {
  it("maps native backup commands and requires explicit restore confirmation", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);

    await api.createDataBackup("/tmp/current.foodrd-backup");
    await api.inspectDataBackup("/tmp/selected.foodrd-backup");
    await api.restoreDataBackup("/tmp/selected.foodrd-backup", true);

    expect(invoke.mock.calls).toEqual([
      ["create_data_backup", { destinationPath: "/tmp/current.foodrd-backup" }],
      ["inspect_data_backup", { sourcePath: "/tmp/selected.foodrd-backup" }],
      [
        "restore_data_backup",
        { sourcePath: "/tmp/selected.foodrd-backup", confirmed: true },
      ],
    ]);
  });

  it("never claims that browser demo mode performed a real backup", async () => {
    const api = new BrowserDemoApi();

    await expect(api.createDataBackup("demo.foodrd-backup")).rejects.toMatchObject({
      code: "unsupported_operation",
    });
    await expect(api.inspectDataBackup("demo.foodrd-backup")).rejects.toMatchObject({
      code: "unsupported_operation",
    });
    await expect(
      api.restoreDataBackup("demo.foodrd-backup", true),
    ).rejects.toMatchObject({ code: "unsupported_operation" });
  });
});
