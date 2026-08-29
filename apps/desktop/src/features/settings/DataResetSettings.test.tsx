import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DataResetExecuteRequest,
  DataResetPreview,
  DataResetResult,
} from "../../api/data-reset-types";
import type { DesktopApi } from "../../api/desktop-api";
import { DesktopApiError } from "../../api/types";
import { DataResetSettings } from "./DataResetSettings";

const preview: DataResetPreview = {
  previewId: "preview-1",
  confirmationPhrase: "清空本机研发数据",
  noBackupConfirmationPhrase: "我确认不备份并清空本机研发数据",
  counts: {
    materialGroups: 3,
    ingredientVariants: 5,
    recipes: 2,
    nutritionLabels: 1,
    researchReports: 1,
    importDrafts: 4,
    agentTasks: 6,
    agentConversations: 2,
    attachments: 7,
    totalRecords: 24,
  },
  latestRecovery: null,
};

function fixture() {
  const executeDataReset = vi.fn<
    (request: DataResetExecuteRequest) => Promise<DataResetResult>
  >(async () => ({
    recovery: {
      id: "recovery-1",
      createdAt: "2026-08-29T00:00:00Z",
      directoryName: "before-clear-test",
    },
    clearedRecords: 24,
    clearedAttachments: 7,
    restartRequired: true,
  }));
  const restartApplication = vi.fn(async () => undefined);
  return {
    api: {
      previewDataReset: vi.fn(async () => preview),
      executeDataReset,
      getLatestDataResetRecovery: vi.fn(async () => null),
      restoreLatestDataResetRecovery: vi.fn(),
      restartApplication,
    } as unknown as DesktopApi,
    executeDataReset,
    restartApplication,
  };
}

describe("DataResetSettings", () => {
  beforeEach(() => localStorage.clear());

  it("requires a preview and exact phrase before clearing and restarting", async () => {
    const { api, executeDataReset, restartApplication } = fixture();
    const user = userEvent.setup();
    localStorage.setItem("foodlab.agent.active-conversation.v1", "task-1");

    render(<DataResetSettings api={api} nativeAvailable />);
    await user.click(screen.getByRole("button", { name: "先检查清空影响" }));
    expect(await screen.findByText("已登记附件")).toBeTruthy();
    const clear = screen.getByRole("button", { name: "创建安全快照并清空" });
    expect((clear as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      screen.getByLabelText(/输入“清空本机研发数据”以确认/),
      "清空本机研发数据",
    );
    await user.click(clear);

    await waitFor(() => expect(executeDataReset).toHaveBeenCalledTimes(1));
    expect(executeDataReset).toHaveBeenCalledWith({
      previewId: "preview-1",
      confirmationPhrase: "清空本机研发数据",
      allowWithoutBackup: false,
    });
    expect(localStorage.getItem("foodlab.agent.active-conversation.v1")).toBeNull();
    expect(restartApplication).toHaveBeenCalledTimes(1);
  });

  it("only offers no-backup continuation after a real snapshot failure", async () => {
    const { api, executeDataReset } = fixture();
    executeDataReset
      .mockRejectedValueOnce(
        new DesktopApiError(
          "safety_backup_failed",
          "清空前安全快照失败，当前数据未改变",
        ),
      )
      .mockResolvedValueOnce({
        recovery: null,
        clearedRecords: 24,
        clearedAttachments: 7,
        restartRequired: true,
      });
    const user = userEvent.setup();

    render(<DataResetSettings api={api} nativeAvailable />);
    await user.click(screen.getByRole("button", { name: "先检查清空影响" }));
    await user.type(
      screen.getByLabelText(/输入“清空本机研发数据”以确认/),
      "清空本机研发数据",
    );
    await user.click(screen.getByRole("button", { name: "创建安全快照并清空" }));
    expect(await screen.findByText("安全快照失败，数据尚未清空")).toBeTruthy();
    await user.type(
      screen.getByLabelText(/输入完整短语/),
      "我确认不备份并清空本机研发数据",
    );
    await user.click(screen.getByRole("button", { name: "不备份并继续清空" }));

    await waitFor(() => expect(executeDataReset).toHaveBeenCalledTimes(2));
    expect(executeDataReset.mock.calls[1]?.[0]).toMatchObject({
      allowWithoutBackup: true,
      noBackupConfirmationPhrase: "我确认不备份并清空本机研发数据",
    });
  });
});
