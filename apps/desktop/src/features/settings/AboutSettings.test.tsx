import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import { AboutSettings } from "./AboutSettings";

describe("AboutSettings", () => {
  it("reads the installed version and only checks for updates after a click", async () => {
    const checkForUpdates = vi.fn(async () => ({
      status: "update_available" as const,
      currentVersion: "0.2.1",
      latestVersion: "0.3.0",
      releaseUrl:
        "https://github.com/meng1986290016-hub/ninka-foodlab/releases/tag/v0.3.0",
      publishedAt: "2026-08-29T00:00:00Z",
    }));
    const openReleasePage = vi.fn(async () => undefined);
    const api = {
      getAppVersion: vi.fn(async () => ({ currentVersion: "0.2.1" })),
      checkForUpdates,
      openReleasePage,
    } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<AboutSettings api={api} />);
    expect(await screen.findByText("V0.2.1")).toBeTruthy();
    expect(checkForUpdates).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "检查更新" }));
    expect(await screen.findByText("发现新版本 V0.3.0")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "打开下载页面" }));
    await waitFor(() => expect(openReleasePage).toHaveBeenCalledTimes(1));
  });

  it("shows an explicit check failure instead of claiming the app is current", async () => {
    const api = {
      getAppVersion: vi.fn(async () => ({ currentVersion: "0.2.1" })),
      checkForUpdates: vi.fn(async () => {
        throw new Error("无法连接 GitHub，请检查网络后重试");
      }),
      openReleasePage: vi.fn(),
    } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<AboutSettings api={api} />);
    await user.click(await screen.findByRole("button", { name: "检查更新" }));
    expect(
      await screen.findByText("无法连接 GitHub，请检查网络后重试"),
    ).toBeTruthy();
    expect(screen.queryByText("已是最新稳定版")).toBeNull();
  });
});
