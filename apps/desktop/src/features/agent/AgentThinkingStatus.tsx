import { ThinkingOrb } from "thinking-orbs";

interface AgentThinkingStatusProps {
  status: string;
}

export function AgentThinkingStatus({ status }: AgentThinkingStatusProps) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="agent-thinking-status"
      role="status"
    >
      <ThinkingOrb
        aria-hidden="true"
        className="agent-thinking-status__orb"
        size={20}
        state="working"
        theme="light"
      />
      <strong>{status}</strong>
    </div>
  );
}
