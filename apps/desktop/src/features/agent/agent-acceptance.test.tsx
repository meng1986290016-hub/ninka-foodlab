import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../../App";
import { BrowserAgentEventSource } from "../../api/agent-event-source";
import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { ImportFileReference } from "../../api/import-types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function picker(files: ImportFileReference[]): ImportFilePicker {
  return {
    async pickSources() {
      return files;
    },
    async pickDestination() {
      return null;
    },
  };
}

describe("food R&D Agent acceptance", () => {
  it("keeps one unsaved draft after two explicit human saves and restart", async () => {
    const storage = new MemoryStorage();
    const events = new BrowserAgentEventSource();
    const api = new BrowserDemoApi({
      storage,
      agentEvents: events,
      now: () => "2026-07-30T20:00:00.000Z",
    });
    const files: ImportFileReference[] = [
      { kind: "browser_demo", value: "乳粉-A-标签.png", mediaType: "image/png" },
      { kind: "browser_demo", value: "乳粉-B-标签.png", mediaType: "image/png" },
      {
        kind: "browser_demo",
        value: "乳清蛋白-规格书.pdf",
        mediaType: "application/pdf",
      },
    ];
    const user = userEvent.setup();
    const view = render(
      <App api={api} agentEvents={events} filePicker={picker(files)} />,
    );

    await user.click(
      screen.getByRole("button", { name: "打开食品研发 Agent" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "添加原料资料" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "给食品研发 Agent 发消息" }),
      "读取这些资料，分别建立供应商版本",
    );
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(
      await screen.findByText("已分别识别 3 份原料资料，并生成 3 张待人工复核草稿。"),
    ).toBeTruthy();
    expect(
      await screen.findAllByRole("button", { name: "打开并检查" }),
    ).toHaveLength(3);

    async function saveNextSupplier(
      supplierName: string,
      proteinValue?: string,
      continueToNext = false,
      openDialog = true,
    ) {
      if (openDialog) {
        await user.click(
          screen.getAllByRole("button", { name: "打开并检查" })[0]!,
        );
      }
      const dialog = await screen.findByRole("dialog", {
        name: "人工复核原料草稿",
      });
      const material = within(dialog).getByLabelText("通用原料名称");
      await user.clear(material);
      await user.type(material, "Agent验收脱脂乳粉");
      const supplier = within(dialog).getByLabelText(
        "供应商名称（新建或修正）",
      );
      await user.clear(supplier);
      await user.type(supplier, supplierName);
      if (proteinValue !== undefined) {
        await user.click(
          within(dialog).getByRole("tab", { name: "营养与过敏原" }),
        );
        const protein = await within(dialog).findByLabelText("蛋白质（g）");
        await user.clear(protein);
        await user.type(protein, proteinValue);
      }
      await user.click(
        within(dialog).getByRole("button", {
          name: continueToNext ? "保存并复核下一张" : "仅保存并关闭",
        }),
      );
      if (continueToNext) {
        expect(await screen.findByText("第 2 / 3 张")).toBeTruthy();
      } else {
        await waitFor(() =>
          expect(
            screen.queryByRole("dialog", { name: "人工复核原料草稿" }),
          ).toBeNull(),
        );
      }
    }

    await saveNextSupplier("供应商A", "0", true);
    await saveNextSupplier("供应商B", undefined, false, false);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "打开并检查" }),
      ).toHaveLength(1),
    );

    const milkPowder = (await api.listMaterialGroups("Agent验收脱脂乳粉")).find(
      (group) => group.name === "Agent验收脱脂乳粉",
    )!;
    expect(milkPowder.variants).toHaveLength(2);
    expect(new Set(milkPowder.variants.map((variant) => variant.supplierId)).size).toBe(2);
    const supplierA = milkPowder.variants.find(
      (variant) => variant.supplierName === "供应商A",
    )!;
    const supplierB = milkPowder.variants.find(
      (variant) => variant.supplierName === "供应商B",
    )!;
    expect(
      supplierA.nutrition.values.find(
        (value) => value.nutrientDefinitionId === "protein",
      )?.value,
    ).toBe("0");
    expect(
      supplierB.nutrition.values.find(
        (value) => value.nutrientDefinitionId === "protein",
      )?.value,
    ).toBeNull();
    expect(supplierA.internalCode).toBeNull();
    expect(supplierB.internalCode).toBeNull();

    view.unmount();
    render(<App api={api} agentEvents={events} filePicker={picker(files)} />);
    await user.click(
      screen.getByRole("button", { name: "打开食品研发 Agent" }),
    );
    expect(
      await screen.findByText("读取这些资料，分别建立供应商版本"),
    ).toBeTruthy();
    expect(
      await screen.findAllByRole("button", { name: "打开并检查" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "在原料库查看" }),
    ).toHaveLength(2);
  }, 15_000);
});
