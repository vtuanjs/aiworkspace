// Library crate that re-exports shared modules.
// Used by Tauri's mobile targets (staticlib / cdylib) and for testing.

pub mod config;
pub mod mcp_bridge;
pub mod mcp_tools;
pub mod mcp_server;
pub mod pty_manager;
pub mod commands;
