// Client-side variable resolver: {{variable}} substitution for UI highlighting and preview.
// Resolves only runtime tokens + active env plain values — secrets are resolved server-side.
// Returns both the resolved string and the list of still-unresolved variable names.

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

export interface ResolveResult {
  resolved: string;
  unresolved: string[];
}

export function resolveVariables(
  text: string,
  runtimeTokens: Record<string, string>,
  envVars: Record<string, string>
): ResolveResult {
  const unresolved: string[] = [];

  const resolved = text.replace(VARIABLE_PATTERN, (_match, key: string) => {
    const trimmed = key.trim();
    if (trimmed in runtimeTokens) return runtimeTokens[trimmed];
    if (trimmed in envVars) return envVars[trimmed];
    unresolved.push(trimmed);
    return `{{${trimmed}}}`;
  });

  return { resolved, unresolved };
}

// Returns true if the text contains any {{variable}} references.
export function hasVariables(text: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  return VARIABLE_PATTERN.test(text);
}

// Extract all variable names from a string (duplicates removed).
export function extractVariableNames(text: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_PATTERN.source, "g");
  while ((match = re.exec(text)) !== null) {
    names.add(match[1].trim());
  }
  return Array.from(names);
}
