[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($args.Count -ge 1 -and $args[0] -eq "--version") {
    [Console]::Out.WriteLine("2.1.0 (Claude Code)")
    exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "auth" -and $args[1] -eq "status") {
    [Console]::Out.WriteLine('{"loggedIn":true,"authMethod":"test"}')
    exit 0
}

$allArguments = $args -join "`n"
if ($allArguments.Contains("__HANG__")) {
    Start-Sleep -Seconds 30
    exit 0
}
if ($allArguments.Contains("UNSELECTED_SECRET")) {
    [Console]::Error.WriteLine("unselected attachment leaked")
    exit 90
}

if ($allArguments.Contains("__EXPECT_MCP__")) {
    $configFlagIndex = [Array]::IndexOf($args, "--mcp-config")
    $allowedToolsIndex = [Array]::IndexOf($args, "--allowedTools")
    $validAllowedTools = $allowedToolsIndex -ge 0 -and $allowedToolsIndex + 1 -lt $args.Count -and $args[$allowedToolsIndex + 1] -eq "mcp__food_rd__*"
    $validConfig = $false
    if ($configFlagIndex -ge 0 -and $configFlagIndex + 1 -lt $args.Count) {
        $configPath = $args[$configFlagIndex + 1]
        if (Test-Path -LiteralPath $configPath) {
            $configText = Get-Content -LiteralPath $configPath -Raw
            $validConfig = $configText.Contains('"food_rd"') -and $configText.Contains("FOOD_RD_MCP_TOKEN")
        }
    }
    if (-not ($validAllowedTools -and $validConfig)) {
        [Console]::Error.WriteLine("missing task-scoped MCP config")
        exit 91
    }
}

if ($allArguments.Contains("仅返回 JSON")) {
    [Console]::Out.WriteLine('{"type":"result","subtype":"success","result":"{\"finalResponse\":{\"ok\":true},\"toolCalls\":[]}","structured_output":{"finalResponse":{"ok":true},"toolCalls":[]},"usage":{"input_tokens":2,"output_tokens":1}}')
    exit 0
}

if ($allArguments.Contains("__FAILED_MCP__")) {
    [Console]::Out.WriteLine('{"type":"assistant","message":{"content":[{"type":"tool_use","id":"call-claude-failed","name":"mcp__food_rd__read_task_attachments","input":{}}]}}')
    [Console]::Out.WriteLine('{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"call-claude-failed","content":"permission denied","is_error":true}]}}')
    [Console]::Out.WriteLine('{"type":"result","subtype":"success","is_error":false,"result":"工具被拒绝","structured_output":{"items":[]},"usage":{"input_tokens":10,"output_tokens":5}}')
    exit 0
}

[Console]::Out.WriteLine('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-claude\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}"}}}')
[Console]::Out.WriteLine('{"type":"result","subtype":"success","result":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-claude\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}","structured_output":{"finalResponse":{"items":[]},"toolCalls":[{"id":"call-claude","name":"create_ingredient_import_draft","arguments":"{\"materialName\":\"脱脂乳粉\"}"}]},"usage":{"input_tokens":10,"output_tokens":5}}')
