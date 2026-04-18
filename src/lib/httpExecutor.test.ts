import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

const mockProjectsStore = vi.hoisted(() => ({
  activeWorkspaceId: "proj-1",
  workspaces: [{ id: "proj-1", path: "/project", name: "Test Project" }],
}));
vi.mock("../store/workspaces", () => ({
  useWorkspacesStore: { getState: () => mockProjectsStore },
}));

const mockEnvironmentStore = vi.hoisted(() => ({
  getActiveRuntimeTokens: vi.fn().mockReturnValue({}),
}));
vi.mock("../store/environment", () => ({
  useEnvironmentStore: { getState: () => mockEnvironmentStore },
}));

import { executeRequest, REQUEST_SOURCE } from "./httpExecutor";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeFetchResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
) {
  return {
    status,
    text: () => Promise.resolve(body),
    headers: {
      forEach: (cb: (value: string, key: string) => void) => {
        for (const [k, v] of Object.entries(headers)) cb(v, k);
      },
    },
  };
}

describe("executeRequest", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockFetch.mockReset();
    mockEnvironmentStore.getActiveRuntimeTokens.mockReturnValue({});
    mockProjectsStore.activeWorkspaceId = "proj-1";
  });

  describe("REQUEST_SOURCE constants", () => {
    it("exports YOU and CLAUDE_CODE values", () => {
      expect(REQUEST_SOURCE.YOU).toBe("YOU");
      expect(REQUEST_SOURCE.CLAUDE_CODE).toBe("CLAUDE_CODE");
    });
  });

  describe("happy path", () => {
    it("executes a GET request and returns a populated log entry", async () => {
      mockFetch.mockResolvedValue(
        makeFetchResponse(200, '{"ok":true}', { "content-type": "application/json" })
      );

      const entry = await executeRequest(
        { method: "GET", url: "http://api.test/items", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(entry.source).toBe(REQUEST_SOURCE.YOU);
      expect(entry.response?.status).toBe(200);
      expect(entry.response?.body).toBe('{"ok":true}');
      expect(entry.response?.headers["content-type"]).toBe("application/json");
      expect(entry.error).toBeNull();
      expect(entry.id).toBeTruthy();
    });

    it("labels the entry with CLAUDE_CODE source", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      const entry = await executeRequest(
        { method: "GET", url: "http://api.test", headers: {} },
        REQUEST_SOURCE.CLAUDE_CODE
      );

      expect(entry.source).toBe(REQUEST_SOURCE.CLAUDE_CODE);
    });
  });

  describe("body handling", () => {
    it("attaches body for POST requests", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(201, "created"));

      await executeRequest(
        { method: "POST", url: "http://api.test/items", headers: {}, body: '{"name":"x"}' },
        REQUEST_SOURCE.YOU
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://api.test/items",
        expect.objectContaining({ body: '{"name":"x"}' })
      );
    });

    it("does not attach body for GET requests even when body is provided", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      await executeRequest(
        { method: "GET", url: "http://api.test", headers: {}, body: "ignored" },
        REQUEST_SOURCE.YOU
      );

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBeUndefined();
    });

    it("attaches body for PUT, PATCH, and DELETE", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      for (const method of ["PUT", "PATCH", "DELETE"]) {
        mockFetch.mockClear();
        await executeRequest(
          { method, url: "http://api.test/item/1", headers: {}, body: '{"x":1}' },
          REQUEST_SOURCE.YOU
        );
        expect(mockFetch.mock.calls[0][1].body).toBe('{"x":1}');
      }
    });
  });

  describe("variable resolution", () => {
    it("calls resolve_variables via invoke when URL contains {{placeholders}}", async () => {
      mockInvoke.mockResolvedValue("http://resolved.test/items");
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      await executeRequest(
        { method: "GET", url: "{{BASE_URL}}/items", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(mockInvoke).toHaveBeenCalledWith("resolve_variables", expect.objectContaining({
        text: "{{BASE_URL}}/items",
        projectPath: "/project",
      }));
      expect(mockFetch).toHaveBeenCalledWith("http://resolved.test/items", expect.anything());
    });

    it("skips invoke when URL has no {{}} placeholders", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      await executeRequest(
        { method: "GET", url: "http://plain.test", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("resolves {{variables}} in request headers", async () => {
      mockInvoke.mockResolvedValue("Bearer tok-abc");
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      await executeRequest(
        { method: "GET", url: "http://api.test", headers: { Authorization: "Bearer {{TOKEN}}" } },
        REQUEST_SOURCE.YOU
      );

      expect(mockInvoke).toHaveBeenCalledWith("resolve_variables", expect.objectContaining({
        text: "Bearer {{TOKEN}}",
      }));
    });

    it("passes runtime tokens to resolve_variables", async () => {
      mockEnvironmentStore.getActiveRuntimeTokens.mockReturnValue({ MY_TOKEN: "val" });
      mockInvoke.mockResolvedValue("resolved");
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      await executeRequest(
        { method: "GET", url: "{{MY_TOKEN}}", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(mockInvoke).toHaveBeenCalledWith("resolve_variables", expect.objectContaining({
        runtimeTokens: { MY_TOKEN: "val" },
      }));
    });

    it("skips resolution and returns raw request when no active project", async () => {
      mockProjectsStore.activeWorkspaceId = null as unknown as string;
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      const entry = await executeRequest(
        { method: "GET", url: "{{VAR}}/path", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(entry.request.url).toBe("{{VAR}}/path");
    });
  });

  describe("error handling", () => {
    it("returns an error entry when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network failure"));

      const entry = await executeRequest(
        { method: "GET", url: "http://api.test", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(entry.response).toBeNull();
      expect(entry.error).toContain("network failure");
    });

    it("keeps original URL when resolve_variables invoke fails", async () => {
      mockInvoke.mockRejectedValue(new Error("invoke error"));
      mockFetch.mockResolvedValue(makeFetchResponse(200, "ok"));

      const entry = await executeRequest(
        { method: "GET", url: "{{BROKEN}}/path", headers: {} },
        REQUEST_SOURCE.YOU
      );

      expect(entry.request.url).toBe("{{BROKEN}}/path");
    });
  });
});
