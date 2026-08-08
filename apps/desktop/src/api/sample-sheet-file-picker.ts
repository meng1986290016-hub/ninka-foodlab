import { save } from "@tauri-apps/plugin-dialog";

export interface SampleSheetFilePicker {
  pickDestination(defaultName: string): Promise<string | null>;
}

export class TauriSampleSheetFilePicker implements SampleSheetFilePicker {
  pickDestination(defaultName: string) {
    return save({
      defaultPath: `${defaultName}.xlsx`,
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    });
  }
}

export class BrowserSampleSheetFilePicker implements SampleSheetFilePicker {
  async pickDestination(defaultName: string) {
    return `${defaultName}.xlsx`;
  }
}

export function createSampleSheetFilePicker(): SampleSheetFilePicker {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserSampleSheetFilePicker()
    : new TauriSampleSheetFilePicker();
}
