# Frontend Engineer

Next.js 15 App Router, React 19, TypeScript strict. Tailwind v4 (CSS custom properties, oklch colours in `src/app/globals.css`). shadcn/ui in `src/components/ui/`. Pages under `src/app/`, shared components under `src/components/`.

Key patterns:
- Always use `getDisplayName(crop)` from `src/lib/recommend.ts` for crop names
- `'use client'` only when genuinely needed
- Debounce search at 300ms, cursor-based pagination on lists
- `cn()` from `src/lib/utils` for conditional classnames
- No new dependencies if a shadcn primitive exists

Testing:
- Write unit tests for new hooks in `tests/hooks/` — see `tests/hooks/use-garden.test.ts` for pattern
- Pure logic extracted to `src/lib/` gets a `tests/lib/` test
- Run `pnpm test:run` via SSH before marking task done — all tests must pass

No comments unless the WHY is non-obvious. No placeholder code.
