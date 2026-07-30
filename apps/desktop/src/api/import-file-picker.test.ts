import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserImportFilePicker,
  INGREDIENT_SOURCE_FILTER,
  TauriImportFilePicker,
} from "./import-file-picker";

const { open, save, onDragDropEvent } = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  onDragDropEvent: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open, save }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent }),
}));

describe("ImportFilePicker", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("maps every selected desktop path to a native reference", async () => {
    open.mockResolvedValue(["/tmp/a.xlsx", "/tmp/b.pdf"]);
    const picker = new TauriImportFilePicker();

    await expect(picker.pickSources()).resolves.toEqual([
      { kind: "native_path", value: "/tmp/a.xlsx" },
      { kind: "native_path", value: "/tmp/b.pdf" },
    ]);
    expect(open).toHaveBeenCalledWith({
      multiple: true,
      directory: false,
      filters: [INGREDIENT_SOURCE_FILTER],
    });
  });

  it("returns only browser file names and never reads their bytes", async () => {
    const picker = new BrowserImportFilePicker(document);
    const selecting = picker.pickSources();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(["private-a"], "供应商A.xlsx"),
      new File(["private-b"], "供应商B.pdf"),
    ];
    Object.defineProperty(input, "files", { value: files });
    input.dispatchEvent(new Event("change"));

    await expect(selecting).resolves.toEqual([
      { kind: "browser_demo", value: "供应商A.xlsx" },
      { kind: "browser_demo", value: "供应商B.pdf" },
    ]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("builds a format-specific save destination", async () => {
    save.mockResolvedValue("/tmp/原料库.xlsx");
    const picker = new TauriImportFilePicker();

    await expect(picker.pickDestination("xlsx", "原料库")).resolves.toBe(
      "/tmp/原料库.xlsx",
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: "原料库.xlsx",
      filters: [{ name: "XLSX", extensions: ["xlsx"] }],
    });
  });

  it("maps desktop drag-and-drop paths without reading file contents", async () => {
    const unlisten = vi.fn();
    onDragDropEvent.mockImplementation(async (handler) => {
      handler({
        payload: {
          type: "drop",
          paths: ["/tmp/标签.png", "/tmp/规格书.pdf"],
          position: { x: 10, y: 10 },
        },
      });
      return unlisten;
    });
    const listener = vi.fn();
    const picker = new TauriImportFilePicker();

    await expect(picker.subscribeSourceDrops(listener)).resolves.toBe(unlisten);
    expect(listener).toHaveBeenCalledWith([
      { kind: "native_path", value: "/tmp/标签.png" },
      { kind: "native_path", value: "/tmp/规格书.pdf" },
    ]);
  });
});
