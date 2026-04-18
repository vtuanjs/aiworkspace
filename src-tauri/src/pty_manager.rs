// Terminal process lifecycle via portable-pty.
// Owns all PTY handles; no other module touches PTY state.

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::Write;
use std::process::Command;
use std::sync::{Arc, Mutex};

pub struct PtySession {
    pub session_name: String,
    pub writer: Box<dyn Write + Send>,
    // Keep the master handle alive so the PTY stays open
    _master: Box<dyn portable_pty::MasterPty + Send>,
    // Keep the child process handle
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Create a PTY session for `terminal_id` rooted at `project_path`.
    /// Creates a tmux session named `monocode-{terminal_id}` if it does not already exist,
    /// then opens a PTY via NativePtySystem and attaches to tmux inside it.
    /// Returns the tmux session name.
    pub fn create(&mut self, terminal_id: &str, project_path: &str) -> anyhow::Result<String> {
        let session_name = format!("monocode-{}", terminal_id);

        // Create the tmux session if it does not already exist.
        let session_exists = Command::new("tmux")
            .args(["has-session", "-t", &session_name])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if !session_exists {
            let status = Command::new("tmux")
                .args([
                    "new-session",
                    "-d",
                    "-s",
                    &session_name,
                    "-c",
                    project_path,
                ])
                .status()?;
            if !status.success() {
                return Err(anyhow::anyhow!(
                    "failed to create tmux session: {}",
                    session_name
                ));
            }
        }

        // Open a PTY pair via portable-pty.
        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        // Build the command that attaches to the tmux session inside the slave PTY.
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["attach-session", "-t", &session_name]);
        cmd.cwd(project_path);

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;

        self.sessions.insert(
            terminal_id.to_string(),
            PtySession {
                session_name: session_name.clone(),
                writer,
                _master: pair.master,
                _child: child,
            },
        );

        Ok(session_name)
    }

    /// Write raw bytes to the PTY stdin for `terminal_id`.
    pub fn write(&mut self, terminal_id: &str, data: &str) -> anyhow::Result<()> {
        let session = self
            .sessions
            .get_mut(terminal_id)
            .ok_or_else(|| anyhow::anyhow!("no session for terminal_id: {}", terminal_id))?;
        session.writer.write_all(data.as_bytes())?;
        session.writer.flush()?;
        Ok(())
    }

    /// Resize the PTY / tmux window for `terminal_id`.
    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> anyhow::Result<()> {
        let session = self
            .sessions
            .get(terminal_id)
            .ok_or_else(|| anyhow::anyhow!("no session for terminal_id: {}", terminal_id))?;

        let status = Command::new("tmux")
            .args([
                "resize-window",
                "-t",
                &session.session_name,
                "-x",
                &cols.to_string(),
                "-y",
                &rows.to_string(),
            ])
            .status()?;

        if !status.success() {
            return Err(anyhow::anyhow!(
                "tmux resize-window failed for session: {}",
                session.session_name
            ));
        }
        Ok(())
    }

    /// Remove the session from the local map, but leave the tmux session alive.
    pub fn close(&mut self, terminal_id: &str) -> anyhow::Result<()> {
        // Dropping the PtySession closes the writer and master PTY handle,
        // but the tmux session itself keeps running in the background.
        self.sessions.remove(terminal_id);
        Ok(())
    }
}

/// Shared handle used as Tauri managed state.
pub type SharedPtyManager = Arc<Mutex<PtyManager>>;

/// Construct a new SharedPtyManager.
pub fn new_shared() -> SharedPtyManager {
    Arc::new(Mutex::new(PtyManager::new()))
}
