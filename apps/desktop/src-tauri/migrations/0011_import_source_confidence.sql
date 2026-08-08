ALTER TABLE import_draft_source_links
ADD COLUMN confidence TEXT
CHECK (confidence IN ('high', 'medium', 'low') OR confidence IS NULL);
