fn main() {
    if std::env::args().any(|argument| argument == "--foodlab-mcp") {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("无法启动 FoodLab MCP 运行时");
        if let Err(message) = runtime.block_on(food_rd_desktop::agent::mcp::run_mcp_from_env()) {
            eprintln!("食研 MCP 服务无法启动：{message}");
            std::process::exit(1);
        }
        return;
    }
    food_rd_desktop::run();
}
