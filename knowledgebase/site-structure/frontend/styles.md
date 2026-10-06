# Frontend Styles

> Detailed reference for the CSS architecture in `frontend/src/styles/`.

## Files

### `globals.css`

Tailwind `@theme` directives, `:root` CSS variables for tokens, base reset, animations.

**Key contents:**
- `@theme` block defining custom colors, spacing, typography, shadows
- `:root` CSS variables for tokens (font families, colors)
- Base reset styles
- Animations: `fade-in`, `slide-up`, `modalScaleIn`, `shimmer`

### `components.css`

Semantic UI utility classes using `@layer components`.

**Card panels:**
- `.card-panel` — bordered, semi-transparent background, backdrop blur
- `.card-panel-elevated` — solid background, stronger shadow
- `.card-panel-header` — flex header with border bottom

**Button system:**
- `.btn` — base button with transitions
- `.btn-sm`, `.btn-lg` — size variants
- `.btn-primary` — indigo background
- `.btn-success` — emerald background
- `.btn-danger` — rose background
- `.btn-secondary` — dark with border
- `.btn-ghost` — transparent background

**Telemetry strip:**
- `.telemetry-strip` — inline flex container with border
- `.telemetry-divider` — vertical separator

**Financial signals:**
- `.pnl-positive` — emerald color, monospace, tabular nums
- `.pnl-negative` — rose color, monospace, tabular nums

**Badges:**
- `.badge` — base badge with border, uppercase, monospace
- `.badge-success` — green variant
- `.badge-danger` — red variant
- `.badge-warning` — amber variant
- `.badge-info` — indigo variant
- `.badge-neutral` — gray variant

**Data tables:**
- `.data-table-container` — overflow wrapper with border
- `.data-table` — full width table
- `.data-table-th` — header cell styling
- `.data-table-td` — data cell styling
- `.data-table-row` — hover effect

**Form controls:**
- `.input-control` — input with focus ring
- `.slider-control` — range input with accent color

**Navigation:**
- `.nav-tab-btn` — tab button with hover state
- `.nav-tab-active` — active tab with brand background

**Metrics:**
- `.metric-box` — bordered container
- `.metric-label` — uppercase label
- `.metric-val` — large monospace value

**Status indicators:**
- `.status-dot` — small circle
- `.status-dot-active` — green with glow
- `.status-dot-idle` — amber with glow
- `.status-dot-offline` — red with glow

**Modal:**
- `.modal-backdrop` — fixed overlay with blur
- `.modal-content` — centered dialog container
- `.modal-content-lg` — wider variant (max-width 48rem)
- `.modal-header`, `.modal-title`, `.modal-close-btn`
- `.modal-body` — scrollable content
- `.modal-footer` — action buttons area
- Animations: `fadeIn`, `modalScaleIn`

**Skeleton loading:**
- `.skeleton-box` — shimmer animation

**Toast notifications:**
- `.toast-banner` — fixed bottom-right notification

**Code snippets:**
- `.code-box` — monospace code block with border

### `globals.d.ts`

TypeScript module declaration for stylesheets:
```ts
declare module "*.css" {
  const content: string;
  export default content;
}
```

### `index.css`

Root stylesheet entrypoint. Imports `globals.css` and `components.css`.

## Tailwind Config

- Uses Tailwind CSS v4 with `@tailwindcss/vite` plugin
- Custom theme via `@theme` directives in `globals.css`
- Path aliases configured in `vite.config.ts`
