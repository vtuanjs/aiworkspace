// Entry point — command registration only. No logic lives here.

mod config;
mod pty_manager;
mod mcp_server;
mod mcp_tools;
mod mcp_bridge;
mod commands;

fn main() {
    let pty = pty_manager::new_shared();

    tauri::Builder::default()
        .manage(pty)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::open_project,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::read_workspace_state,
            commands::projects::write_workspace_state,
            commands::projects::read_panel_state,
            commands::projects::write_panel_state,
            commands::terminal::create_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::fs::read_dir_tree,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_file_entry,
            commands::fs::create_dir_entry,
            commands::fs::rename_entry,
            commands::fs::delete_entry,
            commands::fs::reveal_in_finder,
            commands::fs::search_in_files,
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_stage,
            commands::git::git_commit,
            commands::http::load_http_collections,
            commands::http::save_http_collections,
            commands::environment::get_environments,
            commands::environment::set_active_environment,
            commands::environment::resolve_variables,
            commands::settings::get_app_settings,
            commands::settings::save_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
