CREATE TABLE agent_recipe_proposals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'accepted', 'discarded')),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  source_attachment_ids_json TEXT NOT NULL DEFAULT '[]',
  accepted_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX agent_recipe_proposals_conversation_idx
ON agent_recipe_proposals(conversation_id, created_at);

CREATE INDEX agent_recipe_proposals_run_idx
ON agent_recipe_proposals(run_id, created_at);

CREATE TABLE material_needs (
  id TEXT PRIMARY KEY,
  proposal_id TEXT REFERENCES agent_recipe_proposals(id) ON DELETE SET NULL,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  desired_specification TEXT NOT NULL,
  missing_reason TEXT NOT NULL,
  suggested_amount TEXT NOT NULL,
  suggested_unit TEXT NOT NULL CHECK (suggested_unit IN ('g', 'kg')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_ingredient_variant_id TEXT
    REFERENCES ingredient_variants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX material_needs_status_idx
ON material_needs(status, updated_at DESC);

CREATE INDEX material_needs_recipe_idx
ON material_needs(recipe_id, updated_at DESC);
