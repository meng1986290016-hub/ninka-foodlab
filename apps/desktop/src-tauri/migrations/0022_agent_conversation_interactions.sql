ALTER TABLE agent_v2_tasks ADD COLUMN active_recipe_name TEXT;
ALTER TABLE agent_v2_tasks ADD COLUMN active_leaf_turn_id TEXT;
ALTER TABLE agent_v2_tasks ADD COLUMN queue_paused INTEGER NOT NULL DEFAULT 0
  CHECK (queue_paused IN (0, 1));

ALTER TABLE agent_v2_turns ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'root';
ALTER TABLE agent_v2_turns ADD COLUMN recipe_id TEXT;
ALTER TABLE agent_v2_turns ADD COLUMN recipe_name TEXT;
ALTER TABLE agent_v2_turns ADD COLUMN draft_fingerprint TEXT;

UPDATE agent_v2_tasks
SET active_leaf_turn_id = (
  SELECT turn.id
  FROM agent_v2_turns AS turn
  WHERE turn.task_id = agent_v2_tasks.id
  ORDER BY turn.created_at DESC, turn.rowid DESC
  LIMIT 1
);

CREATE TABLE agent_v2_queued_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  parent_turn_id TEXT REFERENCES agent_v2_turns(id) ON DELETE SET NULL,
  branch_id TEXT NOT NULL,
  content TEXT NOT NULL,
  references_json TEXT NOT NULL DEFAULT '[]',
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('queue', 'steer')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'steering')),
  engine TEXT NOT NULL CHECK (engine IN ('foodlab_runtime', 'codex_app_server')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT,
  recipe_id TEXT,
  recipe_name TEXT,
  draft_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX agent_v2_queued_messages_conversation_idx
ON agent_v2_queued_messages(conversation_id, created_at);

CREATE TABLE agent_runtime_branch_sessions (
  conversation_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('foodlab_runtime', 'codex_app_server')),
  external_session_id TEXT NOT NULL,
  last_synced_turn_id TEXT REFERENCES agent_v2_turns(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, branch_id, engine),
  UNIQUE(engine, external_session_id)
);

INSERT INTO agent_runtime_branch_sessions (
  conversation_id, branch_id, engine, external_session_id,
  last_synced_turn_id, created_at, updated_at
)
SELECT conversation_id, 'root', engine, external_session_id,
       last_synced_turn_id, created_at, updated_at
FROM agent_runtime_sessions;

CREATE INDEX agent_runtime_branch_sessions_conversation_idx
ON agent_runtime_branch_sessions(conversation_id, branch_id, updated_at DESC);
