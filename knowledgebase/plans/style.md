# Style Plan — Global Styling & Design Tokens

## Executive Overview

The styling system has been elevated from fragmented inline utility classes to a **production-grade, token-driven design system**. It combines TypeScript design tokens, Tailwind CSS v4 `@theme` integration, CSS custom properties, and semantic UI classes.

### Status: ✅ FULLY IMPLEMENTED & OPERATIONAL

All 8 planned implementation steps are complete, tested, and actively utilized throughout every component in the application.

---

## 1. Directory & File Architecture

```
frontend/
├── src/
│   ├── tokens/
│   │   ├── colors.ts            # Palette: brand, slate, emerald, amber, rose, cyan
│   │   ├── spacing.ts           # 4px modular spacing scale (0 to 16)
│   │   ├── typography.ts        # Plus Jakarta Sans + JetBrains Mono scales
│   │   ├── shadows.ts           # Hairline depth and radiant glow presets
│   │   └── index.ts             # Central token aggregator and type exports
│   │
│   ├── styles/
│   │   ├── globals.css          # Tailwind @theme, :root variables, base reset, animations
│   │   ├── components.css       # Semantic UI utility classes
│   │   ├── globals.d.ts         # TypeScript module declaration for stylesheets
│   │   └── index.css            # Root stylesheet entrypoint
│   │
│   ├── tsconfig.json            # Path aliases: @tokens/* and @styles/*
│   └── vite.config.ts           # Bundler resolution aliases: @tokens and @styles
```

---

## 2. Design Tokens Reference

### A. Color Palette (`@tokens/colors`)
- **Brand Primary (`#6366f1` / `indigo-500`)**: Primary interactive states, focus rings, active navigation items.
- **Deep Slate Canvas (`#0f172a` to `#020617`)**: Dominant neutral canvas (60%) providing high contrast with zero visual fatigue.
- **Structural Surfaces (`#1e293b` / `slate-800`)**: Elevated card panels and modal surfaces (30%).
- **Semantic Financial Signals (10%)**:
  - **Bullish / Profit (`#10b981` / `emerald-500`)**: Buy signals, positive PnL, online status indicators.
  - **Bearish / Loss (`#f43f5e` / `rose-500`)**: Sell signals, negative PnL, offline warnings, liquidation buttons.
  - **Telemetry & Verification (`#f59e0b` / `amber-500`)**: Speed baseline study, calibration alerts, poll mode.
  - **MetaTrader Sync (`#06b6d4` / `cyan-500`)**: EA connection indicators, account credentials.

### B. Typography Pairings (`@tokens/typography`)
- **Display & Headings**: `Plus Jakarta Sans` with `text-wrap: balance` and tight letter spacing (`-0.015em`).
- **Body Prose**: `Plus Jakarta Sans` (14px–15px) with `line-height: 1.5` and optical dark compensation (`letter-spacing: 0.01em`).
- **Data, Code & Financial Numerals**: `JetBrains Mono` with mandatory `font-variant-numeric: tabular-nums` for rock-solid vertical decimal alignment across tables and charts.

### C. Spacing Scale (`@tokens/spacing`)
- Strict 4px modular scale (`spacing[1]` = 4px, `spacing[2]` = 8px, `spacing[3]` = 12px, `spacing[4]` = 16px, `spacing[6]` = 24px, `spacing[8]` = 32px).
- Button padding follows the $2\times$ horizontal ratio rule (`py-2 px-3.5` or `py-2.5 px-4`).

---

## 3. Global CSS Custom Properties (`:root`)

Defined in `frontend/src/styles/globals.css`:

```css
:root {
  /* Surfaces */
  --bg-primary: #0f172a;
  --bg-surface: #1e293b;
  --bg-elevated: #283548;
  --bg-subtle: #020617;
  --border-hairline: rgba(51, 65, 85, 0.7);
  --border-strong: rgba(71, 85, 105, 0.85);

  /* Typography */
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-faint: #64748b;

  /* Trading Accents */
  --accent-brand: #6366f1;
  --accent-bullish: #10b981;
  --accent-bearish: #f43f5e;
  --accent-warning: #f59e0b;
  --accent-info: #06b6d4;

  /* Motion & Easing */
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --transition-fast: 150ms var(--ease-smooth);
}
```

---

## 4. Semantic UI Class Library

Defined in `frontend/src/styles/components.css`:

### Cards & Panels
- `.card-panel`: Base rounded surface (`rounded-2xl`, hairline border, dark slate backdrop with blur).
- `.card-panel-elevated`: High-priority modal or floating dialog surface with elevated shadow.
- `.card-panel-header`: Standardized panel top bar with hairline divider and flex alignment.
- `.card-panel-title`: Uppercase bold label with subtle tracking and domain iconography.

