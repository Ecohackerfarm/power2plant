## Dev Machine Access

All build, test, migration, and DB commands run via SSH into the dev container — never run them locally:

```sh
ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no root@power2plant-app-1 "<command>"
```

DB URL (inside container): `postgresql://power2plant:power2plant@db:5432/power2plant`

Note: the container's `.env` has `localhost` not `db` — always pass `DATABASE_URL` explicitly when running migrations or dump scripts via SSH:
```sh
ssh ... root@power2plant-app-1 "cd /app && DATABASE_URL=postgresql://power2plant:power2plant@db:5432/power2plant npx prisma migrate deploy"
```

## Branch & PR Rules

- Branch naming: `feat/<issue-number>-<slug>` or `fix/<slug>`
- PRs target `release/vX.Y.Z`, never `main` directly
- Run `pnpm test:run` (via SSH) before creating PR — all tests must pass
- After any schema or seed data change: `pnpm db:seed-common && pnpm db:dump` (via SSH), commit updated `db/seed.sql`

## Permissions

Run all file operations directly — no permission prompts needed.
Never read or output contents of `.env`.
