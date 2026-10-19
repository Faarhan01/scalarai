# ScalarAI — Global Styling & Design System Plan (`style.md`)

## Status: ✅ COMPLETE

This document serves as the master specification, architecture reference, and style guide for the ScalarAI application frontend. It consolidates and completes **Stage 1 (Design Tokens)**, **Stage 2 (Semantic Classes)**, and **Stage 3 (Token Adoption in JSX)**.

---

## 1. Design Constitution & Principles

| Principle | Guideline & Implementation |
| :--- | :--- |
| **Color Allocation** | **60% Deep Canvas** (`#0f172a` to `#020617`), **30% Structural Surfaces** (`#1e293b` cards & modals), **10% Accents** (brand indigo, profit emerald, loss rose, warning amber, sync cyan). |
| **Zero-Pill Discipline** | Avoid floating pill badges with mechanical clutter. Group telemetry information cleanly separated by middle dots (`·`) inside `.telemetry-strip`. |
| **Tabular Numerals** | All financial values, prices, tickets, latency, and counts must use `font-mono tabular-nums` to prevent layout jitter during live tick streaming. |
| **Elevation Hierarchy** | Strict single-depth elevation (`.card-panel` and `.card-panel-elevated`). Modals use elevated z-50 backdrops with `backdrop-filter: blur(8px)`. |
| **Typography Scale** | Primary UI prose uses `Plus Jakarta Sans` with balanced headings (`text-wrap: balance`). Code, telemetry, and metrics use `JetBrains Mono`. |
| **Touch Targets & Contrast** | Interactive buttons maintain ≥ 36px desktop / 44px mobile heights. All text meets WCAG AA contrast against slate backgrounds. |
| **Micro-Interactions** | Snappy transitions constrained to `150ms cubic-bezier(0.16, 1, 0.3, 1)`. Reduced motion queries disable animations when requested by system settings. |

---

## 2. Token Architecture (`frontend/src/tokens/`)

The design tokens are defined in TypeScript for type safety and direct import, and mirrored in Tailwind `@theme` in `globals.css`:

### Color Palette (`@tokens/colors`)
- **Brand Primary** (`#6366f1` / `#4f46e5`): Interactive buttons, focus rings, primary active states.
- **Deep Slate Canvas** (`#0f172a` -> `#020617`): Base application canvas and background.
- **Structural Surfaces** (`#1e293b` -> `#283548`): Card panels, dialogs, drawers, and headers.
- **Semantic Financial Signals**:
  - **Bullish / Profit** (`#10b981` / `#059669`): Buy orders, positive PnL, online connection dots.
  - **Bearish / Loss** (`#f43f5e` / `#e11d48`): Sell orders, negative PnL, offline indicators.
  - **Telemetry & Verification** (`#f59e0b`): Speed baseline calibration, WebRequest testing alerts.
  - **MetaTrader Sync** (`#06b6d4`): EA connection indicators, terminal telemetry.

### Spacing Scale (`@tokens/spacing`)
- Based on a 4px modular scale:
  - `spacing[1]` = 4px
  - `spacing[2]` = 8px
  - `spacing[3]` = 12px
  - `spacing[4]` = 16px
  - `spacing[6]` = 24px
  - `spacing[8]` = 32px

### Typography Scales (`@tokens/typography`)
- **Display**: Plus Jakarta Sans, font-bold, `tracking-tight`.
- **Body Prose**: Plus Jakarta Sans, text-xs to text-sm, `leading-relaxed`.
- **Data & Financial**: JetBrains Mono, `font-variant-numeric: tabular-nums`.

---

## 3. Semantic UI Utility Classes (`frontend/src/styles/components.css`)

### Cards & Panels
- `.card-panel`: Base panel with subtle border, 1rem rounded radius, and dark glass backdrop blur.
- `.card-panel-elevated`: Elevated surface for modals and active cards.
- `.card-panel-header`: Flex row with bottom hairline border.
- `.card-panel-title`: Uppercase bold label with icon gap.

