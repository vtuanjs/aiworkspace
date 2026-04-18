---
name: commit
description: "Commit staged/unstaged changes as multiple logical commits — one per step. Triggers on: /commit, commit code, commit changes."
model: haiku
context: fork
---

## Task

Commit all pending changes as **separate commits per logical step** — never squash unrelated changes into one commit.

### Step 1 — Inspect changes

Run:
```
git status
git diff HEAD
```

Include **all** changes — tracked modifications, staged files, and untracked files. Do not skip or exclude any files or directories (including `.claude/`, generated files, or anything else). **Never assume a file or directory should not be committed** — commit everything the user has unless they explicitly say to skip it.

### Step 2 — Group changes into logical steps

Analyse the diff and group files by what they implement together. Each group becomes one commit. Infer groupings from the actual files changed — common patterns:

| Group | Pattern |
|-------|---------|
| proto + generated pb | `proto/**/*.proto`, `pkg/manabuf/**/*.pb.go`, `*_grpc.pb.go` |
| RBAC / auth | `cmd/server/*/auth.go` |
| domain / model | `*/domain/*.go` |
| usecase | `*/usecase/*.go` (non-test) |
| repository | `*/repositor*/*.go` (non-test) |
| transport / handler | `*/transport/**/*.go` (non-test) |
| mocks (generated) | `mock/**/*.go` |
| migrations / sqlc | `migrations/**/*.sql`, `**/db/*.go` |
| tests | `*_test.go` |
| config / docs / skills | `*.md`, `*.yaml`, `.claude/**` |

Rules:
- One responsibility = one commit. If two files belong to different layers, commit them separately.
- Generated files (mocks, pb, sqlc) go with the commit that required regenerating them.
- Test files go with the implementation they test (same commit).

### Step 3 — Commit each group in order

Commit from lowest-level to highest-level (e.g. proto → auth → domain → repo → usecase → transport → config/docs). Adapt the order to what layers actually changed.

For each group:

1. `git add <files in group>` — use explicit paths, include untracked files
2. `git commit -m "<prefix> <type>: <short summary>"`

**Commit message format:**
```
[TICKET-ID] <type>: <what changed in ≤72 chars>
```

Extract the ticket prefix from the current branch name (e.g. `feature/LT-98131-...` → `[LT-98131]`, `fix/PROJ-42-...` → `[PROJ-42]`). If the branch has no ticket number, omit the prefix entirely.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### Step 4 — Verify

After all commits run:
```
git log --oneline -10
git status
```

Print the final commit list so the user can review.

> **Never report "nothing to commit" based solely on `git diff HEAD`** — untracked files and new directories won't appear there. Always check `git status` for untracked files and include them.
