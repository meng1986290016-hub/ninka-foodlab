import type { ReactNode } from "react";

import type { AgentProviderConfig } from "../../api/agent-types";
import { Icon } from "../../components/Icon";

interface ProviderCardProps {
  provider: AgentProviderConfig;
  expanded: boolean;
  activationDisabled?: boolean;
  activationHint?: string | undefined;
  children: ReactNode;
  onToggle(): void;
  onActivation(): void;
}

export function ProviderCard({
  provider,
  expanded,
  activationDisabled = false,
  activationHint,
  children,
  onToggle,
  onActivation,
}: ProviderCardProps) {
  const providerLocation =
    provider.kind === "codex_cli" || provider.kind === "claude_code_cli"
      ? "本机 CLI"
      : provider.endpoint || "尚未配置 Endpoint";

  return (
    <article
      className={provider.enabled ? "provider-card is-active" : "provider-card"}
    >
      <div className="provider-card__summary">
        <button
          aria-expanded={expanded}
          className="provider-card__disclosure"
          onClick={onToggle}
          type="button"
        >
          <span
            className={
              expanded
                ? "provider-card__chevron is-expanded"
                : "provider-card__chevron"
            }
          >
            <Icon name="chevron-down" size={16} />
          </span>
          <span>
            <strong>{provider.displayName}</strong>
            <small>
              {provider.enabled ? "当前聊天模型" : providerLocation}
            </small>
          </span>
        </button>
        {provider.enabled ? (
          <span className="provider-active-label">已启用</span>
        ) : (
          <button
            aria-label={`启用 ${provider.displayName}`}
            className="provider-enable-button"
            disabled={activationDisabled}
            onClick={onActivation}
            title={activationHint}
            type="button"
          >
            启用
          </button>
        )}
      </div>
      {expanded ? <div className="provider-card__body">{children}</div> : null}
    </article>
  );
}
