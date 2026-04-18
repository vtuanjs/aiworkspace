// Single HTTP executor used by both the Send button and MCP bridge.
// Source label ("YOU" | "CLAUDE_CODE") is the only difference between the two callers.

import { invoke } from "@tauri-apps/api/core";
import { useProjectsStore } from "../store/projects";
import { useEnvironmentStore } from "../store/environment";

export const REQUEST_SOURCE = {
  YOU: "YOU",
  CLAUDE_CODE: "CLAUDE_CODE",
} as const;
export type RequestSource = typeof REQUEST_SOURCE[keyof typeof REQUEST_SOURCE];

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
}

export interface HttpLogEntry {
  id: string;
  source: RequestSource;
  request: HttpRequest;
  response: HttpResponse | null;
  error: string | null;
  timestamp: number;
}

async function resolveRequestVariables(request: HttpRequest): Promise<HttpRequest> {
  const projectsState = useProjectsStore.getState();
  const activeProjectId = projectsState.activeProjectId;
  const activeProject = activeProjectId
    ? projectsState.projects.find((p) => p.id === activeProjectId)
    : null;

  if (!activeProject) return request;

  const runtimeTokens = useEnvironmentStore.getState().getActiveRuntimeTokens();

  const resolveField = async (text: string): Promise<string> => {
    if (!text.includes("{{")) return text;
    try {
      return await invoke<string>("resolve_variables", {
        text,
        projectPath: activeProject.path,
        runtimeTokens,
      });
    } catch {
      return text;
    }
  };

  const resolvedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    resolvedHeaders[k] = await resolveField(v);
  }

  return {
    ...request,
    url: await resolveField(request.url),
    headers: resolvedHeaders,
    body: request.body !== undefined ? await resolveField(request.body) : undefined,
  };
}

export async function executeRequest(
  request: HttpRequest,
  source: RequestSource
): Promise<HttpLogEntry> {
  const resolvedRequest = await resolveRequestVariables(request);
  const start = Date.now();
  const id = crypto.randomUUID();

  try {
    const fetchOptions: RequestInit = {
      method: resolvedRequest.method,
      headers: resolvedRequest.headers,
    };

    // Only attach body for methods that support it
    const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    if (resolvedRequest.body !== undefined && methodsWithBody.has(resolvedRequest.method.toUpperCase())) {
      fetchOptions.body = resolvedRequest.body;
    }

    const response = await fetch(resolvedRequest.url, fetchOptions);
    const body = await response.text();

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      id,
      source,
      request: resolvedRequest,
      response: {
        status: response.status,
        headers,
        body,
        timeMs: Date.now() - start,
      },
      error: null,
      timestamp: Date.now(),
    };
  } catch (err) {
    return {
      id,
      source,
      request: resolvedRequest,
      response: null,
      error: String(err),
      timestamp: Date.now(),
    };
  }
}
