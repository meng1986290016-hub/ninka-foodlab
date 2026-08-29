import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentConfigurableProvider,
  AgentCredentialState,
  AgentModelCatalogItem,
  AgentModelDirectory,
  AgentRuntimeHealth,
  AgentSettingsDescription,
  AgentSettingsNamespace,
} from "../../api/agent-harness-types";
import type { DesktopApi } from "../../api/desktop-api";
import { Icon } from "../../components/Icon";
import { AppearanceSettings } from "./AppearanceSettings";

interface HarnessSettingsProps {
  api: DesktopApi;
  section: "general" | "models";
}

interface ProviderDirectoryResponse {
  providers: AgentConfigurableProvider[];
}

interface CredentialDescriptionResponse {
  credentials: Record<string, AgentCredentialState>;
}

interface DiscoveredModelsResponse {
  models: AgentModelCatalogItem[];
}

interface ProviderRow {
  entry: AgentConfigurableProvider;
  namespace: AgentSettingsNamespace | undefined;
  profile: Record<string, unknown> | undefined;
  configured: boolean;
  removable: boolean;
  keyRef: string | undefined;
  credential: AgentCredentialState | undefined;
}

const statusCopy: Record<
  AgentRuntimeHealth["status"],
  { title: string; detail: string }
> = {
  idle: {
    title: "Ninka Agent 尚未启动",
    detail: "进入 Agent 或模型设置后会自动启动。",
  },
  starting: {
    title: "Ninka Agent 正在启动",
    detail: "首次启动可能需要几秒钟。",
  },
  ready: {
    title: "Ninka Agent 已就绪",
    detail: "Agent 服务已在本机受保护的连接中运行。",
  },
  damaged: {
    title: "Agent 组件损坏",
    detail: "请重新安装 FoodLab；应用不会尝试联网下载或修复组件。",
  },
  failed: {
    title: "Agent 服务启动失败",
    detail: "可以重试；若持续失败，请查看 FoodLab 诊断信息。",
  },
};

const compactStatusCopy: Record<AgentRuntimeHealth["status"], string> = {
  idle: "尚未启动",
  starting: "正在启动",
  ready: "已就绪",
  damaged: "组件损坏",
  failed: "启动失败",
};

