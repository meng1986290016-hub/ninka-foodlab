UPDATE agent_provider_configs
SET protocol = 'openai_responses',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'volcengine_ark'
  AND protocol = 'openai_compatible'
  AND endpoint = 'https://ark.cn-beijing.volces.com/api/v3';

UPDATE agent_provider_configs
SET capabilities_json = '{"text":true,"images":true,"tools":true,"structuredOutput":true,"streaming":true}',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN ('kimi_cn', 'zhipu_glm', 'minimax_cn', 'bailian', 'volcengine_ark')
  AND capabilities_json = '{"text":true,"images":false,"tools":true,"structuredOutput":true,"streaming":true}';
