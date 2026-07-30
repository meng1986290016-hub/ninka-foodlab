import { useEffect, useMemo, useState } from "react";

import type {
  AgentProviderConfig,
  AgentProviderConfigInput,
  CliDetectionResult,
} from "../../api/agent-types";
import type { DesktopApi } from "../../api/desktop-api";
import { CliProviderFields } from "./CliProviderFields";
import { CustomProviderFields } from "./CustomProviderFields";
import { ProviderCard } from "./ProviderCard";
import {
  canRunIngredientAgent,
  editableProvider,
  isCliProvider,
  needsApiKey,
} from "./provider-utils";

interface ModelProviderSettingsProps {
  api: DesktopApi;
}

export function ModelProviderSettings({ api }: ModelProviderSettingsProps) {
  const [providers, setProviders] = useState<AgentProviderConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detections, setDetections] = useState<CliDetectionResult[]>([]);
  const [error, setError] = useState("");

  async function refreshProviders() {
    setProviders(await api.listAgentProviderConfigs());
  }

  async function refreshDetections() {
    try {
      setDetections(await api.detectCliProviders());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CLI 检测失败");
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listAgentProviderConfigs(),
      api.detectCliProviders().catch(() => []),
    ]).then(([nextProviders, nextDetections]) => {
      if (!active) return;
      setProviders(nextProviders);
      setDetections(nextDetections);
    });
    return () => {
      active = false;
    };
  }, [api]);

  const detectionByKind = useMemo(
    () => new Map(detections.map((item) => [item.kind, item])),
    [detections],
  );

  return (
    <section className="settings-section" aria-labelledby="model-settings-title">
      <div className="settings-section__heading">
        <h2 id="model-settings-title">LLM 模型</h2>
        <p>
          每个服务商独立保存配置；启用一个模型时，其他模型会自动停用。
        </p>
      </div>
      {error ? <p className="page-error">{error}</p> : null}
      <div className="provider-list">
        {providers.map((provider) => (
          <ProviderEditor
            api={api}
            detection={
              isCliProvider(provider)
                ? detectionByKind.get(
                    provider.kind as CliDetectionResult["kind"],
                  )
                : undefined
            }
            expanded={expandedId === provider.id}
            key={provider.id}
            onDetect={refreshDetections}
            onRefresh={refreshProviders}
            onToggle={() =>
              setExpandedId((current) =>
                current === provider.id ? null : provider.id,
              )
            }
            provider={provider}
          />
        ))}
      </div>
    </section>
  );
}

interface ProviderEditorProps {
  api: DesktopApi;
  provider: AgentProviderConfig;
  detection: CliDetectionResult | undefined;
  expanded: boolean;
  onToggle(): void;
  onRefresh(): Promise<void>;
  onDetect(): Promise<void>;
}

