# Style Plan — Stage 3: Token Adoption in JSX

## Status: ⏳ Pending

## Objective

Gradually migrate component JSX from inline Tailwind utilities to semantic design-token classes.

## Current State

Components still use inline Tailwind utilities. Design tokens and semantic classes exist but are not yet fully adopted in JSX.

## Implementation Steps

1. Audit components for repeated utility patterns
2. Add missing semantic classes to `components.css`
3. Migrate highest-traffic components first:
   - `Header.tsx`
   - `TradePanel.tsx`
   - `PriceChart.tsx`
4. Continue with remaining components

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- Visual regression testing passes
- No inline Tailwind classes remain in migrated components
