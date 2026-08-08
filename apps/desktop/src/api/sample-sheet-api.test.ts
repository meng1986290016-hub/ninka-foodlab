import { createSampleSheetXlsxExport } from "@food-rd/core";
import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import type { SampleSheetExportRequest } from "./sample-sheet-types";
import { TauriDesktopApi } from "./tauri-desktop-api";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function request(): SampleSheetExportRequest {
  const bytes = createSampleSheetXlsxExport({
    recipeName: "测试配方",
    sourceLabel: "V1 正式版本",
    basisLabel: "计划投料量",
    targetAmountLabel: "500.0 g",
    generatedDate: "2026-08-02",
    rows: [],
  });
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return {
    destinationPath: "/tmp/测试配方.xlsx",
    fileName: "测试配方.xlsx",
    bytesBase64: btoa(binary),
  };
}

describe("sample sheet desktop API", () => {
  it("maps the native export command", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = new TauriDesktopApi(invoke);
    const input = request();

    await api.exportSampleSheet(input);

    expect(invoke).toHaveBeenCalledWith("export_sample_sheet", { request: input });
  });

  it("downloads a validated workbook in browser mode", async () => {
    const api = new BrowserDemoApi({ storage: new MemoryStorage() });
    const createObjectURL = vi.fn(() => "blob:sample-sheet");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await api.exportSampleSheet(request());

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sample-sheet");
    await expect(
      api.exportSampleSheet({ ...request(), fileName: "错误.txt" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    click.mockRestore();
  });
});
