ALTER TABLE agent_v2_tasks
ADD COLUMN legacy_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL;

ALTER TABLE agent_v2_tasks
ADD COLUMN legacy_import_job_id TEXT REFERENCES ingredient_import_jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX agent_v2_tasks_legacy_run_idx
ON agent_v2_tasks(legacy_run_id)
WHERE legacy_run_id IS NOT NULL;

CREATE UNIQUE INDEX agent_v2_tasks_legacy_job_idx
ON agent_v2_tasks(legacy_import_job_id)
WHERE legacy_import_job_id IS NOT NULL;
