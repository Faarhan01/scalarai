# Style Plan — Stage 1: Design Tokens

## Status: ✅ DONE

## Objective

Create TypeScript design tokens for colors, spacing, typography, and shadows.

## Completed

### Token Files

- `frontend/src/tokens/colors.ts` — Palette: brand, slate, emerald, amber, rose, cyan
- `frontend/src/tokens/spacing.ts` — 4px modular spacing scale (0 to 16)
- `frontend/src/tokens/typography.ts` — Plus Jakarta Sans + JetBrains Mono scales
- `frontend/src/tokens/shadows.ts` — Hairline depth and radiant glow presets
- `frontend/src/tokens/index.ts` — Central token aggregator and type exports

### Token Reference

#### Color Palette (`@tokens/colors`)
- **Brand Primary** (`#6366f1`): Primary interactive states, focus rings, active navigation items.
- **Deep Slate Canvas** (`#0f172a` to `#020617`): Dominant neutral canvas (60%).
- **Structural Surfaces** (`#1e293b`): Elevated card panels and modal surfaces (30%).
- **Semantic Financial Signals** (10%):
  - **Bullish / Profit** (`#10b981`): Buy signals, positive PnL, online status.
  - **Bearish / Loss** (`#f43f5e`): Sell signals, negative PnL, offline warnings.
  - **Telemetry & Verification** (`#f59e0b`): Speed baseline study, calibration alerts.
  - **MetaTrader Sync** (`#06b6d4`): EA connection indicators, account credentials.

#### Typography Pairings (`@tokens/typography`)
- **Display & Headings**: `Plus Jakarta Sans` with `text-wrap: balance`.
- **Body Prose**: `Plus Jakarta Sans` (14px–15px) with `line-height: 1.5`.
- **Data & Financial Numerals**: `JetBrains Mono` with `font-variant-numeric: tabular-nums`.

#### Spacing Scale (`@tokens/spacing`)
- Strict 4px modular scale: `spacing[1]` = 4px, `spacing[2]` = 8px, `spacing[3]` = 12px, `spacing[4]` = 16px, `spacing[6]` = 24px, `spacing[8]` = 32px.

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- Tokens importable via `@tokens/*` alias
