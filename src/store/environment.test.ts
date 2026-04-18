import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { useEnvironmentStore } from "./environment";

describe("useEnvironmentStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useEnvironmentStore.setState({
      activeEnvironment: "",
      environments: {},
      runtimeTokens: {},
    });
  });

  describe("loadEnvironments", () => {
    it("loads environments from disk and sets state", async () => {
      mockInvoke.mockResolvedValue({
        active: "production",
        environments: { production: { BASE_URL: "https://api.example.com" } },
      });

      await useEnvironmentStore.getState().loadEnvironments("/proj");

      const state = useEnvironmentStore.getState();
      expect(state.activeEnvironment).toBe("production");
      expect(state.environments.production.BASE_URL).toBe("https://api.example.com");
      expect(mockInvoke).toHaveBeenCalledWith("get_environments", { projectPath: "/proj" });
    });

    it("resets to defaults on error", async () => {
      useEnvironmentStore.setState({ activeEnvironment: "old", environments: { old: { X: "1" } } });
      mockInvoke.mockRejectedValue(new Error("file not found"));

      await useEnvironmentStore.getState().loadEnvironments("/proj");

      const state = useEnvironmentStore.getState();
      expect(state.activeEnvironment).toBe("");
      expect(state.environments).toEqual({});
    });
  });

  describe("switchEnvironment", () => {
    it("calls invoke and updates activeEnvironment", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await useEnvironmentStore.getState().switchEnvironment("/proj", "staging");

      expect(mockInvoke).toHaveBeenCalledWith("set_active_environment", {
        projectPath: "/proj",
        envName: "staging",
      });
      expect(useEnvironmentStore.getState().activeEnvironment).toBe("staging");
    });
  });

  describe("captureToken", () => {
    it("stores a token without TTL", () => {
      useEnvironmentStore.getState().captureToken("API_KEY", "secret-value");

      const token = useEnvironmentStore.getState().runtimeTokens.API_KEY;
      expect(token.value).toBe("secret-value");
      expect(token.expiresAt).toBeUndefined();
    });

    it("stores a token with TTL as future Unix ms timestamp", () => {
      const before = Date.now();
      useEnvironmentStore.getState().captureToken("SESSION", "tok-abc", 60);
      const after = Date.now();

      const token = useEnvironmentStore.getState().runtimeTokens.SESSION;
      expect(token.value).toBe("tok-abc");
      expect(token.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(token.expiresAt).toBeLessThanOrEqual(after + 60_000);
    });

    it("overwrites an existing token with the same name", () => {
      useEnvironmentStore.getState().captureToken("KEY", "old");
      useEnvironmentStore.getState().captureToken("KEY", "new");

      expect(useEnvironmentStore.getState().runtimeTokens.KEY.value).toBe("new");
    });
  });

  describe("clearExpiredTokens", () => {
    it("removes expired tokens while keeping valid and permanent ones", () => {
      useEnvironmentStore.setState({
        runtimeTokens: {
          EXPIRED: { value: "old", expiresAt: Date.now() - 1000 },
          VALID: { value: "live", expiresAt: Date.now() + 60_000 },
          PERMANENT: { value: "forever" },
        },
      });

      useEnvironmentStore.getState().clearExpiredTokens();

      const tokens = useEnvironmentStore.getState().runtimeTokens;
      expect(tokens.EXPIRED).toBeUndefined();
      expect(tokens.VALID).toBeDefined();
      expect(tokens.PERMANENT).toBeDefined();
    });
  });

  describe("getActiveVariables", () => {
    it("returns plain vars for the active environment", () => {
      useEnvironmentStore.setState({
        activeEnvironment: "dev",
        environments: {
          dev: { HOST: "localhost" },
          prod: { HOST: "api.example.com" },
        },
      });

      expect(useEnvironmentStore.getState().getActiveVariables()).toEqual({ HOST: "localhost" });
    });

    it("returns empty object when active env has no registered vars", () => {
      useEnvironmentStore.setState({ activeEnvironment: "nonexistent", environments: {} });

      expect(useEnvironmentStore.getState().getActiveVariables()).toEqual({});
    });
  });

  describe("getActiveRuntimeTokens", () => {
    it("returns name→value map for non-expired tokens only", () => {
      useEnvironmentStore.setState({
        runtimeTokens: {
          VALID: { value: "v1", expiresAt: Date.now() + 60_000 },
          EXPIRED: { value: "v2", expiresAt: Date.now() - 1000 },
          PERMANENT: { value: "v3" },
        },
      });

      expect(useEnvironmentStore.getState().getActiveRuntimeTokens()).toEqual({
        VALID: "v1",
        PERMANENT: "v3",
      });
    });

    it("returns empty object when all tokens are expired", () => {
      useEnvironmentStore.setState({
        runtimeTokens: {
          OLD: { value: "x", expiresAt: Date.now() - 1 },
        },
      });

      expect(useEnvironmentStore.getState().getActiveRuntimeTokens()).toEqual({});
    });
  });
});
