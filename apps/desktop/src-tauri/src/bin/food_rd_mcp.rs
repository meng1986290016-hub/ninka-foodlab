use std::{env, path::PathBuf};

use food_rd_desktop::{
    agent::{
        mcp::{
            MCP_ATTACHMENT_ROOT_ENV, MCP_CAPABILITY_ENV, MCP_DATABASE_ENV, MCP_TOKEN_ENV,
            McpServer, McpTaskCapability, serve_mcp,
        },
        repository::AgentRepository,
        tools::AgentToolRegistry,
    },
    agent_recipe::repository::AgentRecipeRepository,
    ingest::coordinator::IngredientIngestCoordinator,
    rnd_reference::repository::RndReferenceRepository,
};

#[tokio::main]
async fn main() {
    if let Err(message) = run().await {
        eprintln!("食研 MCP 服务无法启动：{message}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let token = required_env(MCP_TOKEN_ENV)?;
    let capability_path = PathBuf::from(required_env(MCP_CAPABILITY_ENV)?);
    let database_path = PathBuf::from(required_env(MCP_DATABASE_ENV)?);
    let attachment_root = PathBuf::from(required_env(MCP_ATTACHMENT_ROOT_ENV)?);
    let context = McpTaskCapability::consume(&capability_path, &token)
        .map_err(|error| error.message().to_string())?;
    let coordinator = IngredientIngestCoordinator::open(&database_path, &attachment_root)
        .map_err(|error| error.message().to_string())?;
    let audit = AgentRepository::open_for_runtime(&database_path)
        .map_err(|error| error.message().to_string())?;
    let recipe_proposals =
        AgentRecipeRepository::open(&database_path).map_err(|error| error.message().to_string())?;
    let references = RndReferenceRepository::open(&database_path)
        .map_err(|error| error.message().to_string())?;
    let registry = AgentToolRegistry::with_audit_recipes_and_references(
        coordinator,
        audit,
        recipe_proposals,
        references,
    );
    let server = McpServer::new(registry, context);
    serve_mcp(server, tokio::io::stdin(), tokio::io::stdout())
        .await
        .map_err(|_| "标准输入输出连接异常".into())
}

fn required_env(name: &str) -> Result<String, String> {
    env::var(name).map_err(|_| "缺少任务级授权信息".into())
}
