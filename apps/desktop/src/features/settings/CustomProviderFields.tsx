import { useEffect, useState } from "react";

import type {
  AgentCustomProviderSubconfig,
  AgentProviderProtocol,
} from "../../api/agent-types";
import type { DesktopApi } from "../../api/desktop-api";

type CustomProtocol = Extract<
  AgentProviderProtocol,
  "openai_compatible" | "anthropic_messages"
>;

interface CustomProviderFieldsProps {
  api: DesktopApi;
  protocol: CustomProtocol;
  onChange(
    protocol: CustomProtocol,
    values: AgentCustomProviderSubconfig,
  ): void;
}

const emptySubconfig: AgentCustomProviderSubconfig = {
  endpoint: "",
  model: "",
};

export function CustomProviderFields({
  api,
  protocol,
  onChange,
}: CustomProviderFieldsProps) {
  const [selected, setSelected] = useState<CustomProtocol>(protocol);
  const [configs, setConfigs] = useState<
    Record<CustomProtocol, AgentCustomProviderSubconfig>
  >({
    openai_compatible: emptySubconfig,
    anthropic_messages: emptySubconfig,
  });

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.getAgentCustomProviderSubconfig("openai_compatible"),
      api.getAgentCustomProviderSubconfig("anthropic_messages"),
    ]).then(([openai, anthropic]) => {
      if (!active) return;
      const next = {
        openai_compatible: openai,
        anthropic_messages: anthropic,
      };
      setConfigs(next);
      onChange(selected, next[selected]);
    });
    return () => {
      active = false;
    };
  }, [api]);

  function select(next: CustomProtocol) {
    setSelected(next);
    onChange(next, configs[next]);
  }

  function update(field: keyof AgentCustomProviderSubconfig, value: string) {
    const next = { ...configs[selected], [field]: value };
    setConfigs((current) => ({ ...current, [selected]: next }));
    onChange(selected, next);
  }

  return (
    <div className="custom-provider-fields">
      <div className="protocol-tabs" aria-label="自定义接口协议">
        <button
          className={selected === "openai_compatible" ? "is-active" : ""}
          onClick={() => select("openai_compatible")}
          type="button"
        >
          OpenAI 兼容
        </button>
        <button
          className={selected === "anthropic_messages" ? "is-active" : ""}
          onClick={() => select("anthropic_messages")}
          type="button"
        >
          Anthropic 兼容
        </button>
      </div>
      <label className="settings-field settings-field--wide">
        <span>Endpoint</span>
        <input
          onChange={(event) => update("endpoint", event.target.value)}
          placeholder={
            selected === "openai_compatible"
              ? "https://example.com/v1"
              : "https://example.com"
          }
          value={configs[selected].endpoint}
        />
      </label>
      <label className="settings-field settings-field--wide">
        <span>模型</span>
        <input
          onChange={(event) => update("model", event.target.value)}
          placeholder="输入服务商提供的模型名称"
          value={configs[selected].model}
        />
      </label>
    </div>
  );
}
