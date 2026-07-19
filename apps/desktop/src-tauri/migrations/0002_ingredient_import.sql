CREATE TABLE source_attachments (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE attachment_extractions (
  attachment_id TEXT PRIMARY KEY REFERENCES source_attachments(id) ON DELETE CASCADE,
  extractor_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ingredient_import_jobs (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('spreadsheet', 'documents', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'extracting', 'recognizing', 'grouping', 'drafts_ready', 'partially_completed', 'failed', 'cancelled')),
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ingredient_import_drafts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ingredient_import_jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('needs_review', 'ready', 'imported', 'discarded', 'failed')),
  review_json TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  imported_variant_id TEXT REFERENCES ingredient_variants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, position)
);

CREATE TABLE import_draft_attachments (
  draft_id TEXT NOT NULL REFERENCES ingredient_import_drafts(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (draft_id, attachment_id)
);

CREATE TABLE import_draft_source_links (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES ingredient_import_drafts(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  source_locator TEXT,
  UNIQUE(draft_id, field_path, attachment_id, source_locator)
);

CREATE TABLE ingredient_variant_attachments (
  ingredient_variant_id TEXT NOT NULL REFERENCES ingredient_variants(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (ingredient_variant_id, attachment_id)
);

CREATE TABLE ingredient_variant_allergens (
  ingredient_variant_id TEXT NOT NULL REFERENCES ingredient_variants(id) ON DELETE CASCADE,
  allergen_name TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('contains', 'may_contain')),
  PRIMARY KEY (ingredient_variant_id, allergen_name, relation)
);

CREATE INDEX ingredient_import_jobs_status_idx
ON ingredient_import_jobs(status, updated_at);

CREATE INDEX ingredient_import_drafts_job_idx
ON ingredient_import_drafts(job_id, position);

CREATE INDEX import_draft_source_links_attachment_idx
ON import_draft_source_links(attachment_id);
