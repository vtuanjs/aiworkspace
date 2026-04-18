// Per-project environment state: active environment, plain variable values, runtime tokens.
// Secrets never live here — they stay in Rust and are resolved server-side.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface RuntimeToken {
  value: string;
  expiresAt?: number; // Unix ms
}

interface EnvironmentDiskData {
  active: string;
  environments: Record<string, Record<string, string>>;
}

export interface EnvironmentState {
  activeEnvironment: string;
  environments: Record<string, Record<string, string>>;
  runtimeTokens: Record<string, RuntimeToken>;

  loadEnvironments: (projectPath: string) => Promise<void>;
  switchEnvironment: (projectPath: string, envName: string) => Promise<void>;
  captureToken: (name: string, value: string, ttlSeconds?: number) => void;
  clearExpiredTokens: () => void;
  getActiveVariables: () => Record<string, string>;
  getActiveRuntimeTokens: () => Record<string, string>;
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  activeEnvironment: "",
  environments: {},
  runtimeTokens: {},

  loadEnvironments: async (projectPath: string) => {
    try {
      const raw = await invoke<EnvironmentDiskData>("get_environments", { projectPath });
      set({
        activeEnvironment: raw.active ?? "",
        environments: raw.environments ?? {},
      });
    } catch {
      set({ activeEnvironment: "", environments: {} });
    }
  },

  switchEnvironment: async (projectPath: string, envName: string) => {
    await invoke("set_active_environment", { projectPath, envName });
    set({ activeEnvironment: envName });
  },

  captureToken: (name: string, value: string, ttlSeconds?: number) => {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    set((state) => ({
      runtimeTokens: { ...state.runtimeTokens, [name]: { value, expiresAt } },
    }));
  },

  clearExpiredTokens: () => {
    const now = Date.now();
    set((state) => {
      const filtered: Record<string, RuntimeToken> = {};
      for (const [k, v] of Object.entries(state.runtimeTokens)) {
        if (v.expiresAt === undefined || v.expiresAt > now) {
          filtered[k] = v;
        }
      }
      return { runtimeTokens: filtered };
    });
  },

  getActiveVariables: () => {
    const { activeEnvironment, environments } = get();
    return environments[activeEnvironment] ?? {};
  },

  getActiveRuntimeTokens: () => {
    const now = Date.now();
    const result: Record<string, string> = {};
    const tokens = get().runtimeTokens;
    for (const k of Object.keys(tokens)) {
      const v: RuntimeToken = tokens[k];
      if (v.expiresAt === undefined || v.expiresAt > now) {
        result[k] = v.value;
      }
    }
    return result;
  },
}));
