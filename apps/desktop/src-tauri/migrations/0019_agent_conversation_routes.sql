ALTER TABLE agent_v2_tasks ADD COLUMN archived_at TEXT;
ALTER TABLE agent_v2_tasks ADD COLUMN active_engine TEXT NOT NULL DEFAULT 'foodlab_runtime'
  CHECK (active_engine IN ('foodlab_runtime', 'codex_app_server'));
ALTER TABLE agent_v2_tasks ADD COLUMN active_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_v2_tasks ADD COLUMN active_model TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_v2_tasks ADD COLUMN active_reasoning_effort TEXT;

ALTER TABLE agent_v2_turns ADD COLUMN engine TEXT NOT NULL DEFAULT 'foodlab_runtime'
  CHECK (engine IN ('foodlab_runtime', 'codex_app_server'));
ALTER TABLE agent_v2_turns ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_v2_turns ADD COLUMN model TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_v2_turns ADD COLUMN reasoning_effort TEXT;

CREATE TABLE agent_runtime_sessions (
  conversation_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('foodlab_runtime', 'codex_app_server')),
  route_key TEXT NOT NULL,
  external_session_id TEXT NOT NULL,
  last_synced_turn_id TEXT REFERENCES agent_v2_turns(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, engine, route_key),
  UNIQUE(engine, external_session_id)
);

INSERT INTO agent_runtime_sessions (
  conversation_id, engine, route_key, external_session_id,
  last_synced_turn_id, created_at, updated_at
)
SELECT id, 'foodlab_runtime', 'legacy', harness_session_id, NULL, created_at, updated_at
FROM agent_v2_tasks
WHERE harness_session_id IS NOT NULL;

CREATE INDEX agent_v2_tasks_archive_updated_idx
ON agent_v2_tasks(archived_at, updated_at DESC);

CREATE INDEX agent_runtime_sessions_conversation_idx
ON agent_runtime_sessions(conversation_id, updated_at DESC);
