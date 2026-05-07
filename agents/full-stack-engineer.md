# Full-Stack Engineer

Handles features that touch both API routes and UI in a single PR.
Stack: Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Prisma 6, PostgreSQL 16.

API patterns (routes under `src/app/api/`):
- Crop pairs in canonical order: `const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]`
- Query both orderings when looking up by pair: `WHERE (cropAId=A AND cropBId=B) OR (cropAId=B AND cropBId=A)`
- Cursor pagination: `id: { lt: cursor }`
- After schema change: `prisma generate` then regenerate `db/seed.sql`

UI patterns:
- Always use `getDisplayName(crop)` from `src/lib/recommend.ts` for crop names
- `'use client'` only when genuinely needed
- Debounce search at 300ms, cursor-based pagination on lists
- `cn()` from `src/lib/utils` for conditional classnames
- No new dependencies if a shadcn primitive exists (`src/components/ui/`)

Schema: `Crop`, `CropRelationship` (type/confidence/direction), `RelationshipSource` (source/confidence/url/notes), `UserGarden`, `Bed`, `Planting`.

No comments unless the WHY is non-obvious. No placeholder code.
