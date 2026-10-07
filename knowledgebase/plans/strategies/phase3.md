# Strategies Plan — Phase 3: AI-Driven Strategy Creation

## Status: ❌ NOT DONE

## What Exists

- AI can synthesize strategy rules from knowledge base (`aiSynthesizedStrategy`)
- Strategy templates exist in code (`strategy-templates.ts`) and database (`strategy_templates` table)
- Observations are stored in `observations` table via `ObservationsService`
- MCP tools `list_strategy_templates` and `create_strategy_from_template` exist

## What's Missing

- No `strategy-generator.ts` service
- No automated rule generation from observations
- No `create_strategy_from_observations` MCP tool
- No observation-to-rule mapping logic
- No strategy validation before saving

## Implementation Steps

1. Create `backend/src/services/strategy-generator.ts`
2. Implement observation-to-rule mapping
3. Add strategy validation before save
4. Add `create_strategy_from_observations` MCP tool
5. Update `McpContext` with new methods

## Critical Fragility Warnings

1. **Generated strategies must be valid** — invalid rules break trade execution
2. **Validation must run before saving** — bad strategies should not enter production
3. **Human review required** — AI-generated strategies need approval before activation

## Verification

- AI can create strategy from observations via MCP
- Generated strategy passes validation
- Strategy can be activated and traded
- Performance tracked in `strategy_symbol_performance`
