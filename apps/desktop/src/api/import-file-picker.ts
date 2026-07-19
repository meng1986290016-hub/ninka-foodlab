import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  ImportFileReference,
  IngredientExchangeFormat,
} from "./import-types";

export const INGREDIENT_SOURCE_FILTER = {
  name: "原料资料",
  extensions: ["jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "csv", "txt"],
};

export interface ImportFilePicker {
  pickSources(): Promise<ImportFileReference[]>;
  pickDestination(
    format: IngredientExchangeFormat,
    defaultName: string,
  ): Promise<string | null>;
}

export class TauriImportFilePicker implements ImportFilePicker {
  async pickSources() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [INGREDIENT_SOURCE_FILTER],
    });
    const paths = selected === null
      ? []
      : Array.isArray(selected)
        ? selected
        : [selected];
    return paths.map((value) => ({ kind: "native_path" as const, value }));
  }

  pickDestination(format: IngredientExchangeFormat, defaultName: string) {
    return save({
      defaultPath: `${defaultName}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
  }
}

export class BrowserImportFilePicker implements ImportFilePicker {
  constructor(private readonly documentRef: Document = document) {}

  pickSources() {
    return new Promise<ImportFileReference[]>((resolve) => {
      const input = this.documentRef.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = INGREDIENT_SOURCE_FILTER.extensions
        .map((extension) => `.${extension}`)
        .join(",");
      input.hidden = true;
      const finish = (files: FileList | File[] | null) => {
        input.remove();
        resolve(
          Array.from(files ?? []).map((file) =>
            file.type === ""
              ? { kind: "browser_demo" as const, value: file.name }
              : {
                  kind: "browser_demo" as const,
                  value: file.name,
                  mediaType: file.type,
                },
          ),
        );
      };
      input.addEventListener("change", () => finish(input.files), { once: true });
      input.addEventListener("cancel", () => finish(null), { once: true });
      this.documentRef.body.append(input);
      input.click();
    });
  }

  async pickDestination(
    _format: IngredientExchangeFormat,
    _defaultName: string,
  ) {
    return null;
  }
}
