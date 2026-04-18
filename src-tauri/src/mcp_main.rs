// Entry point for the `monocode-mcp` binary.
// Communicates with Claude Code over stdio using the MCP JSON-RPC 2.0 protocol.
// Does NOT use Tauri — only the shared protocol modules.

mod config;
mod mcp_bridge;
mod mcp_tools;
mod mcp_server;

fn main() -> anyhow::Result<()> {
    // Parse --project <path> from CLI args if present.
    // The project path is available for future context use (e.g. resolving
    // environment variables), but the MCP server itself is stateless.
    let args: Vec<String> = std::env::args().collect();
    let _project_path = parse_project_arg(&args);

    mcp_server::start()
}

/// Extract the value of `--project <path>` from argv, returning None if absent.
fn parse_project_arg(args: &[String]) -> Option<String> {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "--project" {
            return iter.next().cloned();
        }
    }
    None
}
