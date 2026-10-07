# Frontend Design Tokens

> Detailed reference for the design token system in `frontend/src/tokens/`.

## Overview

Design tokens are centralized design constants exported as TypeScript objects. They are imported via `@tokens/*` path alias and used throughout the application.

## Token Files

### `colors.ts`

```ts
export const colors = {
  brand: { 50-900 } as const,
  slate: { 50-950 } as const,
  emerald: { 300-600 } as const,
  amber: { 400-500 } as const,
  rose: { 400-500 } as const,
  cyan: { 400-600 } as const,
} as const;

export type ColorScale = keyof typeof colors;
```

**Color scales:**
- `brand` — Indigo primary palette (50–900)
- `slate` — Neutral grays (50–950)
- `emerald` — Success/green (300, 400, 500, 600)
- `amber` — Warning/yellow (400, 500)
- `rose` — Danger/red (400, 500)
- `cyan` — Info/cyan (400, 500, 600)

Used for UI states: brand=primary, emerald=success, amber=warning, rose=danger, cyan=info, slate=neutral.

### `spacing.ts`

```ts
export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
} as const;

export type SpacingScale = keyof typeof spacing;
```

4px modular spacing scale from 0 to 16.

### `typography.ts`

```ts
export const typography = {
  fontFamily: {
    sans: "'Plus Jakarta Sans', system-ui, ...",
    mono: "'JetBrains Mono', ui-monospace, ...",
  },
  fontSize: { xs, sm, base, lg, xl, '2xl', '3xl' },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  lineHeight: { none: 1, tight: 1.25, normal: 1.5, relaxed: 1.75, loose: 2 },
  letterSpacing: { tighter, tight, normal, wide, wider, widest },
} as const;
```

**Font families:**
- `sans` — Plus Jakarta Sans (primary UI font)
- `mono` — JetBrains Mono (data, prices, code)

### `shadows.ts`

```ts
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  glow: '0 0 15px rgb(99 102 241 / 0.3)',
  glowSm: '0 0 8px rgb(99 102 241 / 0.2)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
} as const;

export type ShadowToken = keyof typeof shadows;
```

**Shadow presets:**
- `none`, `sm`, `md`, `lg`, `xl` — standard elevation
- `glow`, `glowSm` — brand-colored glow effects
- `inner` — inset shadow

### `index.ts`

```ts
export { colors, spacing, typography, shadows };
export type { ColorScale, SpacingScale, TypographyToken, ShadowToken };

export const tokens = {
  colors,
  spacing,
  typography,
  shadows,
} as const;

export default tokens;
```

Aggregates all tokens into a single `tokens` object for convenient importing.

## Usage

Tokens are imported via `@tokens/*` alias:
- `@tokens/colors` — color scales
- `@tokens/spacing` — spacing scale
- `@tokens/typography` — typography scale
- `@tokens/shadows` — shadow presets
- `@tokens` — aggregated tokens object

In CSS, tokens are exposed as CSS variables via `styles/globals.css`:
```css
:root {
  --font-sans: 'Plus Jakarta Sans', ...;
  --font-mono: 'JetBrains Mono', ...;
  /* colors mapped from tokens */
}
```
