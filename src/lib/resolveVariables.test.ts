import { describe, it, expect } from "vitest";
import { resolveVariables, hasVariables, extractVariableNames } from "./resolveVariables";

describe("resolveVariables", () => {
  const runtime = { TOKEN: "tok-abc", SHARED: "from-runtime" };
  const env = { BASE_URL: "http://localhost:3000", SHARED: "from-env" };

  it("resolves runtime token", () => {
    const { resolved, unresolved } = resolveVariables("Bearer {{TOKEN}}", runtime, env);
    expect(resolved).toBe("Bearer tok-abc");
    expect(unresolved).toEqual([]);
  });

  it("resolves env var", () => {
    const { resolved, unresolved } = resolveVariables("{{BASE_URL}}/api", {}, env);
    expect(resolved).toBe("http://localhost:3000/api");
    expect(unresolved).toEqual([]);
  });

  it("runtime takes priority over env when same key", () => {
    const { resolved } = resolveVariables("{{SHARED}}", runtime, env);
    expect(resolved).toBe("from-runtime");
  });

  it("leaves unresolvable variables in place and reports them", () => {
    const { resolved, unresolved } = resolveVariables("{{MISSING}}", {}, {});
    expect(resolved).toBe("{{MISSING}}");
    expect(unresolved).toEqual(["MISSING"]);
  });

  it("handles multiple variables in one string", () => {
    const { resolved, unresolved } = resolveVariables(
      "{{BASE_URL}}/users/{{USER_ID}}",
      {},
      { BASE_URL: "http://api.test" }
    );
    expect(resolved).toBe("http://api.test/users/{{USER_ID}}");
    expect(unresolved).toEqual(["USER_ID"]);
  });

  it("trims whitespace inside braces", () => {
    const { resolved } = resolveVariables("{{ TOKEN }}", runtime, env);
    expect(resolved).toBe("tok-abc");
  });

  it("returns empty unresolved array when text has no variables", () => {
    const { resolved, unresolved } = resolveVariables("plain text", {}, {});
    expect(resolved).toBe("plain text");
    expect(unresolved).toEqual([]);
  });
});

describe("hasVariables", () => {
  it("returns true when text contains {{variable}}", () => {
    expect(hasVariables("Bearer {{TOKEN}}")).toBe(true);
  });

  it("returns false when text has no variables", () => {
    expect(hasVariables("plain text")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasVariables("")).toBe(false);
  });
});

describe("extractVariableNames", () => {
  it("extracts all variable names", () => {
    const names = extractVariableNames("{{A}} and {{B}}");
    expect(names).toEqual(["A", "B"]);
  });

  it("deduplicates repeated names", () => {
    const names = extractVariableNames("{{TOKEN}} {{TOKEN}}");
    expect(names).toEqual(["TOKEN"]);
  });

  it("returns empty array when no variables", () => {
    expect(extractVariableNames("no vars here")).toEqual([]);
  });

  it("trims whitespace in extracted names", () => {
    const names = extractVariableNames("{{ MY_VAR }}");
    expect(names).toEqual(["MY_VAR"]);
  });
});
