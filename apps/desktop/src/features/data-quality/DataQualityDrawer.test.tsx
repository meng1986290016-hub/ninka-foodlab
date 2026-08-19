import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataQualityDrawer } from "./DataQualityDrawer";

describe("DataQualityDrawer", () => {
  it("closes from the backdrop and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            查看缺失
          </button>
          <DataQualityDrawer
            content={
              open
                ? {
                    kind: "gaps",
                    initialGrouping: "source",
                    report: {
                      title: "焦点测试",
                      completenessPercent: 100,
                      nutrientCoverage: [],
                      entries: [],
                    },
                  }
                : null
            }
            onClose={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "查看缺失" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "焦点测试" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("groups gaps, exposes the full path and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DataQualityDrawer
        content={{
          kind: "gaps",
          initialGrouping: "field",
          nutrientDefinitionId: "lactose",
          report: {
            title: "测试配方",
            completenessPercent: 80,
            nutrientCoverage: [
              {
                nutrientDefinitionId: "lactose",
                name: "乳糖",
                unit: "g",
                category: "nutrition",
                status: "partial",
                ratio: 0.75,
                knownMassGrams: "750",
                trackedMassGrams: "1000",
              },
            ],
            entries: [
              {
                id: "gap-1",
                category: "nutrition",
                state: "missing",
                fieldId: "lactose",
                fieldName: "乳糖",
                reason: "乳糖尚未录入",
                path: [
                  { id: "root", kind: "recipe", label: "测试配方" },
                  { id: "child", kind: "version", label: "糖浆 V2" },
                  {
                    id: "leaf",
                    kind: "ingredient",
                    label: "乳清粉（供应商A）",
                  },
                ],
                massGrams: "250",
                ingredientVariantId: "variant-1",
                materialGroupId: "group-1",
                editable: false,
              },
            ],
          },
        }}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "测试配方" });
    expect(within(dialog).getByText("投料覆盖率 75%", { exact: false })).toBeTruthy();
    expect(within(dialog).getByText("糖浆 V2")).toBeTruthy();
    expect(within(dialog).getByText("乳清粉（供应商A）")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "按原料" }));
    expect(within(dialog).getAllByText("乳清粉（供应商A）")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nutrition as read-only and labels zero separately from unknown", () => {
    render(
      <DataQualityDrawer
        content={{
          kind: "nutrition",
          detail: {
            title: "脱脂乳粉",
            subtitle: "供应商A · 25 kg",
            basisLabel: "每 100 g",
            sourceLabel: "标签图片",
            updatedAt: "2026-01-01T00:00:00.000Z",
            completenessPercent: 50,
            note: null,
            rows: [
              {
                nutrientDefinitionId: "fat",
                name: "脂肪",
                unit: "g",
                value: "0",
                category: "nutrition",
                status: "confirmed_zero",
                completenessRatio: 1,
              },
              {
                nutrientDefinitionId: "lactose",
                name: "乳糖",
                unit: "g",
                value: null,
                category: "nutrition",
                status: "unknown",
                completenessRatio: 0,
              },
            ],
          },
        }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("已确认 0")).toBeTruthy();
    expect(screen.getByText("未录入")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /保存/ })).toBeNull();
  });
});
