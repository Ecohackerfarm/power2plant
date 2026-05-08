# autodev — Agentic Development System

Parallel agent orchestration for power2plant. Each GitHub issue gets an isolated git worktree, isolated PostgreSQL DB, and a free/cheap LLM agent that implements the issue, runs tests, and opens a PR. A QA agent reviews each PR; if changes are needed the impl agent fixes and QA re-reviews (up to 3 rounds).

## Directory layout

```
autodev/
  agents/          Role prompt files (one per agent persona)
  orchestrate/     Runtime config: models.json, tasks.json, state.json (gitignored)
  scripts/         TypeScript orchestrator source
  logs/            Per-issue attempt logs (gitignored)
```

## Usage

```sh
pnpm orchestrate:status          # show all task states
pnpm orchestrate:run             # start pending tasks
pnpm orchestrate:retry <issue>   # reset + retry a failed issue
pnpm orchestrate:logs <issue>    # tail latest log for an issue
pnpm orchestrate:start           # run on cron (schedule in models.json)
```

Set `AGENT_GITHUB_TOKEN` to a PAT for the coding bot account (JustADevBot) before running. The reviewer account (JustTB, `gh auth`) approves PRs via `GH_TOKEN="" gh pr review`.

---

## Model evaluation log

### Free-tier models

| Model | Verdict | Notes |
|-------|---------|-------|
| `opencode/hy3-preview-free` | ❌ Useless | Reads files, outputs a prose plan, never executes a single tool call. Wasted every attempt slot it was first. |
| `openrouter/qwen/qwen3-coder:free` | ❌ Not found | `ProviderModelNotFoundError` — not registered in opencode's model registry despite existing on OpenRouter API. |
| `openrouter/openai/gpt-oss-120b:free` | ⚠️ Marginal | Actually uses tools and makes file edits. But rate-limited, slow, and occasionally hits "invalid tool" errors. Only viable model in free tier tested so far. |
| `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | ❓ Untested | Listed as tool-use capable by OpenRouter API. Not yet evaluated in practice. |
| `openrouter/google/gemma-4-31b-it:free` | ❓ Untested | Listed as tool-use capable. Not yet evaluated. |

### Cheap paid models (recommended)

Not yet tested in this orchestration setup. Candidates based on known capability:

| Model | Est. cost | Expected quality |
|-------|-----------|-----------------|
| `claude-haiku-4-5-20251001` | ~$0.80/MTok in | Excellent tool use, fast, best value for agentic coding |
| `openrouter/google/gemini-2.5-flash` | ~$0.15/MTok | Very fast, strong reasoning, excellent tool use |
| `openrouter/openai/gpt-4o-mini` | ~$0.15/MTok | Reliable tool use, weaker at complex multi-file edits |

### Conclusion

Free models are not viable for multi-file agentic coding — either no tool use, or too rate-limited to be useful. Switching to cheap paid models (Haiku or Gemini Flash) as the primary tier.
