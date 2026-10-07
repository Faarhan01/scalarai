# Frontend Components

> Detailed reference for all presentational components in `frontend/src/components/`.

## Barrel Exports

`components/index.ts` exports all components organized by category:

```ts
// UI primitives
export { Button } from "./ui/Button";
export { Badge } from "./ui/Badge";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/Card";
export { Modal, ModalFooter } from "./ui/Modal";
export { ErrorBanner } from "./ui/ErrorBanner";

// Layout
export { Header } from "./layout/Header";
export { MobileDrawer } from "./layout/MobileDrawer";
export { StatusBar } from "./layout/StatusBar";
export { TabBar } from "./layout/TabBar";
export { AppShell } from "./layout/AppShell";

// Dashboard
export { TradePanel } from "./dashboard/TradePanel";
export { PriceChart } from "./dashboard/PriceChart";
export { StatsCards } from "./dashboard/StatsCards";

// Charts
export { CandlestickChart } from "./charts/CandlestickChart";
export { TelemetryStream } from "./charts/TelemetryStream";

// Trades
export { TradeList } from "./trades/TradeList";
export { TradeRow } from "./trades/TradeRow";
export { TradeFilters } from "./trades/TradeFilters";

// AI
export { AiStudyFeed } from "./ai/AiStudyFeed";
export { StrategyPanel } from "./ai/StrategyPanel";
export { KnowledgeBase } from "./ai/KnowledgeBase";

// Settings
export { SettingsForm } from "./settings/SettingsForm";
export { AssetSelector } from "./settings/AssetSelector";
export { WebRequestTest } from "./settings/WebRequestTest";

// Downloads & Logs
export { DownloadsCenter } from "./downloads/DownloadsCenter";
export { LogsViewer } from "./logs/LogsViewer";
```

## Component Catalog

### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| `AppShell` | `layout/AppShell.tsx` | Root layout wrapper with ErrorBoundary |
| `Header` | `layout/Header.tsx` | Top navigation bar with symbol switcher, status indicators, trading toggle |
| `MobileDrawer` | `layout/MobileDrawer.tsx` | Responsive side menu for mobile |
| `StatusBar` | `layout/StatusBar.tsx` | Footer with latency, elapsed time, active symbol |
| `TabBar` | `layout/TabBar.tsx` | Bottom tab navigation |

### Dashboard Components

| Component | File | Purpose |
|-----------|------|---------|
| `PriceChart` | `dashboard/PriceChart.tsx` | Main candlestick chart with EMA/Bollinger overlays |
| `StatsCards` | `dashboard/StatsCards.tsx` | Summary statistics (profit, win rate, trades, active positions) |
| `TradePanel` | `dashboard/TradePanel.tsx` | Trading controls + strategy selector |

### Chart Components

| Component | File | Purpose |
|-----------|------|---------|
| `CandlestickChart` | `charts/CandlestickChart/` | Lightweight-charts candlestick renderer (directory) |
| `TelemetryStream` | `charts/TelemetryStream.tsx` | Live telemetry chart |

`CandlestickChart/` contains:
- `CandlestickChart.tsx` — main component (197 lines)
- `types.ts` — TypeScript interfaces
- `constants.ts` — chart constants
- `index.ts` — barrel export

### Trade Components

| Component | File | Purpose |
|-----------|------|---------|
| `TradeList` | `trades/TradeList.tsx` | Trade list container |
| `TradeRow` | `trades/TradeRow.tsx` | Single trade row |
| `TradeFilters` | `trades/TradeFilters.tsx` | Trade list filters |

### AI Components

| Component | File | Purpose |
|-----------|------|---------|
| `AiStudyFeed` | `ai/AiStudyFeed.tsx` | AI calibration status banner |
| `StrategyPanel` | `ai/StrategyPanel.tsx` | AI strategy visualization |
| `KnowledgeBase` | `ai/KnowledgeBase.tsx` | Knowledge base viewer |

### Settings Components

| Component | File | Purpose |
|-----------|------|---------|
| `SettingsForm` | `settings/SettingsForm.tsx` | Strategy/lot/TP/SL configuration + WebRequest test |
| `AssetSelector` | `settings/AssetSelector.tsx` | Symbol/asset selection |
| `WebRequestTest` | `settings/WebRequestTest.tsx` | WebRequest verification UI |

### Download & Log Components

| Component | File | Purpose |
|-----------|------|---------|
| `DownloadsCenter` | `downloads/DownloadsCenter.tsx` | EA download, bridge download, template download |
| `LogsViewer` | `logs/LogsViewer.tsx` | System log viewer with level filter |

### UI Primitives

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `ui/Button.tsx` | Button component |
| `Badge` | `ui/Badge.tsx` | Status badge (variants: brand, primary, secondary, etc.) |
| `Card` | `ui/Card.tsx` | Card container (variants: default, elevated, subtle) |
| `Modal` | `ui/Modal.tsx` | Modal dialog (sizes: sm, md, lg, xl) |
| `ErrorBanner` | `ui/ErrorBanner.tsx` | Error display banner |
