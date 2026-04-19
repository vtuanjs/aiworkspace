---
paths: ["**/*.ts", "**/*.tsx"]
---

# Frontend Conventions

## Component Design

- One component per file. File name matches the exported component name.
- Components only render UI and delegate logic to hooks or store actions.
- No `invoke()` calls inside components — all Tauri calls go through Zustand store actions.
- Panels are self-contained: no imports across panel boundaries.

## Hooks

- Extract non-trivial event listeners or side-effect logic into custom hooks (`useXxx`).
- Hooks live in a sibling `hooks/` directory when shared, or inline when local to one component.
- Prefer `useCallback` only when the reference stability matters (passed as a prop or used in a dep array).

## State

- Use `useWorkspaceStore.getState()` inside event handlers to read fresh state and avoid stale closures.
- Never store derived values in state — compute them inline.
- Keep `useState` local only when the value is truly component-private and never persisted.

## Types

- Co-locate types with the module that owns them; export from an `types.ts` file when shared across siblings.
- Prefer `type` over `interface` for unions and mapped types; use `interface` for object shapes that may be extended.
- Never use `any`. Use `unknown` and narrow explicitly.

## Style Objects

- Inline `style` objects are acceptable for one-off values; extract to a named constant when reused across more than one element.
- Module-level constants for repeated style fragments — never duplicate the same object literal.

## Reusability

- Extract a helper function when the same logic appears in two or more places.
- Module-level constants (e.g. menu item lists, tab configs) replace inline array/object literals in JSX.
- Drag-resize logic must use the shared `hooks/useResizeDrag.ts` utility — do not inline `mousemove`/`mouseup` listeners.
