## Dev Machine Access

All build, test, migration, and DB commands run via SSH into the dev container — never run them locally.

Your worktree path (same path inside container): `<WORKTREE_PATH>`

```sh
ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no root@power2plant-app-1 "cd <WORKTREE_PATH> && <command>"
```

DB URL (inside container): `postgresql://power2plant:power2plant@db:5432/power2plant`

Note: the container's `.env` has `localhost` not `db` — always pass `DATABASE_URL` explicitly for migrations or dump scripts:
```sh
ssh ... root@power2plant-app-1 "cd <WORKTREE_PATH> && DATABASE_URL=postgresql://power2plant:power2plant@db:5432/power2plant npx prisma migrate deploy"
```

## Branch & PR Rules

- Branch naming: `feat/<issue-number>-<slug>` or `fix/<slug>`
- PRs target `release/vX.Y.Z`, never `main` directly
- Run `pnpm test:run` (via SSH) before creating PR — all tests must pass
- After any schema or seed data change: `pnpm db:seed-common && pnpm db:dump` (via SSH), commit updated `db/seed.sql`
- Schema changes: create migration file only — do NOT run `migrate deploy` or `migrate dev` without `--create-only`:
  ```sh
  ssh ... root@power2plant-app-1 "cd <WORKTREE_PATH> && DATABASE_URL=postgresql://power2plant:power2plant@db:5432/power2plant npx prisma migrate dev --create-only --name <descriptive-name>"
  ```

## Permissions

Run all file operations directly — no permission prompts needed.
Never read or output contents of `.env`.
