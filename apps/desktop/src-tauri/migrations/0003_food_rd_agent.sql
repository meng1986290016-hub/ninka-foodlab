CREATE TABLE agent_provider_configs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  context_window INTEGER NOT NULL,
  reasoning_effort TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL,
  executable_path TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  secret_ref TEXT,
  capabilities_json TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX agent_provider_one_enabled_idx
ON agent_provider_configs(enabled) WHERE enabled = 1;

CREATE TABLE agent_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  provider_config_id TEXT NOT NULL REFERENCES agent_provider_configs(id) ON DELETE RESTRICT,
  import_job_id TEXT REFERENCES ingredient_import_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE agent_message_attachments (
  message_id TEXT NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE TABLE agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  provider_kind TEXT NOT NULL,
  model TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'denied')),
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX agent_conversations_updated_idx
ON agent_conversations(updated_at DESC);

CREATE INDEX agent_messages_conversation_idx
ON agent_messages(conversation_id, created_at);

CREATE INDEX agent_runs_conversation_idx
ON agent_runs(conversation_id, created_at);

CREATE INDEX agent_tool_calls_run_idx
ON agent_tool_calls(run_id, started_at);

INSERT INTO agent_provider_configs (
  id, kind, display_name, protocol, endpoint, model,
  context_window, reasoning_effort, timeout_seconds, executable_path,
  enabled, secret_ref, capabilities_json, config_json, created_at, updated_at
) VALUES
  (
    'openai', 'openai', 'OpenAI', 'openai_responses',
    'https://api.openai.com/v1', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'anthropic', 'anthropic', 'Anthropic (Claude)', 'anthropic_messages',
    'https://api.anthropic.com', '', 200000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'gemini', 'gemini', 'Google (Gemini)', 'gemini_generate_content',
    'https://generativelanguage.googleapis.com/v1beta', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'azure_openai', 'azure_openai', 'Azure OpenAI', 'openai_compatible',
    '', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'deepseek', 'deepseek', 'DeepSeek', 'openai_compatible',
    'https://api.deepseek.com', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'kimi_cn', 'kimi_cn', 'Kimi (Moonshot 中国)', 'openai_compatible',
    'https://api.moonshot.cn/v1', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'zhipu_glm', 'zhipu_glm', '智谱 GLM', 'openai_compatible',
    'https://open.bigmodel.cn/api/paas/v4', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'minimax_cn', 'minimax_cn', 'MiniMax (中国)', 'openai_compatible',
    'https://api.minimaxi.com/v1', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'bailian', 'bailian', '阿里百炼', 'openai_compatible',
    'https://dashscope.aliyuncs.com/compatible-mode/v1', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'volcengine_ark', 'volcengine_ark', '火山引擎 Ark', 'openai_compatible',
    'https://ark.cn-beijing.volces.com/api/v3', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ollama', 'ollama', 'Ollama (本地)', 'openai_compatible',
    'http://127.0.0.1:11434/v1', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'custom', 'custom', '自定义模型服务', 'openai_compatible',
    '', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}',
    '{"openaiCompatible":{"endpoint":"","model":""},"anthropicCompatible":{"endpoint":"","model":""}}',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'codex_cli', 'codex_cli', 'Codex CLI (本地)', 'codex_cli',
    '', '', 128000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'claude_code_cli', 'claude_code_cli', 'Claude Code CLI (本地)', 'claude_code_cli',
    '', '', 200000, 'auto', 120, NULL, 0, NULL,
    '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO app_settings (key, value_json, updated_at)
VALUES ('agent.enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;
