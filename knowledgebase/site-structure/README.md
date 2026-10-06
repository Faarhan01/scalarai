# Site Structure

Canonical documentation of the actual file layout for backend and frontend.

These files are the **source of truth** for where code lives. If you are refactoring, adding features, or fixing bugs, consult these files first rather than inferring structure from older plan documents.

## Files

- `backend/index.md` — actual `backend/src/` layout, exports, state container, auth behavior, and dependency graph
- `frontend/index.md` — actual `frontend/src/` layout, hooks, components, services, tokens, and dependency graph

## Why This Exists

Previous refactors got confused because plan files (`knowledgebase/plans/backend/stage-*.md`) described target architectures that diverged from the actual committed code. When the AI saw plan files mentioning files like `backend/src/services/app-state.ts`, it tried to work with that shape even though the codebase had already moved to an `AppStore` class and deleted that intermediate file.

**Rule:** When in doubt, read `site-structure/` first, then read the actual file.
