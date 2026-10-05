# Style Plan — Global Styling & Design Tokens

## Current State

- Global styles live in `frontend/src/styles/index.css`
- Contains only:
  - `@import "tailwindcss"`
  - Base font families for body and mono
- No design tokens, no global CSS variables, no component-level theming
- Styling is done entirely via inline Tailwind utility classes in `App.tsx`
- No centralized color, spacing, typography, or shadow tokens

## Status: ⏳ PARTIALLY DONE

Base styles are in place, but the full token-driven design system is not yet implemented.

### Done

- `frontend/src/styles/index.css` exists with Tailwind import and base font families
- Font families are centralized: `Plus Jakarta Sans` (sans) and `JetBrains Mono` (mono)

### Not Done

- No `frontend/src/tokens/` directory
- No `globals.css` with `@theme` CSS variables
- No `components.css` with semantic component classes
- No design token files (`colors.ts`, `spacing.ts`, `typography.ts`, `shadows.ts`)
- No CSS custom properties / design tokens
- No centralized color/spacing/typography tokens
- No global CSS reset beyond Tailwind defaults
- No `globals.css` for app-wide base styles, utilities, or theme variables

## Goal

Introduce a **token-driven design system** with proper global styling so the app has:
- Consistent colors, spacing, typography, and shadows across all components
- Single source of truth for design decisions
- Easy theming and brand updates
- Clear separation between global base styles and component styles

## Proposed Structure

```
frontend/src/
├── styles/
│   ├── globals.css          # Global base, resets, tokens
│   ├── components.css       # Shared component classes
│   └── index.css            # Entry: imports globals + components
├── tokens/
│   ├── colors.ts            # Color palette
│   ├── spacing.ts           # Spacing scale
│   ├── typography.ts        # Font sizes, weights, line heights
│   └── shadows.ts           # Shadow presets
```

## Design Tokens

### Colors (`frontend/src/tokens/colors.ts`)

```ts
export const colors = {
  brand: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    // ... full slate scale
    950: '#020617',
  },
  emerald: {
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
  },
  amber: {
    400: '#fbbf24',
    500: '#f59e0b',
  },
  rose: {
    400: '#fb7185',
    500: '#f43f5e',
  },
} as const;

export type ColorScale = keyof typeof colors;
```

### Spacing (`frontend/src/tokens/spacing.ts`)

```ts
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;
```

### Typography (`frontend/src/tokens/typography.ts`)

```ts
export const typography = {
  fontFamily: {
    sans: "'Plus Jakarta Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;
```

### Shadows (`frontend/src/tokens/shadows.ts`)

```ts
export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  glow: '0 0 15px rgb(99 102 241 / 0.3)',
} as const;
```

## Global Styles (`frontend/src/styles/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Color tokens */
  --color-brand-50: #{colors.brand.50};
  --color-brand-500: #{colors.brand.500};
  --color-brand-600: #{colors.brand.600};
  /* ... */

  /* Spacing tokens */
  --spacing-1: #{spacing[1]};
  /* ... */

  /* Typography tokens */
  --font-sans: #{typography.fontFamily.sans};
  --font-mono: #{typography.fontFamily.mono};
}

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  body {
    font-family: var(--font-sans);
    background-color: theme(colors.slate.950);
    color: theme(colors.slate.100);
    line-height: var(--line-height-normal);
  }

  code, pre, .font-mono {
    font-family: var(--font-mono);
  }

  :focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: 2px;
  }
}

@layer components {
  .card {
    @apply rounded-2xl border border-slate-700/70 bg-slate-800/90 p-5 shadow-sm;
  }

  .btn-primary {
    @apply rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 transition-colors;
  }

  .badge {
    @apply inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold uppercase;
  }
}
```

## Tailwind Config Integration

Update `frontend/vite.config.ts` to inject tokens via CSS `@theme`:

```ts
// frontend/vite.config.ts
export default defineConfig({
  css: {
    postcss: './postcss.config.cjs',
  },
});
```

Create `frontend/postcss.config.cjs`:
```js
module.exports = {
  plugins: {
    '@tailwindcss/vite': {},
    autoprefixer: {},
  },
};
```

## Component Migration Strategy

Replace inline Tailwind classes with semantic classes where beneficial:

| Before | After |
|--------|-------|
| `className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 shadow-sm"` | `className="card"` |
| `className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 transition-colors"` | `className="btn-primary"` |
| `className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold uppercase"` | `className="badge"` |

Keep utility classes for one-off layout/spacing needs.

## Implementation Order

1. Create `frontend/src/tokens/` with `colors.ts`, `spacing.ts`, `typography.ts`, `shadows.ts`
2. Rewrite `frontend/src/styles/globals.css` with `@theme` tokens and `@layer base`
3. Create `frontend/src/styles/components.css` with shared component classes
4. Update `frontend/src/styles/index.css` to import globals + components
5. Update `frontend/tsconfig.json` paths to resolve `@tokens/*`
6. Gradually migrate `App.tsx` to use semantic classes
7. Add `globals.d.ts` for TypeScript CSS module support
8. Document tokens in `knowledgebase/style-guide.md`

## Benefits

- **Consistency:** Single source of truth for colors, spacing, typography
- **Maintainability:** Change brand color in one place, updates everywhere
- **Theming:** Easy to add dark/light themes or brand variations
- **Developer experience:** IDE autocomplete for tokens, fewer magic numbers
- **Performance:** CSS variables are resolved at runtime, no build penalty

## Risks & Mitigations

- **Breaking changes:** Migrate incrementally, keep Tailwind utilities as fallback
- **CSS bloat:** Use `@layer` to organize, purge unused tokens in production
- **Learning curve:** Document tokens in style guide, provide examples

## Non-Goals

- Do not migrate every single utility class to semantic classes
- Do not implement CSS modules or styled-components
- Do not add runtime theming engine yet; use CSS variables for static tokens
