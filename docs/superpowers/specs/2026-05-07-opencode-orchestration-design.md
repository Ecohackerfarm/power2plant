# OpenCode Orchestration Design

**Date:** 2026-05-07  
**Status:** Implemented

## Problem

power2plant had agent role definitions and a single-shot `run-agent` script but no orchestration layer. Running multiple agents in parallel, retrying on failure, rotating free models, and tracking progress required a structured system.

## Goals

- Claude Code acts as planner: reads GitHub issues, writes `orchestrate/tasks.json`
- Multiple opencode agents work in parallel, each in an isolated git worktree
- Free models rotate on failure; configurable list in one file (`orchestrate/models.json`)
- Logs are inspectable; status visible at any time (`pnpm orchestrate:status`)
- Portable: orchestrator may be extracted from the project later

## Architecture

```
AGENT MACHINE (this machine)
┌─────────────────────────────────────────────────────┐
│  Claude Code (planner) ──tasks.json──> Orchestrator │
│                                        scripts/      │
│                                        orchestrate/  │
│                          Worker Pool (max N parallel)│
│                          opencode run per worktree   │
└───────────────────────────────┬─────────────────────┘
                    SSH port 2222│
DEV CONTAINER (power2plant-app-1)
┌───────────────────────────────┴─────────────────────┐
│  prisma generate / migrate                          │
│  pnpm build / test / db:dump                        │
└─────────────────────────────────────────────────────┘
```

Claude Code is the **only planner**. Free models implement only.  
Workers SSH into the dev container for all build/test/migration actions.

## File Structure

```
agents/
  _shared.md                    SSH, DB URL, branch rules, CI — injected into every agent
  backend-engineer.md
  frontend-engineer.md
  full-stack-engineer.md        cross-cutting API + UI tasks
  garden-algorithm-engineer.md
  plant-data-curator.md
  qa-test-reviewer.md
  security-auth-reviewer.md

scripts/orchestrate/
  index.ts        entry: schedule + CLI dispatch
  planner.ts      reads tasks.json, resolves roles
  worker.ts       spawns opencode, streams logs, retry logic
  state.ts        reads/writes state.json
  worktree.ts     git worktree create/cleanup
  models.ts       loads + rotates models.json

orchestrate/
  tasks.json      written by Claude; read by orchestrator
  models.json     ordered free model list; edit to swap
  state.json      runtime state; gitignored

logs/
  <issue-id>/attempt-N.log
```

## Configuration

`orchestrate/models.json` — edit to swap free models:
```json
{
  "default": ["openrouter/tencent/hunyuan-a13b-instruct:free", ...],
  "maxRetries": 3,
  "timeoutMinutes": 20,
  "maxParallel": 3,
  "schedule": "0 */6 * * *"
}
```

`orchestrate/tasks.json` — Claude writes before each run:
```json
[{ "issueNumber": 41, "title": "...", "role": "backend-engineer", "branch": "feat/41-slug" }]
```

## Worker Lifecycle

1. `git worktree add .worktrees/<branch> -b <branch>`
2. `opencode run --model <model> --dangerously-skip-permissions --dir <worktree> "<shared+role+issue>"`
3. stdout/stderr → `logs/<issue>/attempt-N.log`
4. exit 0 → QA gate (qa-test-reviewer in same worktree)
5. auth-touching? → security gate (security-auth-reviewer)
6. pass → `gh pr create --base release/...` → cleanup worktree
7. fail / timeout → retry with next model; after maxRetries → FAILED, worktree preserved

## Agent Roles

| Role | Trigger |
|---|---|
| `backend-engineer` | API/schema/migration tasks |
| `frontend-engineer` | UI/component tasks |
| `full-stack-engineer` | Tasks touching both API and UI |
| `garden-algorithm-engineer` | Recommendation/layout tasks |
| `plant-data-curator` | Data pipeline/import tasks |
| `qa-test-reviewer` | Post-worker validation gate (always) |
| `security-auth-reviewer` | Auth-touching PRs only (conditional) |

Removed: `product-planner` (Claude Code does this), `oss-community-maintainer` (meta, not auto-spawnable).

## CLI

```bash
pnpm orchestrate:status        # status table
pnpm orchestrate:run           # run now
pnpm orchestrate:retry <issue> # retry failed task
pnpm orchestrate:logs <issue>  # tail latest log
pnpm orchestrate:start         # start scheduled daemon
```
