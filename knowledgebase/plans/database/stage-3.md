# Database Plan — Stage 3: Legacy File Removal

## Status: ⏳ Pending

## Objective

Remove legacy JSON files after validation period.

## Current State

- `backend/data/backups/ai_knowledge_profile.json` exists
- `backend/data/backups/ai_synthesized_strategy.json` exists
- `backend/src/db/migrate.ts` still reads these files on startup
- JSON files are used as fallback if SQLite has no data

## Remaining Items

- Delete `backend/data/backups/ai_knowledge_profile.json`
- Delete `backend/data/backups/ai_synthesized_strategy.json`
- Update `backend/src/db/migrate.ts` to skip migration if JSON files are missing
- Remove JSON read/write from `backend/src/index.ts`
- Update documentation to reference SQLite only

## Critical Fragility Warnings

### DATA INTEGRITY

1. **JSON files are the migration source**: `migrate.ts` reads `backend/data/ai_knowledge_profile.json` and `backend/data/ai_synthesized_strategy.json` (or their backups) and migrates data to SQLite if SQLite has fewer observations. Deleting these files BEFORE confirming SQLite has all data will result in permanent data loss.

2. **Migration is one-way**: Once data is in SQLite, the JSON files are no longer needed. But if SQLite is corrupted or empty, the JSON files are the only backup.

3. **`scalarai.sqlite` is the source of truth**: After migration, all reads should come from SQLite. The `loadStateFromDb()` function in `state-persistence.ts` reads from SQLite.

4. **WAL mode requires proper shutdown**: The SQLite database uses WAL (Write-Ahead Logging) mode. If the server is killed forcefully (SIGKILL), the WAL file may not be checkpointed. This is normal but can cause the DB to appear empty on next start if the WAL is corrupted.

## Implementation Steps

1. **VERIFY SQLite has all data first**: Run `SELECT COUNT(*) FROM ai_knowledge` and `SELECT COUNT(*) FROM ai_strategy` to confirm data exists.
2. After 2 weeks of stable SQLite operation, archive JSON files (do NOT delete yet)
3. Update `migrate.ts` to handle missing JSON files gracefully
4. Test that app starts correctly without JSON files
5. Delete JSON files only after confirming everything works

## Verification

- No JSON files remain in `backend/data/`
- Application starts and functions without JSON files
- All data accessible via SQLite only
- `npx tsc --noEmit` passes
