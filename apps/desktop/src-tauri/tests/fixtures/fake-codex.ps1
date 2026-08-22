[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($args.Count -ge 1 -and $args[0] -eq "--version") {
    [Console]::Out.WriteLine("codex-cli 9.9.9")
    exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "login" -and $args[1] -eq "status") {
    [Console]::Out.WriteLine("Logged in using test account")
    exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "debug" -and $args[1] -eq "models") {
    [Console]::Out.WriteLine('{"models":[{"slug":"gpt-5.6-sol","display_name":"GPT-5.6-Sol","visibility":"list","priority":1},{"slug":"hidden-model","display_name":"Hidden model","visibility":"hide","priority":0}]}')
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
    $hasCommand = $allArguments.Contains("mcp_servers.food_rd.command=")
    $hasToken = $allArguments.Contains("FOOD_RD_MCP_TOKEN")
    $hasApproval = $allArguments.Contains("mcp_servers.food_rd.default_tools_approval_mode=") -and $allArguments.Contains("approve")
    if (-not ($hasCommand -and $hasToken -and $hasApproval)) {
        [Console]::Error.WriteLine("missing task-scoped MCP config")
        exit 91
    }
}

if ($allArguments.Contains("__EXPECT_IMAGE_PROMPT_BOUNDARY__")) {
    $imageIndex = [Array]::IndexOf($args, "-i")
    $separatorIndex = [Array]::IndexOf($args, "--")
    $promptIndex = -1
    for ($index = 0; $index -lt $args.Count; $index++) {
        if ($args[$index].Contains("__EXPECT_IMAGE_PROMPT_BOUNDARY__")) {
            $promptIndex = $index
        }
    }
    if ($imageIndex -lt 0 -or $separatorIndex -le $imageIndex -or $promptIndex -le $separatorIndex) {
        [Console]::Error.WriteLine("image prompt boundary missing")
        exit 92
    }
}

if ($allArguments.Contains("仅返回 JSON")) {
    [Console]::Out.WriteLine('{"type":"item.completed","item":{"id":"message-probe","type":"agent_message","text":"{\"finalResponse\":{\"ok\":true},\"toolCalls\":[]}"}}')
    [Console]::Out.WriteLine('{"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":1}}')
    exit 0
}

if ($allArguments.Contains("__FAILED_MCP__")) {
    [Console]::Out.WriteLine('{"type":"item.completed","item":{"id":"call-cancelled","type":"mcp_tool_call","server":"food_rd","tool":"read_task_attachments","arguments":{},"result":null,"error":{"message":"user cancelled MCP tool call"},"status":"failed"}}')
    [Console]::Out.WriteLine('{"type":"item.completed","item":{"id":"message-failed","type":"agent_message","text":"工具被取消"}}')
    [Console]::Out.WriteLine('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}')
    exit 0
}

[Console]::Out.WriteLine('{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-codex\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}"}}')
[Console]::Out.WriteLine('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}')
