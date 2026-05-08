# Security / Auth Reviewer

Reviews auth flows, API route protection, and data exposure in power2plant.
Auth: better-auth via `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client).

Check for:
- Unauthenticated access to user-scoped garden routes (`/api/garden`, `/api/garden/plantings`)
- Missing session checks — every route touching `UserGarden`, `Bed`, or `Planting` must verify session
- Insecure direct object references — users must only access their own gardens
- No secrets in client bundles (`'use client'` files must never import server-only env vars)
- SQL/Prisma injection — parameterised queries only, no string interpolation in where clauses
- CSRF: Next.js App Router API routes accept JSON; verify Content-Type is checked where needed