export function HarnessSettings({ api, section }: HarnessSettingsProps) {
  const [health, setHealth] = useState<AgentRuntimeHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadRuntime = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      let next = await api.getHarnessHealth();
      if (next.status === "idle") next = await api.startHarness();
      setHealth(next);
    } catch (cause) {
      setMessage(errorMessage(cause, "Agent 服务状态读取失败"));
      setHealth(await api.getHarnessHealth().catch(() => null));
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      setHealth(await api.startHarness());
    } catch (cause) {
      setMessage(errorMessage(cause, "Agent 服务启动失败"));
      setHealth(await api.getHarnessHealth().catch(() => health));
    } finally {
      setBusy(false);
    }
  }

  if (section === "models") {
    if (!health) return <p className="settings-loading">正在启动 Ninka Agent…</p>;
    const copy = statusCopy[health.status];
    return (
      <section className="settings-section" aria-labelledby="agent-models-title">
        <div className="settings-section__heading">
          <h2 id="agent-models-title">LLM 模型</h2>
          <p>配置 Provider、API Key、服务地址、模型目录和默认模型。</p>
        </div>
        {health.status === "ready" ? (
          <ModelSettings api={api} />
        ) : (
          <RuntimeStatusCard
            busy={busy}
            copy={copy}
            health={health}
            onRetry={() => void retry()}
          />
        )}
        {message ? <p className="settings-message" role="status">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="settings-section settings-section--general" aria-labelledby="agent-general-title">
      <div className="settings-section__heading">
        <h2 id="agent-general-title">Ninka Agent</h2>
        <p>运行组件随 FoodLab 安装和升级，不需要单独安装任何开发工具。</p>
      </div>
      <div className="agent-general-settings">
        <AppearanceSettings />
        {health ? (
          <RuntimeStatusCard
            busy={busy}
            compact
            copy={statusCopy[health.status]}
            health={health}
            onRetry={() => void retry()}
          />
        ) : (
          <p className="settings-loading">正在启动 Ninka Agent…</p>
        )}
        <div className="agent-general-safety-note">
          <Icon name="lock" size={18} />
          <p>
            Agent 仅可使用当前任务声明的 FoodLab 工具。终端、任意文件系统、网页抓取、浏览器自动化和外部工具服务均未开放；保存、覆盖、删除、外发或采纳仍须确认。
          </p>
        </div>
      </div>
      {message ? <p className="settings-message" role="status">{message}</p> : null}
    </section>
  );
}

function RuntimeStatusCard({
  busy,
  compact = false,
  copy,
  health,
  onRetry,
}: {
  busy: boolean;
  compact?: boolean;
  copy: { title: string; detail: string };
  health: AgentRuntimeHealth;
  onRetry(): void;
}) {
  if (compact) {
    return (
      <div className="settings-preference-row settings-runtime-row">
        <Icon className="settings-preference-row__icon" name="database" size={22} />
        <div className="settings-preference-row__copy">
          <strong>Agent 服务</strong>
          <p>{health.lastError || copy.detail}</p>
        </div>
        <div className="settings-runtime-row__actions">
          <span className={`settings-runtime-status is-${health.status}`}>
            <span className={`harness-status-dot is-${health.status}`} />
            <span aria-hidden="true">{compactStatusCopy[health.status]}</span>
            <span className="sr-only">{copy.title}</span>
          </span>
          {health.status === "failed" || health.status === "idle" ? (
            <button className="button button--secondary settings-runtime-retry" disabled={busy} onClick={onRetry} type="button">
              {busy ? "正在启动…" : "重试启动"}
            </button>
          ) : null}
        </div>
        {health.reinstallRequired ? (
          <p className="settings-runtime-row__reinstall">请重新安装当前架构对应的 FoodLab 安装包。</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="settings-card harness-settings-card">
      <div className="settings-row">
        <div>
          <strong>{copy.title}</strong>
          <p>{health.lastError || copy.detail}</p>
        </div>
        <span
          aria-label={copy.title}
          className={`harness-status-dot is-${health.status}`}
        />
      </div>
      {health.status === "failed" || health.status === "idle" ? (
        <button className="button button--primary" disabled={busy} onClick={onRetry} type="button">
          {busy ? "正在启动…" : "重试启动"}
        </button>
      ) : null}
      {health.reinstallRequired ? (
        <p className="settings-safety-note">请重新安装当前架构对应的 FoodLab 安装包。</p>
      ) : null}
    </div>
  );
}

function ModelSettings({ api }: { api: DesktopApi }) {
  const [providers, setProviders] = useState<AgentConfigurableProvider[]>([]);
  const [settings, setSettings] = useState<AgentSettingsDescription | null>(null);
  const [credentials, setCredentials] = useState<Record<string, AgentCredentialState>>({});
  const [directory, setDirectory] = useState<AgentModelDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [providerResponse, settingsResponse, modelDirectory] = await Promise.all([
        api.agentRuntimeSettingsCall<ProviderDirectoryResponse>("llm.providers", {}),
        api.agentRuntimeSettingsCall<AgentSettingsDescription>("settings.describe", {
        }),
        api.getAgentModelDirectory(),
      ]);
      const refs = credentialRefs(providerResponse.providers, settingsResponse);
      const credentialResponse = refs.length
        ? await api.agentRuntimeSettingsCall<CredentialDescriptionResponse>(
            "credentials.describe",
            { refs },
          )
        : { credentials: {} };
      setProviders(providerResponse.providers);
      setSettings(settingsResponse);
      setCredentials(credentialResponse.credentials);
      setDirectory(modelDirectory);
    } catch (cause) {
      setError(errorMessage(cause, "模型设置读取失败"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => settings ? providerRows(providers, settings, credentials) : [],
    [credentials, providers, settings],
  );

  if (loading && !settings) return <p className="settings-loading">正在读取模型设置…</p>;
  if (error && !settings) {
    return (
      <div className="settings-card harness-error-card" role="alert">
        <p>{error}</p>
        <button className="button button--secondary" onClick={() => void load()} type="button">重新读取</button>
      </div>
    );
  }

  return (
    <div className="agent-model-settings">
      {!directory?.hasUsableProvider ? (
        <div className="settings-card agent-model-onboarding">
          <strong>先选择并配置一个模型 Provider</strong>
          <p>FoodLab 不会默认绑定任何 Provider。配置完成前，Agent 不会发送任务。</p>
        </div>
      ) : null}

      {directory ? (
        <DefaultModelPicker
          api={api}
          directory={directory}
          disabled={!directory.hasUsableProvider}
          onChanged={(next) => {
            setDirectory((current) => current ? {
              ...current,
              current: next,
              currentUsable: true,
            } : current);
            setMessage(`默认模型已设为 ${next.provider} / ${next.model}`);
          }}
        />
      ) : null}

      <div className="agent-model-list">
        {rows.map((row) => (
          <ProviderEditor
            api={api}
            key={`${row.entry.settingsNs}:${row.entry.provider}:${row.namespace?.revision ?? "none"}`}
            onChanged={async (nextMessage) => {
              setMessage(nextMessage);
              await load();
            }}
            row={row}
            writable={settings?.writable ?? false}
          />
        ))}
      </div>

      {settings ? (
        <CustomProviderEditor
          api={api}
          namespace={settings.namespaces.find((item) => item.ns === "llm-pi-ai")}
          onChanged={async (nextMessage) => {
            setMessage(nextMessage);
            await load();
          }}
          taken={new Set(providers.map((provider) => provider.provider))}
          writable={settings.writable}
        />
      ) : null}

      <div className="settings-row harness-settings-actions">
        <button className="button button--secondary" disabled={loading} onClick={() => void load()} type="button">
          {loading ? "正在刷新…" : "刷新模型设置"}
        </button>
      </div>
      <p className="settings-safety-note">
        API Key 只写入 Ninka Agent 的本地凭据文件；页面只显示“已配置/未配置”，不会读取或回显明文。保存设置不会自动请求模型，只有点击“测试连接”才会访问对应 Provider。
      </p>
      {message ? <p className="settings-message" role="status">{message}</p> : null}
      {error ? <p className="settings-message is-error" role="alert">{error}</p> : null}
    </div>
  );
}

function DefaultModelPicker({
  api,
  directory,
  disabled,
  onChanged,
}: {
  api: DesktopApi;
  directory: AgentModelDirectory;
  disabled: boolean;
  onChanged(selection: AgentModelDirectory["current"]): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = directory.current.provider && directory.current.model
    ? `${directory.current.engine ?? "foodlab_runtime"}\u0000${directory.current.provider}\u0000${directory.current.model}`
    : "";

  async function choose(value: string) {
    const [engine, provider, model] = value.split("\u0000");
    if (!engine || !provider || !model) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.selectAgentDefaultModel({ engine: engine as "foodlab_runtime" | "codex_app_server", provider, model });
      onChanged(result.selected);
    } catch (cause) {
      setError(errorMessage(cause, "默认模型保存失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card agent-default-model-card">
      <label htmlFor="agent-default-model"><strong>默认模型</strong></label>
      <select
        disabled={disabled || busy}
        id="agent-default-model"
        onChange={(event) => void choose(event.target.value)}
        value={selected}
      >
        {!selected ? <option disabled value="">请选择可用模型</option> : null}
        {selected && !directory.groups.some((group) =>
          (group.engine ?? "foodlab_runtime") === (directory.current.engine ?? "foodlab_runtime")
          && group.provider === directory.current.provider
          && group.models.some((model) => model.id === directory.current.model)
        ) ? <option value={selected}>{directory.current.provider} / {directory.current.model}</option> : null}
        {directory.groups.map((group) => (
          <optgroup key={`${group.engine ?? "foodlab_runtime"}-${group.provider}`} label={group.displayName || group.provider}>
            {group.models.map((model) => (
              <option key={model.id} value={`${group.engine ?? "foodlab_runtime"}\u0000${group.provider}\u0000${model.id}`}>
                {model.name || model.id} · {modelCapabilityLabel(model)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <small>选择后用于后续新任务；现有任务保留已经写入会话的模型选择。</small>
      {error ? <p className="settings-message is-error" role="alert">{error}</p> : null}
    </div>
  );
}

function modelCapabilityLabel(model: AgentModelCatalogItem) {
  if (model.inputModalities?.includes("image")) return "支持图片";
  if (model.capabilityStatus === "known" || model.capabilityStatus === "probed") return "仅文本";
  return "首次使用时确认";
}

function ProviderEditor({
  api,
  row,
  writable,
  onChanged,
}: {
  api: DesktopApi;
  row: ProviderRow;
  writable: boolean;
  onChanged(message: string): void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(textField(row.profile, "baseURL"));
  const [displayName, setDisplayName] = useState(textField(row.profile, "displayName"));
  const [protocol, setProtocol] = useState(textField(row.profile, "api"));
  const [models, setModels] = useState<ModelDraft[]>(modelDrafts(row.profile));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    const failure = validateProviderDraft(apiKey, models, false);
    if (failure) {
      setMessage(failure);
      return;
    }
    if (!row.credential?.configured && !apiKey) {
      setMessage("请输入 API Key 后再保存");
      return;
    }
    const namespace = row.namespace;
    if (!namespace) {
      setMessage("该 Provider 的设置区域不可用");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const keyRef = row.keyRef || deriveKeyRef(row.entry.provider);
      const nextKeyRef = apiKey ? keyRef : row.keyRef;
      const nextProfile = mergeVisibleProfile(row.profile, visibleProfile({
        ...(nextKeyRef ? { apiKeyEnv: nextKeyRef } : {}),
        baseURL,
        displayName,
        models,
        protocol,
      }));
      await api.saveAgentProviderProfile({
        settingsNs: row.entry.settingsNs,
        settingsPath: row.entry.settingsPath,
        profile: nextProfile,
        expectedRevision: namespace.revision,
        ...(apiKey ? { credentialRef: keyRef, credentialValue: apiKey } : {}),
      });
      setApiKey("");
      await onChanged(`${row.entry.displayName || row.entry.provider} 设置已保存`);
    } catch (cause) {
      setMessage(errorMessage(cause, "模型设置保存失败"));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    const failure = validateProviderDraft(apiKey, models, false);
    if (failure) {
      setMessage(failure);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (row.entry.provider === "deepseek-official") {
        if (apiKey || !row.credential?.configured) {
          setMessage("请先保存 API Key，再用已保存的密钥测试连接");
          return;
        }
        const model = models.find((entry) => entry.id.trim())?.id.trim() || "deepseek-v4-flash";
        await api.testAgentProviderConnection({ provider: row.entry.provider, model });
        setMessage("连接测试成功；已使用保存的 API Key 完成最小模型请求");
        return;
      }
      const result = await api.agentRuntimeSettingsCall<DiscoveredModelsResponse>(
        "llm.discoverModels",
        {
          settingsNs: row.entry.settingsNs,
          provider: row.entry.provider,
          ...(baseURL ? { baseURL } : {}),
          ...(protocol ? { api: protocol } : {}),
          ...(apiKey ? { apiKey } : {}),
        },
      );
      setMessage(`连接测试成功，发现 ${result.models.length} 个模型；尚未保存`);
      if (!models.length && result.models.length) setModels(result.models.map(toModelDraft));
    } catch (cause) {
      setMessage(errorMessage(cause, "连接测试失败"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!row.removable || !window.confirm(`确认删除 ${row.entry.displayName || row.entry.provider} 的模型设置？`)) return;
    const namespace = row.namespace;
    if (!namespace) return;
    setBusy(true);
    setMessage("");
    try {
      const derived = deriveKeyRef(row.entry.provider);
      if (row.keyRef === derived && row.credential?.configured && row.credential.writable) {
        await api.agentRuntimeSettingsCall("credentials.unset", { ref: derived });
      }
      await api.agentRuntimeSettingsCall("settings.mutate", {
        ns: row.entry.settingsNs,
        ops: [{ op: "unset", path: row.entry.settingsPath }],
        expectedRevision: namespace.revision,
      });
      await onChanged(`${row.entry.displayName || row.entry.provider} 设置已删除`);
    } catch (cause) {
      setMessage(errorMessage(cause, "模型设置删除失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="settings-card agent-provider-card">
      <header className="settings-row">
        <div>
          <strong>{row.entry.displayName || row.entry.provider}</strong>
          <p>{row.entry.provider}{row.entry.custom ? " · 自定义" : ""}</p>
        </div>
        <div className="agent-provider-status">
          <span className={row.credential?.configured ? "is-configured" : "is-missing"}>
            {!row.configured || !row.entry.active
              ? "尚未配置"
              : row.keyRef
                ? (row.credential?.configured ? "API Key 已配置" : "API Key 未配置")
                : "使用 Provider 原生认证"}
          </span>
          <button className="button button--secondary" onClick={() => setExpanded((value) => !value)} type="button">
            {expanded ? "收起" : "配置"}
          </button>
        </div>
      </header>
      {expanded ? (
        <div className="agent-provider-editor">
          <label>
            <span>API Key</span>
            <input
              autoComplete="new-password"
              disabled={!writable || row.credential?.writable === false}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={row.credential?.configured ? "留空表示不修改" : "输入后只写保存"}
              type="password"
              value={apiKey}
            />
          </label>
          <details>
            <summary>自定义设置</summary>
            <div className="agent-provider-fields">
              <label>
                <span>Base URL</span>
                <input onChange={(event) => setBaseURL(event.target.value)} placeholder="https://api.example.com/v1" value={baseURL} />
              </label>
              {row.entry.settingsNs === "llm-pi-ai" ? (
                <>
                  <label>
                    <span>显示名称</span>
                    <input onChange={(event) => setDisplayName(event.target.value)} placeholder={row.entry.provider} value={displayName} />
                  </label>
                  <label>
                    <span>API 协议</span>
                    <input onChange={(event) => setProtocol(event.target.value)} placeholder="openai-completions" value={protocol} />
                  </label>
                </>
              ) : null}
              <ModelRows models={models} onChange={setModels} />
            </div>
          </details>
          <div className="settings-row harness-settings-actions">
            <button className="button button--primary" disabled={busy || !writable} onClick={() => void save()} type="button">
              {busy ? "正在处理…" : "保存"}
            </button>
            <button className="button button--secondary" disabled={busy} onClick={() => void testConnection()} type="button">测试连接</button>
            {row.removable ? (
              <button className="button button--danger" disabled={busy || !writable} onClick={() => void remove()} type="button">删除 Provider</button>
            ) : null}
          </div>
          {message ? <p className="settings-message" role="status">{message}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function CustomProviderEditor({
  api,
  namespace,
  onChanged,
  taken,
  writable,
}: {
  api: DesktopApi;
  namespace: AgentSettingsNamespace | undefined;
  onChanged(message: string): void | Promise<void>;
  taken: Set<string>;
  writable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [protocol, setProtocol] = useState("openai-completions");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<ModelDraft[]>([emptyModel()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create() {
    const normalizedRoute = route.trim();
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalizedRoute)) {
      setMessage("Provider ID 必须以小写字母开头，只能用小写字母、数字和单个连字符分段");
      return;
    }
    if (taken.has(normalizedRoute)) {
      setMessage("这个 Provider ID 已存在");
      return;
    }
    if (!baseURL.trim() || !protocol.trim()) {
      setMessage("请填写 Base URL 和 API 协议");
      return;
    }
    const failure = validateProviderDraft(apiKey, models);
    if (failure) {
      setMessage(failure);
      return;
    }
    if (!apiKey) {
      setMessage("请输入 API Key 后再添加 Provider");
      return;
    }
    if (!namespace) {
      setMessage("自定义 Provider 设置区域不可用");
      return;
    }
    setBusy(true);
    setMessage("");
    const keyRef = deriveKeyRef(normalizedRoute);
    try {
      await api.saveAgentProviderProfile({
        settingsNs: "llm-pi-ai",
        settingsPath: ["providers", normalizedRoute],
        profile: visibleProfile({
          apiKeyEnv: keyRef,
          baseURL,
          displayName,
          models,
          protocol,
        }),
        expectedRevision: namespace.revision,
        credentialRef: keyRef,
        credentialValue: apiKey,
      });
      setOpen(false);
      setRoute("");
      setDisplayName("");
      setBaseURL("");
      setProtocol("openai-completions");
      setApiKey("");
      setModels([emptyModel()]);
      await onChanged(`${displayName.trim() || normalizedRoute} 已添加`);
    } catch (cause) {
      setMessage(errorMessage(cause, "自定义 Provider 创建失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card agent-custom-provider">
      <div className="settings-row">
        <div>
          <strong>自定义 OpenAI 兼容 Provider</strong>
          <p>用于企业网关、自托管服务或尚未列入目录的 Provider。</p>
        </div>
        <button className="button button--secondary" disabled={!writable} onClick={() => setOpen((value) => !value)} type="button">
          {open ? "取消" : "添加"}
        </button>
      </div>
      {open ? (
        <div className="agent-provider-editor agent-provider-fields">
          <label><span>Provider ID</span><input onChange={(event) => setRoute(event.target.value)} placeholder="company-gateway" value={route} /></label>
          <label><span>显示名称</span><input onChange={(event) => setDisplayName(event.target.value)} placeholder="公司模型网关" value={displayName} /></label>
          <label><span>Base URL</span><input onChange={(event) => setBaseURL(event.target.value)} placeholder="https://gateway.example.com/v1" value={baseURL} /></label>
          <label><span>API 协议</span><input onChange={(event) => setProtocol(event.target.value)} value={protocol} /></label>
          <label><span>API Key</span><input autoComplete="new-password" onChange={(event) => setApiKey(event.target.value)} placeholder="输入后只写保存" type="password" value={apiKey} /></label>
          <ModelRows models={models} onChange={setModels} />
          <button className="button button--primary" disabled={busy} onClick={() => void create()} type="button">{busy ? "正在添加…" : "添加 Provider"}</button>
          {message ? <p className="settings-message" role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

interface ModelDraft {
  id: string;
  name: string;
  contextWindow: string;
  maxTokens: string;
  original?: Record<string, unknown>;
}

function ModelRows({ models, onChange }: { models: ModelDraft[]; onChange(models: ModelDraft[]): void }) {
  function patch(index: number, field: keyof Omit<ModelDraft, "original">, value: string) {
    onChange(models.map((model, at) => at === index ? { ...model, [field]: value } : model));
  }
  return (
    <fieldset className="agent-model-rows">
      <legend>模型列表</legend>
      {models.map((model, index) => (
        <div className="agent-model-row" key={`${index}-${model.id}`}>
          <label><span>模型 ID</span><input aria-label={`模型 ${index + 1} ID`} onChange={(event) => patch(index, "id", event.target.value)} value={model.id} /></label>
          <label><span>显示名称</span><input aria-label={`模型 ${index + 1} 显示名称`} onChange={(event) => patch(index, "name", event.target.value)} value={model.name} /></label>
          <label><span>上下文窗口</span><input aria-label={`模型 ${index + 1} 上下文窗口`} inputMode="numeric" onChange={(event) => patch(index, "contextWindow", event.target.value)} placeholder="例如 128000" value={model.contextWindow} /></label>
          <label><span>最大输出</span><input aria-label={`模型 ${index + 1} 最大输出`} inputMode="numeric" onChange={(event) => patch(index, "maxTokens", event.target.value)} placeholder="例如 8192" value={model.maxTokens} /></label>
          <button aria-label={`删除模型 ${index + 1}`} className="button button--secondary" onClick={() => onChange(models.filter((_, at) => at !== index))} type="button">删除</button>
        </div>
      ))}
      <button className="button button--secondary" onClick={() => onChange([...models, emptyModel()])} type="button">添加模型</button>
    </fieldset>
  );
}

function providerRows(
  providers: AgentConfigurableProvider[],
  settings: AgentSettingsDescription,
  credentials: Record<string, AgentCredentialState>,
): ProviderRow[] {
  return providers.map((entry) => {
    const namespace = settings.namespaces.find((item) => item.ns === entry.settingsNs);
    const profile = asRecord(getAtPath(namespace?.value, entry.settingsPath));
    const userProfile = getAtPath(namespace?.user, entry.settingsPath);
    const baseProfile = getAtPath(namespace?.base, entry.settingsPath);
    const keyRef = textField(profile, "apiKeyEnv") || undefined;
    return {
      entry,
      namespace,
      profile,
      configured: profile !== undefined,
      removable: entry.settingsPath.length > 0 && userProfile !== undefined && baseProfile === undefined,
      keyRef,
      credential: keyRef ? credentials[keyRef] : undefined,
    };
  });
}

function credentialRefs(
  providers: AgentConfigurableProvider[],
  settings: AgentSettingsDescription,
) {
  return [...new Set(providers.flatMap((entry) => {
    const namespace = settings.namespaces.find((item) => item.ns === entry.settingsNs);
    const profile = asRecord(getAtPath(namespace?.value, entry.settingsPath));
    const reference = textField(profile, "apiKeyEnv");
    return reference ? [reference] : [];
  }))];
}

function getAtPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textField(value: Record<string, unknown> | undefined, key: string) {
  return typeof value?.[key] === "string" ? value[key] as string : "";
}

function deriveKeyRef(provider: string) {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function modelDrafts(profile: Record<string, unknown> | undefined): ModelDraft[] {
  return Array.isArray(profile?.models)
    ? profile.models.map((model) => toModelDraft(asRecord(model) ?? {}))
    : [];
}

function toModelDraft(model: Record<string, unknown> | AgentModelCatalogItem): ModelDraft {
  return {
    id: typeof model.id === "string" ? model.id : "",
    name: typeof model.name === "string" ? model.name : "",
    contextWindow: typeof model.contextWindow === "number" ? formatCapacity(model.contextWindow) : "",
    maxTokens: typeof model.maxTokens === "number" ? formatCapacity(model.maxTokens) : "",
    original: { ...model },
  };
}

function emptyModel(): ModelDraft {
  return { id: "", name: "", contextWindow: "", maxTokens: "" };
}

function visibleProfile(input: {
  apiKeyEnv?: string;
  baseURL: string;
  displayName: string;
  models: ModelDraft[];
  protocol: string;
}) {
  return {
    ...(input.apiKeyEnv ? { apiKeyEnv: input.apiKeyEnv } : {}),
    ...(input.displayName.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(input.protocol.trim() ? { api: input.protocol.trim() } : {}),
    ...(input.baseURL.trim() ? { baseURL: input.baseURL.trim() } : {}),
    ...(input.models.length ? { models: input.models.map(serializeModel) } : {}),
  };
}

function serializeModel(model: ModelDraft) {
  const next: Record<string, unknown> = { ...(model.original ?? {}), id: model.id.trim() };
  if (model.name.trim()) next.name = model.name.trim();
  else delete next.name;
  if (model.contextWindow.trim()) next.contextWindow = parseCapacity(model.contextWindow);
  else delete next.contextWindow;
  if (model.maxTokens.trim()) next.maxTokens = parseCapacity(model.maxTokens);
  else delete next.maxTokens;
  return next;
}

function mergeVisibleProfile(
  current: Record<string, unknown> | undefined,
  visible: Record<string, unknown>,
) {
  const next = { ...(current ?? {}) };
  for (const key of ["apiKeyEnv", "baseURL", "displayName", "api", "models"]) {
    delete next[key];
  }
  return Object.assign(next, visible);
}

function validateProviderDraft(apiKey: string, models: ModelDraft[], requireModels = true) {
  if (apiKey && (!/^[\x21-\x7E]+$/.test(apiKey) || /^[A-Z_][A-Z0-9_]*=/.test(apiKey))) {
    return "API Key 格式无效，请只粘贴密钥值";
  }
  if (requireModels && models.length === 0) return "请至少保留一个模型";
  const ids = new Set<string>();
  for (const [index, model] of models.entries()) {
    const id = model.id.trim();
    if (!id) return `模型 ${index + 1} 缺少 ID`;
    if (ids.has(id)) return `模型 ID 重复：${id}`;
    ids.add(id);
    for (const [label, value] of [["上下文窗口", model.contextWindow], ["最大输出", model.maxTokens]] as const) {
      if (value && parseCapacity(value) === null) {
        return `模型 ${index + 1} 的${label}必须是正整数`;
      }
    }
  }
  return "";
}

function parseCapacity(value: string) {
  const match = value.trim().toUpperCase().match(/^(\d+(?:\.\d+)?)([KM])?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  const result = amount * multiplier;
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function formatCapacity(value: number) {
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value % 1_000 === 0) return `${value / 1_000}K`;
  return String(value);
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
