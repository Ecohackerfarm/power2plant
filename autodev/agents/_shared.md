## Dev Machine Access

All build, test, migration, and DB commands run via SSH into the dev container — never run them locally.

Your worktree path (same path inside container): `<WORKTREE_PATH>`
Your isolated database URL: `<DATABASE_URL>`

```sh
ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no root@power2plant-app-1 "cd <WORKTREE_PATH> && <command>"
```

Always pass `DATABASE_URL` explicitly — never rely on `.env`:
```sh
ssh ... root@power2plant-app-1 "cd <WORKTREE_PATH> && DATABASE_URL=<DATABASE_URL> <command>"
```

## Branch & PR Rules

- Branch naming: `feat/<issue-number>-<slug>` or `fix/<slug>`
- PRs target `release/vX.Y.Z`, never `main` directly
- Run `pnpm test:run` (via SSH) before creating PR — all tests must pass
- Schema changes: create migration file only — do NOT apply it yourself:
  ```sh
  ssh ... root@power2plant-app-1 "cd <WORKTREE_PATH> && DATABASE_URL=<DATABASE_URL> npx prisma migrate dev --create-only --name <descriptive-name>"
  ```
- After seed data changes only: `pnpm db:seed-common && pnpm db:dump` (via SSH), commit updated `db/seed.sql`

## GitHub CLI

`GH_TOKEN` is set in your environment — use `gh` normally for all GitHub operations (push, create PR, comment).
Never use `gh pr review --approve` or `--request-changes` — that is done by a separate reviewer account.

## Permissions

Run all file operations directly — no permission prompts needed.
Never read or output contents of `.env`.
