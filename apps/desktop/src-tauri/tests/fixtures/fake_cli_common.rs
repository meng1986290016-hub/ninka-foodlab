use std::{env, fs, process, thread, time::Duration};

#[allow(dead_code)]
pub enum Flavor {
    Codex,
    Claude,
}

pub fn run(flavor: Flavor) {
    let arguments = env::args_os()
        .skip(1)
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

    match flavor {
        Flavor::Codex => run_codex(&arguments),
        Flavor::Claude => run_claude(&arguments),
    }
}

fn run_codex(arguments: &[String]) {
    if arguments
        .first()
        .is_some_and(|argument| argument == "--version")
    {
        out("codex-cli 9.9.9");
        return;
    }
    if starts_with(arguments, &["login", "status"]) {
        out("Logged in using test account");
        return;
    }
    if starts_with(arguments, &["debug", "models"]) {
        out(
            r#"{"models":[{"slug":"gpt-5.6-sol","display_name":"GPT-5.6-Sol","visibility":"list","priority":1},{"slug":"hidden-model","display_name":"Hidden model","visibility":"hide","priority":0}]}"#,
        );
        return;
    }

    apply_shared_guards(arguments);

    if contains(arguments, "__EXPECT_MCP__") {
        let has_command = arguments
            .iter()
            .any(|argument| argument.starts_with("mcp_servers.food_rd.command="));
        let has_token = contains(arguments, "FOOD_RD_MCP_TOKEN");
        let has_approval = arguments.iter().any(|argument| {
            argument.starts_with("mcp_servers.food_rd.default_tools_approval_mode=")
                && argument.contains("approve")
        });
        if !(has_command && has_token && has_approval) {
            fail(91, "missing task-scoped MCP config");
        }
    }

    if contains(arguments, "__EXPECT_IMAGE_PROMPT_BOUNDARY__") {
        let image_index = arguments.iter().position(|argument| argument == "-i");
        let separator_index = arguments.iter().position(|argument| argument == "--");
        let prompt_index = arguments
            .iter()
            .rposition(|argument| argument.contains("__EXPECT_IMAGE_PROMPT_BOUNDARY__"));
        if !matches!(
            (image_index, separator_index, prompt_index),
            (Some(image), Some(separator), Some(prompt)) if image < separator && separator < prompt
        ) {
            fail(92, "image prompt boundary missing");
        }
    }

    if contains(arguments, "仅返回 JSON") {
        out(
            r#"{"type":"item.completed","item":{"id":"message-probe","type":"agent_message","text":"{\"finalResponse\":{\"ok\":true},\"toolCalls\":[]}"}}"#,
        );
        out(r#"{"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":1}}"#);
        return;
    }

    if contains(arguments, "__FAILED_MCP__") {
        out(
            r#"{"type":"item.completed","item":{"id":"call-cancelled","type":"mcp_tool_call","server":"food_rd","tool":"read_task_attachments","arguments":{},"result":null,"error":{"message":"user cancelled MCP tool call"},"status":"failed"}}"#,
        );
        out(
            r#"{"type":"item.completed","item":{"id":"message-failed","type":"agent_message","text":"工具被取消"}}"#,
        );
        out(r#"{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}"#);
        return;
    }

    out(
        r#"{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-codex\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}"}}"#,
    );
    out(r#"{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}"#);
}

fn run_claude(arguments: &[String]) {
    if arguments
        .first()
        .is_some_and(|argument| argument == "--version")
    {
        out("2.1.0 (Claude Code)");
        return;
    }
    if starts_with(arguments, &["auth", "status"]) {
        out(r#"{"loggedIn":true,"authMethod":"test"}"#);
        return;
    }

    apply_shared_guards(arguments);

    if contains(arguments, "__EXPECT_MCP__") {
        let allowed_tools = value_after(arguments, "--allowedTools")
            .is_some_and(|value| value == "mcp__food_rd__*");
        let valid_config = value_after(arguments, "--mcp-config")
            .and_then(|path| fs::read_to_string(path).ok())
            .is_some_and(|config| {
                config.contains("\"food_rd\"") && config.contains("FOOD_RD_MCP_TOKEN")
            });
        if !(allowed_tools && valid_config) {
            fail(91, "missing task-scoped MCP config");
        }
    }

    if contains(arguments, "仅返回 JSON") {
        out(
            r#"{"type":"result","subtype":"success","result":"{\"finalResponse\":{\"ok\":true},\"toolCalls\":[]}","structured_output":{"finalResponse":{"ok":true},"toolCalls":[]},"usage":{"input_tokens":2,"output_tokens":1}}"#,
        );
        return;
    }

    if contains(arguments, "__FAILED_MCP__") {
        out(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"call-claude-failed","name":"mcp__food_rd__read_task_attachments","input":{}}]}}"#,
        );
        out(
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"call-claude-failed","content":"permission denied","is_error":true}]}}"#,
        );
        out(
            r#"{"type":"result","subtype":"success","is_error":false,"result":"工具被拒绝","structured_output":{"items":[]},"usage":{"input_tokens":10,"output_tokens":5}}"#,
        );
        return;
    }

    out(
        r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-claude\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}"}}}"#,
    );
    out(
        r#"{"type":"result","subtype":"success","result":"{\"finalResponse\":{\"items\":[]},\"toolCalls\":[{\"id\":\"call-claude\",\"name\":\"create_ingredient_import_draft\",\"arguments\":\"{\\\"materialName\\\":\\\"脱脂乳粉\\\"}\"}]}","structured_output":{"finalResponse":{"items":[]},"toolCalls":[{"id":"call-claude","name":"create_ingredient_import_draft","arguments":"{\"materialName\":\"脱脂乳粉\"}"}]},"usage":{"input_tokens":10,"output_tokens":5}}"#,
    );
}

fn apply_shared_guards(arguments: &[String]) {
    if contains(arguments, "__HANG__") {
        thread::sleep(Duration::from_secs(30));
        return;
    }
    if contains(arguments, "UNSELECTED_SECRET") {
        fail(90, "unselected attachment leaked");
    }
}

fn starts_with(arguments: &[String], prefix: &[&str]) -> bool {
    arguments
        .iter()
        .map(String::as_str)
        .zip(prefix.iter().copied())
        .all(|(argument, expected)| argument == expected)
        && arguments.len() >= prefix.len()
}

fn contains(arguments: &[String], needle: &str) -> bool {
    arguments.iter().any(|argument| argument.contains(needle))
}

fn value_after<'a>(arguments: &'a [String], flag: &str) -> Option<&'a str> {
    arguments
        .windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].as_str())
}

fn out(message: &str) {
    println!("{message}");
}

fn fail(code: i32, message: &str) -> ! {
    eprintln!("{message}");
    process::exit(code);
}
