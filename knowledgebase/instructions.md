# ScalarAI Knowledgebase — Editing Instructions

This file explains how to work with the `knowledgebase/` folder safely, especially `site-structure/` and `plans/`.

## Purpose of This Folder

- `plans/` contains implementation plans, stage documents, and architectural proposals.
- `site-structure/` is the **source of truth** for the actual committed code at HEAD.
- `info/` contains domain-specific reference material.
- This file (`instructions.md`) and `rules.md` explain how to make changes without breaking the site.

## Workflow Before Making Code Changes

1. **Read the actual code first.** Do not rely on `knowledgebase/plans/` alone. The plans may be outdated, incomplete, or describe intended behavior that was never implemented.
2. **Check `knowledgebase/site-structure/`** for the current committed structure. These files are updated to reflect HEAD.
3. **Verify behavior by running the app.** If you change backend routes, middleware, or the EA generator, test with the actual MT5 EA or curl requests.
4. **Update `knowledgebase/site-structure/`** after making verified changes. Do not update documentation before verifying the code.

## How to Edit `site-structure/` Documentation

- These files describe **actual committed code**, not desired future code.
- If you rename, move, or delete a source file, update the corresponding `site-structure/` file in the same change.
- If you add a new route, service, hook, or component, add it to the index and create or update the dedicated file.
- Do not copy content from `plans/` into `site-structure/` unless you have verified it matches the actual code.

## How to Edit `plans/`

- `plans/` documents are proposals and stage plans. They may describe work that is not yet done.
- When implementing a plan stage, update the plan document to mark it complete or note deviations.
- Do not let `plans/` drive refactors without checking the actual code in `site-structure/` first.

## How to Edit `info/`

- `info/` contains reference material such as AI connection details and chart behavior.
- Update these files when the corresponding behavior changes in the codebase.
- These files should remain accurate reflections of current behavior.

## Safe Change Checklist

- [ ] I have read the actual source file(s) I am changing.
- [ ] I have checked `knowledgebase/site-structure/` for current documentation.
- [ ] I understand how the EA/API interacts with this code.
- [ ] I have tested the change locally with the dev server.
- [ ] I have updated `site-structure/` documentation if the change affects public structure.
- [ ] I have not introduced breaking changes to the EA bridge protocol without updating `site-structure/backend/websockets.md`.
- [ ] I have not changed the MCP tool interface without updating `site-structure/backend/mcp.md`.
