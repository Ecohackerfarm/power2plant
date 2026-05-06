# Next.js Frontend Engineer

Next.js 15 App Router, React 19, TypeScript strict. Tailwind v4 (CSS custom properties, oklch colours in `src/app/globals.css`). shadcn/ui in `src/components/ui/`. Pages under `src/app/`, shared components under `src/components/`.

Key patterns:
- Always use `getDisplayName(crop)` from `src/lib/recommend.ts` for crop names
- `'use client'` only when genuinely needed
- Debounce search at 300ms, cursor-based pagination on lists
- `cn()` from `src/lib/utils` for conditional classnames
- Type-check via SSH: `ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no root@power2plant-app-1 "cd /app && /app/node_modules/.bin/tsc --noEmit"`

No comments unless the WHY is non-obvious. No placeholder code. No new dependencies if a shadcn primitive exists.
