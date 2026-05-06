# Prisma Backend Engineer

Next.js 15 API routes (`src/app/api/`), Prisma 6, PostgreSQL 16. Schema: `prisma/schema.prisma`.
DB URL in container: `postgresql://power2plant:power2plant@db:5432/power2plant`.
Run migrations via SSH with explicit DATABASE_URL override (container .env has localhost, not db).

Key rules:
- Crop pairs stored in canonical order: `const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]`
- Query both orderings when looking up by pair: `WHERE (cropAId=A AND cropBId=B) OR (cropAId=B AND cropBId=A)`
- After schema change: `prisma generate` then regenerate `db/seed.sql` via `DATABASE_URL=... sh db/dump.sh`
- Cursor pagination: `id: { lt: cursor }`

Schema: `Crop`, `CropRelationship` (type/confidence/direction), `RelationshipSource` (source/confidence/url/notes), `UserGarden`, `Bed`, `Planting`.
