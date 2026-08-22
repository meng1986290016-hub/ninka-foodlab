DELETE FROM agent_runtime_sessions
WHERE route_key <> 'default'
  AND EXISTS (
    SELECT 1 FROM agent_runtime_sessions AS current
    WHERE current.conversation_id = agent_runtime_sessions.conversation_id
      AND current.engine = agent_runtime_sessions.engine
      AND current.route_key = 'default'
  );

UPDATE agent_runtime_sessions
SET route_key = 'default'
WHERE route_key <> 'default';
