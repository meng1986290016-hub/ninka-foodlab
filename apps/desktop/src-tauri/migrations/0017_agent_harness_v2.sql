CREATE TABLE agent_v2_tasks (
  id TEXT PRIMARY KEY,
  harness_session_id TEXT UNIQUE,
  title TEXT NOT NULL,
  workflow TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'running', 'needs_input', 'needs_review', 'completed',
      'failed', 'cancelled', 'interrupted'
    )
  ),
  task_contract_json TEXT NOT NULL,
  active_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  last_event_seq INTEGER NOT NULL DEFAULT -1,
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_v2_turns (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  harness_turn_id TEXT,
  parent_turn_id TEXT REFERENCES agent_v2_turns(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'running', 'needs_input', 'needs_review', 'completed',
      'failed', 'cancelled', 'interrupted'
    )
  ),
  user_content TEXT NOT NULL,
  content_blocks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(task_id, harness_turn_id)
);

CREATE TABLE agent_v2_events (
  task_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  event_type TEXT NOT NULL,
  turn_id TEXT REFERENCES agent_v2_turns(id) ON DELETE SET NULL,
  step_id TEXT,
  call_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, seq)
);

CREATE TABLE agent_artifact_manifests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_v2_tasks(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES agent_v2_turns(id) ON DELETE CASCADE,
  tool_call_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  domain_ref TEXT,
  logical_path TEXT,
  mime_type TEXT,
  sha256 TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  status TEXT NOT NULL CHECK (
    status IN ('needs_input', 'needs_review', 'accepted', 'rejected', 'stale')
  ),
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_legacy_reset_audits (
  id TEXT PRIMARY KEY,
  preview_json TEXT NOT NULL,
  confirmation_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'completed', 'failed')),
  error_summary TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX agent_v2_tasks_updated_idx
ON agent_v2_tasks(updated_at DESC);

CREATE INDEX agent_v2_turns_task_idx
ON agent_v2_turns(task_id, created_at);

CREATE INDEX agent_v2_events_turn_idx
ON agent_v2_events(task_id, turn_id, seq);

CREATE INDEX agent_artifacts_task_idx
ON agent_artifact_manifests(task_id, turn_id, created_at);

CREATE UNIQUE INDEX agent_artifacts_domain_ref_idx
ON agent_artifact_manifests(domain_ref)
WHERE domain_ref IS NOT NULL;
