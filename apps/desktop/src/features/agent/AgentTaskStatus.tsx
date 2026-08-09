import type { AgentRun } from "../../api/agent-types";

interface AgentTaskStatusProps {
  lastRun: AgentRun | null;
  status: string;
  error: string;
  onRetry(): void;
}

export function AgentTaskStatus({
  lastRun,
  status,
  error,
  onRetry,
}: AgentTaskStatusProps) {
  if (!status && !error) return null;
  const canRetry =
    lastRun?.status === "failed" || lastRun?.status === "cancelled";

  return (
    <div
      className={error ? "agent-task-status is-error" : "agent-task-status"}
      role={error ? "alert" : "status"}
    >
      <span className="agent-status-dot" />
      <div>
        {status ? <strong>{status}</strong> : null}
        {error ? <p>{error}</p> : null}
      </div>
      {canRetry ? (
        <button onClick={onRetry} type="button">
          重试
        </button>
      ) : null}
    </div>
  );
}