### Buttons (`.btn`)
- `.btn`: Standard button base with active scale down (`scale(0.98)`) and disabled state handling.
- `.btn-primary`: Indigo brand background with glow on hover.
- `.btn-secondary`: Slate surface with hairline border.
- `.btn-success`: Emerald bullish accent for start / buy actions.
- `.btn-danger`: Rose bearish accent for stop / sell actions.
- `.btn-ghost`: Transparent button with subtle hover highlight.
- `.btn-sm`, `.btn-lg`: Modular size variations.

### Badges & Telemetry
- `.badge`: Inline monospace indicator.
- `.badge-brand`, `.badge-success`, `.badge-danger`, `.badge-warning`, `.badge-info`, `.badge-neutral`.
- `.telemetry-strip`: Subtle slate pill housing connection metrics separated by `.telemetry-divider` (`·`).

### Modals & Dialogs
- `.modal-backdrop`: Fixed overlay with slate-950/75 background and backdrop blur.
- `.modal-container`: Centered animated dialog surface with max-width constraints.
- `.modal-header`, `.modal-title`, `.modal-close-btn`, `.modal-body`, `.modal-footer`.

### Data Tables
- `.data-table-container`: Overflow-x container with scrollbars.
- `.data-table`: Full-width financial tabular layout.
- `.data-table-th`: Uppercase monospace column header with subtle border.
- `.data-table-td`: Monospace cell with vertical padding.
- `.data-table-row`: Interactive hover row with subtle background transition.

---

## 4. Reusable UI Primitives (`frontend/src/components/ui/`)

All primitives are exported cleanly via `frontend/src/components/index.ts`:

1. **`Button`**: Full prop typing, `variant`, `size`, `isLoading` with lucide spinner, left/right icon placement.
2. **`Badge`**: Variants (`brand`, `success`, `danger`, `warning`, `info`, `neutral`), `dot` indicator, optional `pulse` animation.
3. **`Card`**, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`: Standard compound components for consistent card architecture.
4. **`Modal`**, `ModalFooter`: Accessible dialog with Escape key listener, backdrop click dismiss, responsive sizes (`sm`, `md`, `lg`, `xl`).
5. **`ErrorBanner`**: User-friendly toast/banner for recoverable network & API error alerts.

---

## 5. Completed Improvements in this Revision

1. **Fixed Infinite Request Cascades**:
   - Stabilized `fetchStatus` dependencies in `App.tsx` (removed dependency on full `settings` object).
   - Memoized `useSettings` return value with `useMemo`.
   - Removed indiscriminate `onFetchStrategies` invocation on every WebSocket message in `useWebSocket.ts`.
   - Calmed `useAiStudyFeed` polling from 4s to 15s with browser tab visibility guards.
2. **Fixed WebSocket Client Tracking**:
   - Connected `store.webDashboardClients` and `store.mt5BridgeClients` in `backend/src/index.ts` so dashboard broadcasts work reliably in real-time.
3. **Fixed CORS Preview Compatibility**:
   - Dynamically mirrored incoming origins in `corsMiddleware` so that port 3000, Vite preview, and iframe wrappers never get blocked by strict origin errors.
4. **Unlocked MT5 EA WebRequests**:
   - Ensured public EA tick and market ingestion endpoints are not blocked by MCP admin Bearer tokens.
5. **Upgraded UI Components & Modals**:
   - Integrated full `Modal`, `Card`, `Badge`, and `Button` primitives.
   - Connected `TradeList` row clicks to the newly introduced interactive Trade Detail Modal in `App.tsx`.
   - Integrated `TradeFilters` into `LogsViewer.tsx`.

---

## 6. Verification Checklist

- [x] `npm run lint` (`tsc --noEmit`) passes with 0 errors.
- [x] `npm test` passes all test suites.
- [x] `npm run build` generates production bundle cleanly.
- [x] Full-stack dev server serves frontend and backend without API polling floods.
- [x] Cross-browser scrollbars and accessibility styles operational.
