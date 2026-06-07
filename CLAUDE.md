# Claude Code Instructions

## MANDATORY: Worktree pre-flight before any edit or commit

**Every task** (fix, feat, chore) requires a git worktree. No exceptions.

Steps — run BEFORE the first file edit:

```bash
# 1. Create worktree branched from current release branch
git worktree add /app/.worktrees/<branch-name> -b <branch-name>

# 2. All file edits go inside the worktree path
#    e.g. /app/.worktrees/<branch-name>/src/...

# 3. Commit via git -C
git -C /app/.worktrees/<branch-name> commit -m "..."
```

**Never edit `/app/src/...` directly.**
Branch base: current release branch (e.g. `release/v0.18.0`), not `main`.
