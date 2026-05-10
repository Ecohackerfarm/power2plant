# autodev — Code Review

## Summary

Solid architecture for the problem. Isolation model (worktree + DB per task) is correct and prevents cross-task contamination. Main risks are in error handling, state consistency, and a few logic bugs that will surface at scale.

---

## Bugs

### 1. `continueTask` marks status `done` on failure
`scripts/index.ts` line ~264: the catch block sets `status: "done"` even when the task failed mid-continue. Should be a distinct status (e.g. `"needs-continue"`) so the user can tell it stopped again.

### 2. `printStatus` hardcodes `/3` for QA round display
```ts
const statusLabel = status === "qa" ? `qa r${s?.qaRound ?? "?"}/${3}` : status;
```
Should read `config.maxReviewRounds` — otherwise it shows wrong denominator when config changes.

### 3. `runOrchestration` parallel pool leaks resolved promises
```ts
while (running >= config.maxParallel) {
  await Promise.race(pool);  // resolved promises stay in pool forever
}
```
`Promise.race` doesn't remove settled promises. Pool grows unboundedly; `running` is decremented by `finally` but `pool` never shrinks. Works correctly at small scale but will hold memory on long runs. Fix: splice resolved promises from pool on settlement.

### 4. `getPendingTasks` re-picks `running` tasks after restart
A task with `status: "running"` in state (e.g. after a crash) is treated as pending and re-queued. The retry reset logic (`checkout -- .`, `clean -fd`) only applies to `attempt > 0`. A crashed attempt 1 re-runs without reset. Fix: treat `running` as `failed` on startup, or add a `running` → `pending` reset step before `runOrchestration`.

### 5. `initRelease` calls `git checkout main` unconditionally
This fails if the process is running inside a worktree or detached HEAD. Use `git -C <root>` with an explicit repo path.

---

## Design concerns

### 6. `_shared.md` contradicts `qa-test-reviewer.md` on tests
`_shared.md` tells impl agents to run `pnpm test:run` via SSH before creating the PR. `qa-test-reviewer.md` says not to run tests (CI does it). These are different agents so not a direct conflict, but it means impl agents still run tests locally (spending tokens + time) even though CI will run them anyway. Consider removing the test-run instruction from `_shared.md` too and relying on CI, same as QA.

### 7. `continueTask` always uses attempt 0 / first model
```ts
const model = getModel(0, config.default);
```
If the impl originally used a rotated model on attempt 2, continue uses attempt 0's model. Minor — the model rotation logic exists for retry escalation, and `continue` is a different flow — but worth documenting.

### 8. `loadEnvFile` won't parse values containing `=`
The regex `([^"'\n]*)` after the `=` sign captures correctly for simple values, but a value like `BASE64=abc=def` would be truncated at the second `=` since the pattern matches `[A-Z_][A-Z0-9_]*=...` and the capture stops at `"` or `'` — actually fine for unquoted values, but if a quoted value contains `=` the regex still works. Real edge case: multiline values in `.env` (not handled, acceptable).

### 9. `removeWorktree` deletes local branch unconditionally
```ts
execSync(`git branch -D "${branch}"`, { stdio: "pipe" });
```
This deletes the local tracking branch. Fine for normal flow since the branch lives on remote. But on `continue`, the worktree is created from the remote branch — if the branch was already deleted locally, `createWorktree` fetches it from remote. Not a bug but adds a round-trip.

---

## Minor / cleanup

### 10. `tailLogs` uses `require()` inconsistently
All other dynamic imports use `await import(...)`. `tailLogs` uses `require("child_process")` — it's CommonJS-style in an ESM context. Works because tsx handles it, but inconsistent.

### 11. `qa-test-reviewer.md` security agent approval lacks context
The security reviewer prompt (`security-auth-reviewer.md`) has no instruction on how to approve/reject. It lists what to check but not how to submit a review decision. Impl agents may not know to check the security gate result. The orchestrator calls `runSecurityGate` but never checks if the security agent approved or rejected — it just runs and moves on regardless.

### 12. README usage section is stale
Missing `orchestrate:continue` and `orchestrate:release` commands. The `AGENT_GITHUB_TOKEN` note says "JustADevBot" but the token is loaded from `GH_TOKEN` in `.env` / `.bashrc` — the setup instructions don't reflect actual env var names.

---

## What works well

- Worktree + isolated DB model is clean and correct
- PID lock prevents concurrent orchestrators — hard-won lesson, implemented correctly
- `createAgentDb` drop-before-create is now idempotent
- `loadEnvFile` non-overriding (`!(m[1] in process.env)`) — shell env takes precedence, right call
- Agent role prompts are concise and project-specific, not generic boilerplate
- QA reviewer using `gh pr checks` instead of local test runs is the right direction
- `state.json` atomic write via tmp + rename avoids partial writes
