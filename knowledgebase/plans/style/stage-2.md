# Style Plan — Stage 2: Semantic Classes

## Status: ✅ DONE

## Objective

Create semantic CSS classes in `components.css` and integrate with Tailwind `@theme`.

## Completed

### Global CSS

- `frontend/src/styles/globals.css` — Tailwind `@theme` tokens, `:root` variables, base reset, animations
- `frontend/src/styles/components.css` — Semantic UI utility classes
- `frontend/src/styles/globals.d.ts` — TypeScript module declaration for stylesheets
- `frontend/src/styles/index.css` — Root stylesheet entrypoint

### CSS Custom Properties (`:root`)

```css
:root {
  --bg-primary: #0f172a;
  --bg-surface: #1e293b;
  --bg-elevated: #283548;
  --bg-subtle: #020617;
  --border-hairline: rgba(51, 65, 85, 0.7);
  --border-strong: rgba(71, 85, 105, 0.85);
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --accent-brand: #6366f1;
  --accent-bullish: #10b981;
  --accent-bearish: #f43f5e;
  --accent-warning: #f59e0b;
  --accent-info: #06b6d4;
}
```

### Semantic UI Class Library

#### Cards & Panels
- `.card-panel`, `.card-panel-elevated`, `.card-panel-header`, `.card-panel-title`

#### Buttons
- `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`

#### Badges & Telemetry
- `.badge`, `.badge-success`, `.badge-danger`, `.badge-warning`, `.badge-info`, `.badge-neutral`
- `.telemetry-strip`, `.telemetry-divider`

#### Data Tables
- `.data-table-container`, `.data-table`, `.data-table-th`, `.data-table-td`, `.data-table-row`
- `.pnl-positive`, `.pnl-negative`

#### Forms
- `.input-control`, `.slider-control`, `.nav-tab-btn`, `.nav-tab-active`
- `.metric-box`, `.metric-val`

## Critical Fragility Warnings

### SEMANTIC CLASSES ARE COUPLED TO COMPONENTS

1. **Class names are used in multiple components**: `.card-panel`, `.btn`, `.badge`, `.data-table`, etc. are used across many components. Renaming or removing any class breaks multiple components.

2. **`globals.css` must be imported**: `frontend/src/styles/index.css` imports `globals.css` and `components.css`. If you split or rename these files, update the import chain.

3. **Tailwind `@theme` must match CSS variables**: The `@theme` block in `globals.css` defines custom colors, spacing, typography, shadows. These must match the values in `frontend/src/tokens/`. Inconsistency causes visual bugs.

## Design Constitution

| Principle | Implementation |
| :--- | :--- |
| **Zero-Pill Discipline** | Clean text separated by `·` rather than bulky pill clusters. |
| **Tabular Numerals** | All financial values use `font-mono tabular-nums`. |
| **No Pseudo-Technical Clutter** | Removed mechanical prefixes and fake version badges. |
| **Single Elevation Depth** | Strict single-level card elevation. |
| **Color Allocation** | 60% Canvas, 30% Structural Surfaces, 10% Accents. |
| **Touch Targets & Contrast** | Buttons ≥ 36px desktop / 44px mobile; WCAG AA maintained. |
| **Micro-Interactions** | Smooth cubic-bezier easing ≤ 150ms. |

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- All components using semantic classes render correctly
