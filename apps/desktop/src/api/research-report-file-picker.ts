import type { ResearchReportExportFormat } from "@food-rd/core";
import { save } from "@tauri-apps/plugin-dialog";

export interface ResearchReportFilePicker {
  pickDestination(
    format: ResearchReportExportFormat,
    defaultName: string,
  ): Promise<string | null>;
}

export class TauriResearchReportFilePicker
  implements ResearchReportFilePicker
{
  pickDestination(
    format: ResearchReportExportFormat,
    defaultName: string,
  ) {
    return save({
      defaultPath: `${defaultName}.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] },
      ],
    });
  }
}

export class BrowserResearchReportFilePicker
  implements ResearchReportFilePicker
{
  async pickDestination(
    format: ResearchReportExportFormat,
    defaultName: string,
  ) {
    return `${defaultName}.${format}`;
  }
}

export function createResearchReportFilePicker(): ResearchReportFilePicker {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserResearchReportFilePicker()
    : new TauriResearchReportFilePicker();
}
