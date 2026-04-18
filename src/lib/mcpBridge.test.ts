import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListen = vi.hoisted(() => vi.fn());
const mockEmit = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen, emit: mockEmit }));

const mockExecuteRequest = vi.hoisted(() => vi.fn());
vi.mock("./httpExecutor", () => ({
  executeRequest: mockExecuteRequest,
  REQUEST_SOURCE: { YOU: "YOU", CLAUDE_CODE: "CLAUDE_CODE" },
}));

const mockWorkspaceStore = vi.hoisted(() => ({
  activePanel: "TERMINAL",
  browserUrl: "http://localhost:3000",
  openFiles: ["src/App.tsx"],
  setBrowserUrl: vi.fn(),
}));
vi.mock("../store/workspace", () => ({
  useWorkspaceStore: { getState: () => mockWorkspaceStore },
}));

const mockProjectsStore = vi.hoisted(() => ({
  activeProjectId: "proj-1",
  projects: [{ id: "proj-1", path: "/proj", name: "My Project" }],
}));
vi.mock("../store/projects", () => ({
  useProjectsStore: { getState: () => mockProjectsStore },
}));

const mockEnvironmentStore = vi.hoisted(() => ({
  activeEnvironment: "dev",
  environments: { dev: { HOST: "localhost" } },
  getActiveRuntimeTokens: vi.fn().mockReturnValue({ TOKEN: "tok-abc" }),
  switchEnvironment: vi.fn(),
  captureToken: vi.fn(),
}));
vi.mock("../store/environment", () => ({
  useEnvironmentStore: { getState: () => mockEnvironmentStore },
}));

import { initMcpBridge } from "./mcpBridge";

type McpToolCallPayload = { id: string; tool: string; params: Record<string, unknown> };
type HandlerFn = (event: { payload: McpToolCallPayload }) => Promise<void>;

function setupBridge() {
  let toolCallHandler: HandlerFn | undefined;

  mockListen.mockImplementation((eventName: string, callback: unknown) => {
    if (eventName === "mcp:tool_call") {
      toolCallHandler = callback as HandlerFn;
    }
    return Promise.resolve(() => {});
  });
  mockEmit.mockResolvedValue(undefined);

  initMcpBridge();

  return {
    async call(id: string, tool: string, params: Record<string, unknown> = {}) {
      await toolCallHandler!({ payload: { id, tool, params } });
      return mockEmit.mock.calls.find((c) => c[0] === "mcp:tool_result")?.[1];
    },
  };
}