function ProviderEditor({
  api,
  provider,
  detection,
  expanded,
  onToggle,
  onRefresh,
  onDetect,
}: ProviderEditorProps) {
  const [form, setForm] = useState<AgentProviderConfigInput>(() =>
    editableProvider(provider),
  );
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(editableProvider(provider));
  }, [provider]);

  function update<K extends keyof AgentProviderConfigInput>(
    key: K,
    value: AgentProviderConfigInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function normalized(
    input: AgentProviderConfigInput,
  ): AgentProviderConfigInput {
    if (
      isCliProvider(provider) &&
      !input.executablePath &&
      detection?.installed &&
      detection.executablePath
    ) {
      return { ...input, executablePath: detection.executablePath };
    }
    return input;
  }

  function validateForActivation(input: AgentProviderConfigInput) {
    if (!canRunIngredientAgent({ ...provider, ...input })) {
      return "该模型缺少工具调用或结构化输出能力，不能用于原料识别。";
    }
    if (isCliProvider(provider)) {
      return input.executablePath?.trim()
        ? ""
        : "请先检测或填写本机 CLI 路径。";
    }
    if (!input.endpoint.trim() || !input.model.trim()) {
      return "请先填写 Endpoint 和模型名称。";
    }
    if (needsApiKey(provider) && !provider.hasSecret && !apiKey.trim()) {
      return "请先填写 API 密钥。";
    }
    return "";
  }

  async function persist(next: AgentProviderConfigInput) {
    const saved = await api.saveAgentProviderConfig(normalized(next));
    if (apiKey.trim()) {
      await api.setAgentProviderSecret({
        providerId: provider.id,
        apiKey: apiKey.trim(),
      });
      setApiKey("");
    }
    await onRefresh();
    return saved;
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await persist(form);
      setMessage("配置已保存");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "配置保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const next = normalized({ ...form, enabled: true });
    const validation = validateForActivation(next);
    if (validation) {
      setMessage(validation);
      onToggle();
      return;
    }
    setBusy(true);
    try {
      await persist(next);
      setMessage("已切换为当前聊天模型");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "模型启用失败");
    } finally {
      setBusy(false);
    }
  }

  async function runTest(kind: "connection" | "structured_output") {
    setBusy(true);
    setMessage("");
    try {
      await persist(form);
      const result = await api.testAgentProvider(provider.id, kind);
      setMessage(result.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "模型测试失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadModels() {
    setBusy(true);
    try {
      await persist(form);
      const options = await api.listAgentProviderModels(provider.id);
      setModels(options.map((option) => option.id));
      setMessage(
        options.length > 0 ? `已读取 ${options.length} 个模型` : "可直接输入模型名称",
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "模型列表读取失败");
    } finally {
      setBusy(false);
    }
  }

  const activationDisabled = !canRunIngredientAgent(provider);

  return (
    <ProviderCard
      activationDisabled={activationDisabled || busy}
      activationHint={
        activationDisabled
          ? "该配置缺少工具调用或结构化输出能力"
          : undefined
      }
      expanded={expanded}
      onActivation={() => void activate()}
      onToggle={onToggle}
      provider={provider}
    >
      <div className="provider-capabilities" aria-label="模型能力">
        <span>文本</span>
        {provider.capabilities.images ? <span>图片</span> : null}
        <span>工具</span>
        <span>结构化输出</span>
      </div>

      {!provider.capabilities.images ? (
        <p className="provider-warning">
          当前模型不读取图片；上传标签照片前，需要在“通用”中选择图片识别模型。
        </p>
      ) : null}

      {provider.kind === "custom" ? (
        <CustomProviderFields
          api={api}
          onChange={(protocol, values) =>
            setForm((current) => ({
              ...current,
              protocol,
              endpoint: values.endpoint,
              model: values.model,
            }))
          }
          protocol={
            form.protocol === "anthropic_messages"
              ? "anthropic_messages"
              : "openai_compatible"
          }
        />
      ) : isCliProvider(provider) ? (
        <CliProviderFields
          detection={detection}
          executablePath={form.executablePath}
          onDetect={() => void onDetect()}
          onExecutablePathChange={(path) => update("executablePath", path)}
        />
      ) : (
        <label className="settings-field settings-field--wide">
          <span>Endpoint</span>
          <input
            onChange={(event) => update("endpoint", event.target.value)}
            value={form.endpoint}
          />
        </label>
      )}

      {needsApiKey(provider) ? (
        <label className="settings-field settings-field--wide">
          <span>
            API 密钥
            {provider.hasSecret ? <small className="saved-key">已保存</small> : null}
          </span>
          <input
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              provider.hasSecret ? "留空保持现有密钥" : "输入 API 密钥"
            }
            type="password"
            value={apiKey}
          />
        </label>
      ) : null}

      {provider.kind !== "custom" ? (
        <label className="settings-field settings-field--wide">
          <span>模型</span>
          <div className="model-field-row">
            <input
              list={`models-${provider.id}`}
              onChange={(event) => update("model", event.target.value)}
              placeholder={
                isCliProvider(provider) ? "可留空使用 CLI 默认模型" : "输入模型名称"
              }
              value={form.model}
            />
            <button
              className="button button--secondary"
              disabled={busy}
              onClick={() => void loadModels()}
              type="button"
            >
              获取列表
            </button>
          </div>
          <datalist id={`models-${provider.id}`}>
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
      ) : null}

      <div className="provider-field-grid">
        <label className="settings-field">
          <span>上下文窗口</span>
          <select
            onChange={(event) =>
              update("contextWindow", Number(event.target.value))
            }
            value={form.contextWindow}
          >
            {[32_000, 64_000, 128_000, 200_000, 256_000].map((size) => (
              <option key={size} value={size}>
                {size / 1000}K
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>推理强度</span>
          <select
            onChange={(event) =>
              update(
                "reasoningEffort",
                event.target.value as AgentProviderConfigInput["reasoningEffort"],
              )
            }
            value={form.reasoningEffort}
          >
            <option value="auto">自动</option>
            <option value="off">关闭</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="max">最大</option>
          </select>
        </label>
        <label className="settings-field">
          <span>最长运行时间（秒）</span>
          <input
            min={10}
            onChange={(event) =>
              update("timeoutSeconds", Number(event.target.value))
            }
            type="number"
            value={form.timeoutSeconds}
          />
        </label>
      </div>

      <div className="provider-actions">
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          保存配置
        </button>
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() => void runTest("connection")}
          type="button"
        >
          测试连接
        </button>
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() => void runTest("structured_output")}
          type="button"
        >
          测试功能
        </button>
        {message ? <span className="provider-message">{message}</span> : null}
      </div>
    </ProviderCard>
  );
}
