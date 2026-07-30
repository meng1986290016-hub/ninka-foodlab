import { useEffect, type DragEvent, type KeyboardEvent } from "react";

import type { ImportFilePicker } from "../../api/import-file-picker";
import type { ImportFileReference } from "../../api/import-types";
import { Icon } from "../../components/Icon";

interface AgentComposerProps {
  text: string;
  files: ImportFileReference[];
  filePicker: ImportFilePicker;
  disabled?: boolean;
  running: boolean;
  onTextChange(value: string): void;
  onFilesChange(files: ImportFileReference[]): void;
  onSend(): void;
  onStop(): void;
}

function browserFileReference(file: File): ImportFileReference {
  return {
    kind: "browser_demo",
    value: file.name,
    ...(file.type ? { mediaType: file.type } : {}),
  };
}

export function AgentComposer({
  text,
  files,
  filePicker,
  disabled = false,
  running,
  onTextChange,
  onFilesChange,
  onSend,
  onStop,
}: AgentComposerProps) {
  useEffect(() => {
    if (!filePicker.subscribeSourceDrops) return;
    let active = true;
    let unsubscribe = () => {};
    void filePicker
      .subscribeSourceDrops((dropped) => {
        if (active && !disabled && !running && dropped.length > 0) {
          onFilesChange([...files, ...dropped]);
        }
      })
      .then((stop) => {
        if (active) unsubscribe = stop;
        else stop();
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [disabled, filePicker, files, onFilesChange, running]);

  async function chooseFiles() {
    const selected = await filePicker.pickSources();
    if (selected.length > 0) onFilesChange([...files, ...selected]);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (
      disabled ||
      running ||
      window.__TAURI_INTERNALS__ !== undefined
    ) {
      return;
    }
    const dropped = Array.from(event.dataTransfer.files).map(
      browserFileReference,
    );
    if (dropped.length > 0) onFilesChange([...files, ...dropped]);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!running && !disabled && (text.trim() || files.length > 0)) onSend();
    }
  }

  return (
    <div
      className="agent-composer"
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      {files.length > 0 ? (
        <div aria-label="待发送附件" className="agent-file-list">
          {files.map((file, index) => (
            <span className="agent-file-chip" key={`${file.value}-${index}`}>
              <span>{file.value.split(/[\\/]/).pop()}</span>
              <button
                aria-label={`移除 ${file.value.split(/[\\/]/).pop()}`}
                onClick={() =>
                  onFilesChange(files.filter((_, position) => position !== index))
                }
                type="button"
              >
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        aria-label="给食品研发 Agent 发消息"
        disabled={running || disabled}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={keyDown}
        placeholder="描述任务，或上传多份原料资料…"
        rows={3}
        value={text}
      />
      <div className="agent-composer__actions">
        <button
          aria-label="添加原料资料"
          className="agent-attach-button"
          disabled={running || disabled}
          onClick={() => void chooseFiles()}
          type="button"
        >
          <Icon name="paperclip" size={17} />
          添加资料
        </button>
        {running ? (
          <button className="agent-stop-button" onClick={onStop} type="button">
            停止
          </button>
        ) : (
          <button
            className="agent-send-button"
            disabled={disabled || (!text.trim() && files.length === 0)}
            onClick={onSend}
            type="button"
          >
            发送
            <Icon name="send" size={15} />
          </button>
        )}
      </div>
      <small>可拖入多个文件；Enter 发送，Shift + Enter 换行。</small>
    </div>
  );
}