describe("initMcpBridge", () => {
  beforeEach(() => {
    mockListen.mockReset();
    mockEmit.mockReset();
    mockExecuteRequest.mockReset();
    mockWorkspaceStore.setBrowserUrl.mockReset();
    mockEnvironmentStore.switchEnvironment.mockReset();
    mockEnvironmentStore.captureToken.mockReset();
    mockEnvironmentStore.getActiveRuntimeTokens.mockReturnValue({ TOKEN: "tok-abc" });
    mockProjectsStore.activeProjectId = "proj-1";
  });

  it("registers a listener for mcp:tool_call", () => {
    mockListen.mockResolvedValue(() => {});
    initMcpBridge();
    expect(mockListen).toHaveBeenCalledWith("mcp:tool_call", expect.any(Function));
  });

  it("returns a cleanup function that calls unlisten", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const cleanup = initMcpBridge();
    cleanup();

    await Promise.resolve(); // flush .then
    expect(mockUnlisten).toHaveBeenCalled();
  });

  describe("http_request tool", () => {
    it("delegates to executeRequest and returns the log entry", async () => {
      const fakeEntry = { id: "log-1", status: 200 };
      mockExecuteRequest.mockResolvedValue(fakeEntry);
      const bridge = setupBridge();

      const result = await bridge.call("r1", "http_request", {
        method: "GET",
        url: "http://api.test",
        headers: {},
      });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "GET", url: "http://api.test" }),
        "CLAUDE_CODE"
      );
      expect(result).toEqual({ id: "r1", result: fakeEntry });
    });

    it("returns an error when url param is missing", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("r2", "http_request", { method: "POST" });

      expect(result).toEqual({ id: "r2", error: "Missing required param: url" });
      expect(mockExecuteRequest).not.toHaveBeenCalled();
    });

    it("defaults to GET when method is not provided", async () => {
      mockExecuteRequest.mockResolvedValue({});
      const bridge = setupBridge();

      await bridge.call("r3", "http_request", { url: "http://api.test" });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "GET" }),
        "CLAUDE_CODE"
      );
    });
  });

  describe("env_get_variables tool", () => {
    it("returns plain vars and runtime token names for the active environment", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("e1", "env_get_variables");

      expect(result).toEqual({
        id: "e1",
        result: {
          environment: "dev",
          variables: { HOST: "localhost" },
          runtimeTokens: ["TOKEN"],
        },
      });
    });

    it("uses requested environment when provided", async () => {
      mockEnvironmentStore.environments = {
        dev: { HOST: "localhost" },
        prod: { HOST: "api.prod" },
      };
      const bridge = setupBridge();

      const result = await bridge.call("e2", "env_get_variables", { environment: "prod" });

      expect(result.result.environment).toBe("prod");
      expect(result.result.variables).toEqual({ HOST: "api.prod" });
    });

    it("returns empty result when no active project", async () => {
      mockProjectsStore.activeProjectId = null as unknown as string;
      const bridge = setupBridge();

      const result = await bridge.call("e3", "env_get_variables");

      expect(result).toEqual({ id: "e3", result: {} });
    });
  });

  describe("env_switch tool", () => {
    it("switches environment and returns confirmation", async () => {
      mockEnvironmentStore.switchEnvironment.mockResolvedValue(undefined);
      const bridge = setupBridge();

      const result = await bridge.call("s1", "env_switch", { environment: "prod" });

      expect(mockEnvironmentStore.switchEnvironment).toHaveBeenCalledWith("/proj", "prod");
      expect(result).toEqual({ id: "s1", result: { switched: true, environment: "prod" } });
    });

    it("returns an error when environment param is missing", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("s2", "env_switch", {});

      expect(result).toEqual({ id: "s2", error: "Missing project or environment name" });
    });

    it("returns an error when no active project", async () => {
      mockProjectsStore.activeProjectId = null as unknown as string;
      const bridge = setupBridge();

      const result = await bridge.call("s3", "env_switch", { environment: "prod" });

      expect(result).toEqual({ id: "s3", error: "Missing project or environment name" });
    });
  });

  describe("token_capture tool", () => {
    it("captures a token and returns confirmation", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("t1", "token_capture", {
        name: "SESSION_TOKEN",
        value: "abc123",
        ttl_seconds: 300,
      });

      expect(mockEnvironmentStore.captureToken).toHaveBeenCalledWith("SESSION_TOKEN", "abc123", 300);
      expect(result).toEqual({ id: "t1", result: { captured: true, name: "SESSION_TOKEN" } });
    });

    it("returns an error when name or value is missing", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("t2", "token_capture", { name: "MISSING_VALUE" });

      expect(result).toEqual({ id: "t2", error: "Missing required params: name, value" });
    });
  });

  describe("workspace_get_context tool", () => {
    it("returns current workspace and project context", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("w1", "workspace_get_context");

      expect(result).toEqual({
        id: "w1",
        result: {
          activePanel: "TERMINAL",
          openFiles: ["src/App.tsx"],
          browserUrl: "http://localhost:3000",
          projectPath: "/proj",
          projectName: "My Project",
        },
      });
    });

    it("returns null project fields when no active project", async () => {
      mockProjectsStore.activeProjectId = null as unknown as string;
      const bridge = setupBridge();

      const result = await bridge.call("w2", "workspace_get_context");

      expect(result.result.projectPath).toBeNull();
      expect(result.result.projectName).toBeNull();
    });
  });

  describe("browser_navigate tool", () => {
    it("calls setBrowserUrl and returns confirmation", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("b1", "browser_navigate", { url: "https://example.com" });

      expect(mockWorkspaceStore.setBrowserUrl).toHaveBeenCalledWith("https://example.com");
      expect(result).toEqual({ id: "b1", result: { navigated: true, url: "https://example.com" } });
    });

    it("returns an error when url param is missing", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("b2", "browser_navigate", {});

      expect(result).toEqual({ id: "b2", error: "Missing required param: url" });
      expect(mockWorkspaceStore.setBrowserUrl).not.toHaveBeenCalled();
    });
  });

  describe("browser_get_console_logs tool", () => {
    it("emits mcp:request_console_logs and returns logs when received", async () => {
      const logs = [{ type: "error", message: "404" }];
      let toolCallHandler: HandlerFn | undefined;
      let consoleLogsCallback: ((event: { payload: unknown }) => void) | undefined;

      mockListen.mockImplementation((eventName: string, callback: unknown) => {
        if (eventName === "mcp:tool_call") {
          toolCallHandler = callback as HandlerFn;
        } else if (eventName === "mcp:console_logs") {
          consoleLogsCallback = callback as typeof consoleLogsCallback;
        }
        return Promise.resolve(() => {});
      });
      mockEmit.mockResolvedValue(undefined);

      initMcpBridge();

      const handlerPromise = toolCallHandler!({
        payload: { id: "cl1", tool: "browser_get_console_logs", params: {} },
      });

      // Flush microtasks past `await emit` so the mcp:console_logs listener is registered
      await Promise.resolve();
      await Promise.resolve();

      consoleLogsCallback!({ payload: logs });
      await handlerPromise;

      expect(mockEmit).toHaveBeenCalledWith("mcp:request_console_logs", {});
      expect(mockEmit).toHaveBeenCalledWith("mcp:tool_result", { id: "cl1", result: logs });
    });

    it("returns empty array when no console logs are received within the timeout", async () => {
      vi.useFakeTimers();

      let toolCallHandler: HandlerFn | undefined;
      mockListen.mockImplementation((eventName: string, callback: unknown) => {
        if (eventName === "mcp:tool_call") toolCallHandler = callback as HandlerFn;
        return Promise.resolve(() => {});
      });
      mockEmit.mockResolvedValue(undefined);

      initMcpBridge();

      const handlerPromise = toolCallHandler!({
        payload: { id: "cl2", tool: "browser_get_console_logs", params: {} },
      });

      // Flush past `await emit` so the 2000ms race timer is registered
      await Promise.resolve();
      vi.advanceTimersByTime(2001);
      await handlerPromise;

      expect(mockEmit).toHaveBeenCalledWith("mcp:tool_result", { id: "cl2", result: [] });
      vi.useRealTimers();
    }, 10_000);
  });

  describe("unknown tool", () => {
    it("returns an error for unrecognised tool names", async () => {
      const bridge = setupBridge();

      const result = await bridge.call("u1", "does_not_exist");

      expect(result).toEqual({ id: "u1", error: "Unknown tool: does_not_exist" });
    });
  });
});
