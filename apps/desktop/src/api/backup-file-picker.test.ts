import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserBackupFilePicker,
  TauriBackupFilePicker,
} from "./backup-file-picker";

const { open, save } = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open, save }));

describe("BackupFilePicker", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses native save and open dialogs with the backup extension", async () => {
    save.mockResolvedValue("/tmp/食研备份.foodrd-backup");
    open.mockResolvedValue("/tmp/旧备份.foodrd-backup");
    const picker = new TauriBackupFilePicker();

    await expect(
      picker.pickBackupDestination("食研备份"),
    ).resolves.toBe("/tmp/食研备份.foodrd-backup");
    await expect(picker.pickBackupSource()).resolves.toBe(
      "/tmp/旧备份.foodrd-backup",
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: "食研备份.foodrd-backup",
      filters: [
        { name: "Ninka FoodLab 备份", extensions: ["foodrd-backup"] },
      ],
    });
    expect(open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [
        { name: "Ninka FoodLab 备份", extensions: ["foodrd-backup"] },
      ],
    });
  });

  it("does not pretend to provide native backup paths in browser mode", async () => {
    const picker = new BrowserBackupFilePicker();

    await expect(picker.pickBackupDestination("backup")).resolves.toBeNull();
    await expect(picker.pickBackupSource()).resolves.toBeNull();
  });
});
