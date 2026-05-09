# autodev — Agentic Development System

Parallel agent orchestration for power2plant. Each GitHub issue gets an isolated git worktree, isolated PostgreSQL DB, and a cheap LLM agent that implements the issue, runs tests, and opens a PR. A QA agent reviews each PR; if changes are needed the impl agent fixes and QA re-reviews (up to 3 rounds).

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

All prices are OpenRouter input cost per 1M tokens unless noted. "tools" = confirmed tool-use support in opencode.

### Free-tier models — tested

| Model | Verdict | Notes |
|-------|---------|-------|
| `opencode/hy3-preview-free` | ❌ Useless | No tool calls at all. Reads files, outputs prose plan, exits. Wasted every first attempt. |
| `openrouter/qwen/qwen3-coder:free` | ❌ Not found | `ProviderModelNotFoundError` in opencode despite existing on OpenRouter API. |
| `openrouter/openai/gpt-oss-120b:free` | ⚠️ Marginal | Uses tools, makes actual file edits. Rate-limited, slow, occasional "invalid tool" errors. Only viable free model tested. |
| `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | ❓ Untested | Tool-use capable per OpenRouter API. |
| `openrouter/google/gemma-4-31b-it:free` | ❓ Untested | Tool-use capable per OpenRouter API. |

---

### Cheap paid models — to evaluate

Ordered by price. All have tool-use support on OpenRouter. None tested yet in this orchestration setup.

#### DeepSeek family — strong price/performance for code

| Model | Price | Notes |
|-------|-------|-------|
| `openrouter/deepseek/deepseek-v4-flash` | $0.14/MTok | Fast, cost-effective variant; weaker than Pro on complex tasks |
| `openrouter/deepseek/deepseek-v3.2-exp` | $0.27/MTok | Experimental V3.2; no-tools variant also exists (skip that) |
| `openrouter/deepseek/deepseek-v4-pro` | $0.43/MTok | Full Pro; use if Flash underperforms on tricky multi-file edits |

#### Qwen family — coding-optimised MoE

| Model | Price | Notes |
|-------|-------|-------|
| `openrouter/qwen/qwen3.5-flash-02-23` | $0.07/MTok | Very cheap; coding-capable flash variant |
| `openrouter/qwen/qwen3-coder-plus` | $0.65/MTok | MoE coding specialist (480B-A35B); expensive but purpose-built |

#### Gemini family — large context window

| Model | Price | Notes |
|-------|-------|-------|
| `openrouter/google/gemini-3.1-flash-lite` | $0.25/MTok | Latest Gemini Flash; SWE-bench shows strong scores for the Flash class |

#### GLM / MiniMax — low-cost alternatives

| Model | Price | Notes |
|-------|-------|-------|
| `openrouter/z-ai/glm-4.7-flash` | $0.06/MTok | Cheapest tool-capable model found; unknown coding quality |
| `openrouter/minimax/minimax-m2.5` | $0.15/MTok | MiniMax coding-capable; competitive in 2026 benchmarks |

#### Kimi — strong on agentic tasks

| Model | Price | Notes |
|-------|-------|-------|
| `openrouter/moonshotai/kimi-k2.5` | $0.44/MTok | Reportedly strong on agentic / tool-use tasks |

#### Anthropic — fallback for hard tasks

| Model | Price | Notes |
|-------|-------|-------|
| `claude-haiku-4-5-20251001` | $0.80/MTok | Fast, reliable tool use; use when others fail repeatedly |
| `claude-sonnet-4-6` | $3/MTok | Not cheap; worth it for code review, architecture, subtle bugs |

---

### Current models.json rotation

First model attempted per task. On failure, retries with next:

1. `openrouter/deepseek/deepseek-v4-flash` — primary
2. `openrouter/qwen/qwen3.5-flash-02-23` — fallback 1
3. `openrouter/google/gemini-3.1-flash-lite` — fallback 2
4. `openrouter/z-ai/glm-4.7-flash` — fallback 3 (cheapest, unknown quality)

Update `autodev/orchestrate/models.json` as evaluation results come in.
