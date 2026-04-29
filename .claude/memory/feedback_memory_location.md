---
name: memory location preference
description: Store project memory in /app/.claude/memory/, not the agent home directory
type: feedback
---

Always read and write project memory from `/app/.claude/memory/` (inside the project repo), not `/home/agent/.claude/projects/...`.

**Why:** Memory in the project dir persists across container rebuilds and can be tracked in git alongside the code. Agent home dir is ephemeral.

**How to apply:** At session start, check `/app/.claude/memory/MEMORY.md` for context. Write new memories there.
