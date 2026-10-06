# Database Plan — Stage 3: Legacy File Removal

## Status: ⏳ Pending

## Objective

Remove legacy JSON files after validation period.

## Remaining Items

- Delete `backend/data/backups/ai_knowledge_profile.json`
- Delete `backend/data/backups/ai_synthesized_strategy.json`
- Update `backend/src/db/migrate.ts` to skip migration if JSON files are missing
- Remove JSON read/write from `backend/src/index.ts`
- Update documentation to reference SQLite only

## Implementation Steps

1. After 2 weeks of stable SQLite operation, archive JSON files
2. Update `migrate.ts` to handle missing JSON files gracefully
3. Remove any remaining JSON file references from codebase
4. Verify all data persists correctly without JSON files

## Verification

- No JSON files remain in `backend/data/`
- Application starts and functions without JSON files
- All data accessible via SQLite only
