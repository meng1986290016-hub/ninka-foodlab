#[tokio::main]
async fn main() {
    if let Err(message) = food_rd_desktop::agent::mcp::run_mcp_from_env().await {
        eprintln!("食研 MCP 服务无法启动：{message}");
        std::process::exit(1);
    }
}
