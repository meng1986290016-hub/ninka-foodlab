import type { CliDetectionResult } from "../../api/agent-types";

interface CliProviderFieldsProps {
  detection: CliDetectionResult | undefined;
  executablePath: string | null;
  onExecutablePathChange(path: string): void;
  onDetect(): void;
}

export function CliProviderFields({
  detection,
  executablePath,
  onExecutablePathChange,
  onDetect,
}: CliProviderFieldsProps) {
  return (
    <div className="cli-provider-fields">
      <div className="cli-detection">
        <div>
          <strong>
            {detection?.installed ? "已检测到本机 CLI" : "尚未检测到本机 CLI"}
          </strong>
          <p>{detection?.message ?? "可自动检测，也可以手动选择可执行文件。"}</p>
          {detection?.version ? <small>{detection.version}</small> : null}
        </div>
        <button className="button button--secondary" onClick={onDetect} type="button">
          重新检测
        </button>
      </div>
      <label className="settings-field settings-field--wide">
        <span>可执行文件路径</span>
        <input
          onChange={(event) => onExecutablePathChange(event.target.value)}
          placeholder="自动检测，或粘贴本机可执行文件路径"
          value={executablePath ?? ""}
        />
        <small>本机 CLI 与 API 使用相同的食品研发工具权限。</small>
      </label>
    </div>
  );
}
