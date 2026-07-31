import { open, save } from "@tauri-apps/plugin-dialog";

const BACKUP_FILTER = {
  name: "食研工作台备份",
  extensions: ["foodrd-backup"],
};

export interface BackupFilePicker {
  pickBackupDestination(defaultName: string): Promise<string | null>;
  pickBackupSource(): Promise<string | null>;
}

export class TauriBackupFilePicker implements BackupFilePicker {
  pickBackupDestination(defaultName: string) {
    return save({
      defaultPath: `${defaultName}.foodrd-backup`,
      filters: [BACKUP_FILTER],
    });
  }

  async pickBackupSource() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [BACKUP_FILTER],
    });
    return Array.isArray(selected) ? selected[0] ?? null : selected;
  }
}

export class BrowserBackupFilePicker implements BackupFilePicker {
  async pickBackupDestination(_defaultName: string) {
    return null;
  }

  async pickBackupSource() {
    return null;
  }
}

export function createBackupFilePicker(): BackupFilePicker {
  return window.__TAURI_INTERNALS__ === undefined
    ? new BrowserBackupFilePicker()
    : new TauriBackupFilePicker();
}
