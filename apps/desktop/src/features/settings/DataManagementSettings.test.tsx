import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BackupFilePicker } from "../../api/backup-file-picker";
import type { BackupPreflight } from "../../api/backup-types";
import type { DesktopApi } from "../../api/desktop-api";
import { DataManagementSettings } from "./DataManagementSettings";

const preflight = {
  createdAt: "2026-07-31T10:24:36+08:00",
  applicationVersion: "0.1.0",
  sourceSchemaVersion: 6,
  targetSchemaVersion: 7,
  requiresMigration: true,
  databaseBytes: 2_000_000,
  attachmentCount: 128,
  attachmentBytes: 27_000_000,
  totalBytes: 29_000_000,
  dataRecordCount: 3_208,
  counts: {
    materialGroups: 200,
    ingredientVariants: 300,
    recipes: 30,
    recipeVersions: 100,
    nutritionLabels: 30,
    nutritionLabelVersions: 50,
    researchReports: 20,
    agentConversations: 2_478,
  },
} satisfies BackupPreflight;

function fixture() {
  const createDataBackup = vi.fn(async () => ({
    formatVersion: 1,
    applicationId: "food-rd-studio",
    applicationVersion: "0.1.0",
    createdAt: "2026-07-31T10:30:00+08:00",
    schemaVersion: 7,
    database: {
      path: "database.sqlite3",
      byteSize: 2_000_000,
      sha256: "a".repeat(64),
    },
    attachments: [],
    totals: { attachmentCount: 0, totalBytes: 2_000_000 },
  }));
  const inspectDataBackup = vi.fn(async () => preflight);
  const restoreDataBackup = vi.fn(async () => ({
    preflight,
    safetyBackupFileName: "before-restore-safe.foodrd-backup",
    restoredSchemaVersion: 7,
  }));
  const filePicker: BackupFilePicker = {
    pickBackupDestination: vi.fn(async () => "/private/研发备份.foodrd-backup"),
    pickBackupSource: vi.fn(async () => "/private/实验备份.foodrd-backup"),
  };
  return {
    api: {
      createDataBackup,
      inspectDataBackup,
      restoreDataBackup,
    } as unknown as DesktopApi,
    createDataBackup,
    inspectDataBackup,
    restoreDataBackup,
    filePicker,
  };
}

describe("DataManagementSettings", () => {
  it("creates a verified backup through the native destination picker", async () => {
    const { api, createDataBackup, filePicker } = fixture();
    const user = userEvent.setup();

    render(
      <DataManagementSettings
        api={api}
        filePicker={filePicker}
        nativeAvailable
        now={() => new Date("2026-07-31T00:00:00.000Z")}
      />,
    );
    await user.click(screen.getByRole("button", { name: "创建备份" }));

    await waitFor(() => expect(createDataBackup).toHaveBeenCalledTimes(1));
    expect(filePicker.pickBackupDestination).toHaveBeenCalledWith(
      "food-rd-backup-2026-07-31",
    );
    expect(createDataBackup).toHaveBeenCalledWith(
      "/private/研发备份.foodrd-backup",
    );
    expect(await screen.findByText(/备份已创建并校验/)).toBeTruthy();
  });

  it("requires inspection and explicit confirmation before restore", async () => {
    const { api, inspectDataBackup, restoreDataBackup, filePicker } = fixture();
    const onRestored = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <DataManagementSettings
        api={api}
        filePicker={filePicker}
        nativeAvailable
        onRestored={onRestored}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "选择并检查备份" }),
    );

    await waitFor(() => expect(inspectDataBackup).toHaveBeenCalledTimes(1));
    expect(screen.getByText("已检查：实验备份.foodrd-backup")).toBeTruthy();
    expect(screen.getByText("schema 6 → 7")).toBeTruthy();
    expect(screen.getByText("3,208")).toBeTruthy();
    expect(screen.queryByText("/private/实验备份.foodrd-backup")).toBeNull();
    const restore = screen.getByRole("button", { name: "恢复所选备份" });
    expect((restore as HTMLButtonElement).disabled).toBe(true);

    await user.click(
      screen.getByRole("checkbox", {
        name: "我已确认将用所选备份替换当前数据",
      }),
    );
    expect((restore as HTMLButtonElement).disabled).toBe(false);
    await user.click(restore);

    await waitFor(() => expect(restoreDataBackup).toHaveBeenCalledTimes(1));
    expect(restoreDataBackup).toHaveBeenCalledWith(
      "/private/实验备份.foodrd-backup",
      true,
    );
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/恢复前安全副本：before-restore-safe/),
    ).toBeTruthy();
  });

  it("states that browser demo mode cannot perform native backup", () => {
    const { api, filePicker, createDataBackup } = fixture();

    render(
      <DataManagementSettings
        api={api}
        filePicker={filePicker}
        nativeAvailable={false}
      />,
    );

    expect(
      screen.getByText("浏览器演示模式不执行真实本机备份"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "创建备份" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createDataBackup).not.toHaveBeenCalled();
  });

  it("distinguishes a completed restore from a later UI refresh failure", async () => {
    const { api, filePicker, restoreDataBackup } = fixture();
    const user = userEvent.setup();

    render(
      <DataManagementSettings
        api={api}
        filePicker={filePicker}
        nativeAvailable
        onRestored={async () => {
          throw new Error("refresh failed");
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "选择并检查备份" }));
    await user.click(
      await screen.findByRole("checkbox", {
        name: "我已确认将用所选备份替换当前数据",
      }),
    );
    await user.click(screen.getByRole("button", { name: "恢复所选备份" }));

    await waitFor(() => expect(restoreDataBackup).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "数据已恢复，但界面刷新失败；请重新启动应用后核对数据",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("数据恢复失败，当前数据未被替换")).toBeNull();
  });
});
