import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserResearchReportFilePicker,
  TauriResearchReportFilePicker,
} from "./research-report-file-picker";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));

describe("ResearchReportFilePicker", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses a format-specific native save dialog", async () => {
    save.mockResolvedValue("/tmp/酸奶研发报告.pdf");
    const picker = new TauriResearchReportFilePicker();

    await expect(
      picker.pickDestination("pdf", "酸奶研发报告"),
    ).resolves.toBe("/tmp/酸奶研发报告.pdf");
    expect(save).toHaveBeenCalledWith({
      defaultPath: "酸奶研发报告.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
  });

  it("returns a safe browser download name without asking for a path", async () => {
    const picker = new BrowserResearchReportFilePicker();

    await expect(
      picker.pickDestination("xlsx", "酸奶研发报告"),
    ).resolves.toBe("酸奶研发报告.xlsx");
  });
});
