# Code Conventions

## Status and Enum Values

All status values and enum-like strings must be defined as named constants — never use inline string literals.

- Use UPPER_SNAKE_CASE for constant names.
- Group related constants in a dedicated constants file (e.g., `constants/status.ts`).

```typescript
// CORRECT
export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  INACTIVE: "INACTIVE",
} as const;
type UserStatus = typeof USER_STATUS[keyof typeof USER_STATUS];

// WRONG
user.status = "active";
if (user.status === "pending") { ... }
```

## Maintainability

- Every function does one thing. If the name needs "and", split it.
- Prefer pure functions; isolate side effects at the edges.
- Magic numbers or strings belong in named constants.
- Avoid deeply nested logic — extract helpers or early-return instead.

## Testing

- Every non-trivial function or module must have a corresponding test file.
- Test files live next to the source: `foo.ts` → `foo.test.ts`.
- Tests must cover: the happy path, at least one error/edge case, and all status constant branches.
- Do not ship a feature without its tests passing.
