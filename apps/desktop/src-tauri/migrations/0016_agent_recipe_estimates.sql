CREATE TABLE personal_rnd_reference_cards (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('approved', 'archived')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_personal_rnd_reference_cards_status
ON personal_rnd_reference_cards(status, updated_at);

CREATE TABLE agent_recipe_estimate_cards (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  source_draft_updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'needs_input', 'stale')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_recipe_estimate_cards_conversation
ON agent_recipe_estimate_cards(conversation_id, created_at);

CREATE INDEX idx_agent_recipe_estimate_cards_recipe
ON agent_recipe_estimate_cards(recipe_id, created_at);