### Buttons & Interactive Controls
- `.btn`: Standard uppercase button with smooth settling curve (`cubic-bezier(0.16, 1, 0.3, 1)`) and active scale feedback (`:active { transform: scale(0.98); }`).
- `.btn-primary`: Indigo accent for primary actions with subtle glow.
- `.btn-success`: Emerald accent for trade starting and positive triggers.
- `.btn-danger`: Rose accent for stop and liquidation triggers.
- `.btn-secondary`: Dark slate background with hairline border for auxiliary actions.
- `.btn-ghost`: Transparent background for lightweight interactions.
- `.btn-sm`: Compact button for table rows and header toolbars.

### Zero-Pill Telemetry & Badges
- `.telemetry-strip`: Unboxed monospace metadata container with hairline border.
- `.telemetry-divider`: Subtle middle-dot separator (`·`) preventing pill-clutter.
- `.badge`: Crisp rectangular tag with mono text and soft semantic tint (`.badge-success`, `.badge-danger`, `.badge-warning`, `.badge-info`, `.badge-neutral`).

### Data Tables & Financial Elements
- `.data-table-container`: Responsive scroll container with hairline rounded border.
- `.data-table`: Collapse-bordered financial table.
- `.data-table-th`: Compact uppercase column headers with muted contrast.
- `.data-table-td`: Monospace table cells with tabular numerals (`tabular-nums`).
- `.data-table-row`: Hover highlight row transition.
- `.pnl-positive`: High-contrast green tabular profit text.
- `.pnl-negative`: High-contrast red tabular loss text.

### Form Inputs & Sliders
- `.input-control`: Dark slate input with crisp focus-ring using `--accent-brand`.
- `.slider-control`: Smooth 6px track with brand accent thumb.
- `.nav-tab-btn` & `.nav-tab-active`: Segmented navigation button with active state elevation.
- `.metric-box` & `.metric-val`: Metric statistic display cards with bold mono numbers.

---

## 5. Design Constitution Compliance

| Principle | Implementation in Codebase |
| :--- | :--- |
| **Zero-Pill Discipline** | Header telemetry uses clean text separated by `·` rather than bulky pill clusters. |
| **Tabular Numerals** | All financial values, tick counts, pips, and prices use `font-mono tabular-nums`. |
| **No Pseudo-Technical Clutter** | Removed mechanical prefixes (`//`, `>_`) and fake version badges (`v1.20-Production`). |
| **Single Elevation Depth** | Strict single-level card elevation to prevent messy "cards within cards" nesting. |
| **Color Allocation** | 60% Canvas (`#0f172a`), 30% Structural Surfaces (`#1e293b`), 10% Accents (`#6366f1` / `#10b981`). |
| **Touch Targets & Contrast** | All buttons $\ge 36\text{px}$ desktop / $44\text{px}$ mobile; WCAG AA text contrast maintained. |
| **Micro-Interactions** | Routines use smooth cubic-bezier easing $\le 150\text{ms}$ with compositor-only properties. |

---

## 6. Component Migration Map

All primary frontend components are aligned with the styling system:
- `frontend/src/components/layout/Header.tsx` — Uses `.telemetry-strip`, `.telemetry-divider`, `.btn-sm`, `.btn-success`, `.btn-danger`.
- `frontend/src/components/layout/StatusBar.tsx` — Real-time telemetry footer with clean status dots and tabular numerals.
- `frontend/src/components/layout/MobileDrawer.tsx` — Uses `.card-panel`, `.badge`, `.btn-success`, `.btn-danger`.
- `frontend/src/components/dashboard/StatsCards.tsx` — Uses `.card-panel`, `.card-panel-header`, `.card-panel-title`, `.metric-box`, `.metric-val`.
- `frontend/src/components/dashboard/TradePanel.tsx` — Uses `.card-panel`, `.btn-success`, `.btn-danger`.
- `frontend/src/components/dashboard/PriceChart.tsx` — Uses `.card-panel`, `.btn-primary`, `.btn-secondary`, `.btn-sm`, and design token colors in `CandlestickChart.tsx`.
- `frontend/src/components/trades/TradeList.tsx` & `TradeRow.tsx` — Uses `.card-panel`, `.data-table-container`, `.data-table`, `.data-table-th`, `.data-table-td`, `.data-table-row`, `.badge`.
- `frontend/src/components/ai/AiStudyFeed.tsx` & `TelemetryStream.tsx` — Uses `.card-panel`, `.badge-warning`, `.badge-info`.
- `frontend/src/components/ai/StrategyPanel.tsx` & `KnowledgeBase.tsx` — Uses `.card-panel`, `.card-panel-header`, `.badge`.
- `frontend/src/components/settings/SettingsForm.tsx` & `AssetSelector.tsx` — Uses `.card-panel`, `.input-control`, `.slider-control`, `.btn-primary`.
- `frontend/src/components/downloads/DownloadsCenter.tsx` — Uses `.card-panel`, `.btn-primary`, `.btn-success`, `.btn-secondary`.
- `frontend/src/components/logs/LogsViewer.tsx` — Uses `.card-panel`, `.card-panel-header`, `.card-panel-title`.
