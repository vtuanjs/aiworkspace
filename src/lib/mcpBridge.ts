// React-side MCP command handler.
// Listens for MCP tool commands from Rust via Tauri events,
// executes them against panel state, returns results.

import { listen, emit } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../store/workspace";
import { useWorkspacesStore } from "../store/workspaces";
import { useEnvironmentStore } from "../store/environment";
import { executeRequest, REQUEST_SOURCE } from "./httpExecutor";

// MCP result response shape emitted back to Rust
interface McpToolResult {
  id: string;
  result?: unknown;
  error?: string;
}

// Payload received from Rust for each tool call
interface McpToolCallPayload {
  id: string;
  tool: string;
  params: Record<string, unknown>;
}

// Shape of http_request params from MCP
interface HttpRequestParams {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}

const MCP_TOOL_CALL_EVENT = "mcp:tool_call";
const MCP_TOOL_RESULT_EVENT = "mcp:tool_result";

async function handleToolCall(payload: McpToolCallPayload): Promise<McpToolResult> {
  const { id, tool, params } = payload;

  try {
    switch (tool) {
      case "http_request": {
        const p = params as HttpRequestParams;
        if (!p.url) {
          return { id, error: "Missing required param: url" };
        }
        const result = await executeRequest(
          {
            method: (p.method ?? "GET").toUpperCase(),
            url: p.url,
            headers: p.headers ?? {},
            body: p.body,
          },
          REQUEST_SOURCE.CLAUDE_CODE
        );
        return { id, result };
      }

      case "env_get_variables": {
        const workspacesState = useWorkspacesStore.getState();
        const activeWorkspaceId = workspacesState.activeWorkspaceId;
        const activeWorkspace = activeWorkspaceId
          ? workspacesState.workspaces.find((w) => w.id === activeWorkspaceId)
          : null;

        if (!activeWorkspace) return { id, result: {} };

        const envStore = useEnvironmentStore.getState();
        const requestedEnv = typeof params.environment === "string"
          ? params.environment
          : envStore.activeEnvironment;

        // Return only plain (non-secret) values for the requested environment.
        // Secrets are never exposed to Claude Code — they stay in Rust.
        const plainVars = envStore.environments[requestedEnv] ?? {};
        const runtimeTokenNames = Object.keys(envStore.getActiveRuntimeTokens());

        return {
          id,
          result: {
            environment: requestedEnv,
            variables: plainVars,
            runtimeTokens: runtimeTokenNames, // names only, not values
          },
        };
      }

      case "env_switch": {
        const workspacesState = useWorkspacesStore.getState();
        const activeWorkspaceId = workspacesState.activeWorkspaceId;
        const activeWorkspace = activeWorkspaceId
          ? workspacesState.workspaces.find((w) => w.id === activeWorkspaceId)
          : null;
        const envName = typeof params.environment === "string" ? params.environment : null;

        if (!activeWorkspace || !envName) {
          return { id, error: "Missing project or environment name" };
        }
        await useEnvironmentStore.getState().switchEnvironment(activeWorkspace.path, envName);
        return { id, result: { switched: true, environment: envName } };
      }

      case "token_capture": {
        const name = typeof params.name === "string" ? params.name : null;
        const value = typeof params.value === "string" ? params.value : null;
        const ttl = typeof params.ttl_seconds === "number" ? params.ttl_seconds : undefined;

        if (!name || value === null) {
          return { id, error: "Missing required params: name, value" };
        }
        useEnvironmentStore.getState().captureToken(name, value, ttl);
        return { id, result: { captured: true, name } };
      }

      case "workspace_get_context": {
        const workspaceState = useWorkspaceStore.getState();
        const workspacesState = useWorkspacesStore.getState();
        const activeWorkspaceId = workspacesState.activeWorkspaceId;
        const activeWorkspace = activeWorkspaceId
          ? workspacesState.workspaces.find((w) => w.id === activeWorkspaceId)
          : null;

        return {
          id,
          result: {
            activePanel: workspaceState.activePanel,
            openFiles: workspaceState.openFiles,
            browserUrl: workspaceState.browserUrl,
            projectPath: activeWorkspace?.path ?? null,
            projectName: activeWorkspace?.name ?? null,
          },
        };
      }

      case "browser_navigate": {
        const url = typeof params.url === "string" ? params.url : null;
        if (!url) {
          return { id, error: "Missing required param: url" };
        }
        useWorkspaceStore.getState().setBrowserUrl(url);
        return { id, result: { navigated: true, url } };
      }

      case "browser_get_console_logs": {
        // Delegate to BrowserPanel by emitting an event and waiting for response.
        // The panel listens for "mcp:request_console_logs" and emits "mcp:console_logs".
        const responsePromise = new Promise<unknown>((resolve) => {
          listen<unknown>("mcp:console_logs", (evt) => {
            resolve(evt.payload);
          }).then((unlisten) => {
            // Auto-cleanup after single use
            setTimeout(unlisten, 5000);
          });
        });
        await emit("mcp:request_console_logs", {});
        const logs = await Promise.race([
          responsePromise,
          new Promise<unknown>((resolve) => setTimeout(() => resolve([]), 2000)),
        ]);
        return { id, result: logs };
      }

      case "browser_get_dom": {
        const selector = typeof params.selector === "string" ? params.selector : null;
        const domPromise = new Promise<unknown>((resolve) => {
          listen<unknown>("mcp:browser_get_dom_result", (evt) => resolve(evt.payload))
            .then((unlisten) => setTimeout(unlisten, 6000));
        });
        await emit("mcp:browser_get_dom", { selector });
        const domResult = await Promise.race([
          domPromise,
          new Promise<unknown>((resolve) => setTimeout(() => resolve({ error: "timeout" }), 5000)),
        ]);
        return { id, result: domResult };
      }

      case "browser_click": {
        const selector = typeof params.selector === "string" ? params.selector : null;
        if (!selector) return { id, error: "Missing required param: selector" };
        const clickPromise = new Promise<unknown>((resolve) => {
          listen<unknown>("mcp:browser_click_result", (evt) => resolve(evt.payload))
            .then((unlisten) => setTimeout(unlisten, 6000));
        });
        await emit("mcp:browser_click", { selector });
        const clickResult = await Promise.race([
          clickPromise,
          new Promise<unknown>((resolve) => setTimeout(() => resolve({ error: "timeout" }), 5000)),
        ]);
        return { id, result: clickResult };
      }

      case "browser_fill": {
        const selector = typeof params.selector === "string" ? params.selector : null;
        const value = typeof params.value === "string" ? params.value : null;
        if (!selector || value === null) {
          return { id, error: "Missing required params: selector, value" };
        }
        const fillPromise = new Promise<unknown>((resolve) => {
          listen<unknown>("mcp:browser_fill_result", (evt) => resolve(evt.payload))
            .then((unlisten) => setTimeout(unlisten, 6000));
        });
        await emit("mcp:browser_fill", { selector, value });
        const fillResult = await Promise.race([
          fillPromise,
          new Promise<unknown>((resolve) => setTimeout(() => resolve({ error: "timeout" }), 5000)),
        ]);
        return { id, result: fillResult };
      }

      case "browser_screenshot": {
        const screenshotPromise = new Promise<unknown>((resolve) => {
          listen<unknown>("mcp:browser_screenshot_result", (evt) => resolve(evt.payload))
            .then((unlisten) => setTimeout(unlisten, 11000));
        });
        await emit("mcp:browser_screenshot", { selector: params.selector ?? null });
        const screenshotResult = await Promise.race([
          screenshotPromise,
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve({ error: "timeout" }), 10000)
          ),
        ]);
        return { id, result: screenshotResult };
      }

      default:
        return { id, error: `Unknown tool: ${tool}` };
    }
  } catch (err) {
    return { id, error: String(err) };
  }
}

export function initMcpBridge(): () => void {
  const unlistenPromise = listen<McpToolCallPayload>(
    MCP_TOOL_CALL_EVENT,
    async (event) => {
      const result = await handleToolCall(event.payload);
      await emit(MCP_TOOL_RESULT_EVENT, result);
    }
  );

  return () => {
    unlistenPromise.then((unlisten) => unlisten());
  };
}
