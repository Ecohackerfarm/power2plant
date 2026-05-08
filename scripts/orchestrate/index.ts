import { loadModels, getModel } from "./models.js";
import { loadState, saveState, type OrchestratorState } from "./state.js";
import { loadTasks, getPendingTasks, type Task } from "./planner.js";
import { createWorktree, removeWorktree, worktreePath } from "./worktree.js";
import { runAgent, runQAGate, runSecurityGate, isAuthTouching, createPR, createAgentDb, dropAgentDb } from "./worker.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const cmd = process.argv[2];
const arg = process.argv[3];

async function runOrchestration(): Promise<void> {
  const config = loadModels();
  const state = loadState();
  const tasks = loadTasks();
  const pending = getPendingTasks(tasks, state);

  if (pending.length === 0) {
    console.log("No pending tasks.");
    return;
  }

  state.lastRun = new Date().toISOString();
  saveState(state);

  const pool: Promise<void>[] = [];
  let running = 0;

  for (const task of pending) {
    while (running >= config.maxParallel) {
      await Promise.race(pool);
    }
    const p = processTask(task, config, state).finally(() => {
      running--;
    });
    pool.push(p);
    running++;
  }

  await Promise.allSettled(pool);
  console.log("Orchestration run complete.");
  printStatus();
}

async function processTask(task: Task, config: ReturnType<typeof loadModels>, state: OrchestratorState): Promise<void> {
  const key = String(task.issueNumber);
  const timeoutMs = config.timeoutMinutes * 60 * 1000;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    const model = getModel(attempt, config.default);
    const branch = task.branch;

    state.tasks[key] = {
      status: "running",
      role: task.role,
      branch,
      attempts: attempt + 1,
      modelUsed: model,
      pr: null,
      worktree: worktreePath(branch),
      lastLog: `logs/${key}/attempt-${attempt + 1}.log`,
    };
    saveState(state);

    let wtPath: string;
    try {
      wtPath = createWorktree(branch);
    } catch (e) {
      // worktree may already exist from prior failed attempt
      wtPath = worktreePath(branch);
    }

    try {
      console.log(`[#${task.issueNumber}] attempt ${attempt + 1}/${config.maxRetries} model=${model}`);
      console.log(`[#${task.issueNumber}] creating isolated DB`);
      const dbUrl = createAgentDb(task.issueNumber);

      try {
        await runAgent(task.role, task, attempt, model, wtPath, dbUrl, timeoutMs);

        console.log(`[#${task.issueNumber}] running QA gate`);
        await runQAGate(task, attempt, wtPath, dbUrl, timeoutMs);

        if (isAuthTouching(wtPath)) {
          console.log(`[#${task.issueNumber}] running security gate`);
          await runSecurityGate(task, attempt, wtPath, dbUrl, timeoutMs);
        }
      } finally {
        console.log(`[#${task.issueNumber}] dropping isolated DB`);
        dropAgentDb(task.issueNumber);
      }

      const prUrl = createPR(task, wtPath);
      removeWorktree(branch);

      state.tasks[key] = { ...state.tasks[key], status: "done", pr: prUrl, worktree: null };
      saveState(state);
      console.log(`[#${task.issueNumber}] done — PR: ${prUrl}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[#${task.issueNumber}] attempt ${attempt + 1} failed: ${msg}`);

      if (attempt < config.maxRetries - 1) {
        removeWorktree(branch);
      } else {
        state.tasks[key] = { ...state.tasks[key], status: "failed", worktree: wtPath };
        saveState(state);
        console.error(`[#${task.issueNumber}] all retries exhausted — inspect logs/${key}/`);
      }
    }
  }
}

function printStatus(): void {
  const state = loadState();
  const tasks = loadTasks();

  const icon: Record<string, string> = { done: "✓", failed: "✗", running: "⟳", pending: "·" };

  console.log("\nTASK  ISSUE  ROLE                     STATUS    ATTEMPTS  MODEL                     PR");
  console.log("────  ─────  ───────────────────────  ────────  ────────  ────────────────────────  ──────");

  for (const task of tasks) {
    const s = state.tasks[String(task.issueNumber)];
    const status = s?.status ?? "pending";
    const attempts = s ? `${s.attempts}/${loadModels().maxRetries}` : "-";
    const model = s?.modelUsed?.split("/").pop() ?? "-";
    const pr = s?.pr ? `#${s.pr.split("/").pop()}` : "-";
    console.log(
      ` ${icon[status] ?? "?"}    #${String(task.issueNumber).padEnd(4)}  ${task.role.padEnd(23)}  ${status.padEnd(8)}  ${attempts.padEnd(8)}  ${model.padEnd(24)}  ${pr}`
    );
  }

  const failed = Object.values(state.tasks).filter((t) => t.status === "failed");
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length} task(s). Inspect logs/<issue>/ for details.`);
  }
}

async function retryTask(issueNumber: string): Promise<void> {
  const config = loadModels();
  const state = loadState();
  const tasks = loadTasks();
  const task = tasks.find((t) => String(t.issueNumber) === issueNumber);
  if (!task) {
    console.error(`Issue #${issueNumber} not found in tasks.json`);
    process.exit(1);
  }
  // reset to pending so processTask picks it up fresh
  delete state.tasks[issueNumber];
  saveState(state);
  await processTask(task, config, state);
}

function tailLogs(issueNumber: string): void {
  const { execSync } = require("child_process");
  const dir = join(process.cwd(), "logs", issueNumber);
  if (!existsSync(dir)) {
    console.error(`No logs found for issue #${issueNumber}`);
    process.exit(1);
  }
  const latest = execSync(`ls -t "${dir}" | head -1`).toString().trim();
  execSync(`tail -f "${dir}/${latest}"`, { stdio: "inherit" });
}

async function startScheduled(): Promise<void> {
  const cron = await import("node-cron");
  const config = loadModels();
  console.log(`Scheduler starting. Cron: ${config.schedule}`);
  cron.schedule(config.schedule, async () => {
    console.log(`[${new Date().toISOString()}] scheduled run`);
    await runOrchestration();
  });
  // keep process alive
  process.stdin.resume();
}

switch (cmd) {
  case "status":
    printStatus();
    break;
  case "run":
    runOrchestration().catch(console.error);
    break;
  case "retry":
    if (!arg) { console.error("Usage: orchestrate retry <issue-number>"); process.exit(1); }
    retryTask(arg).catch(console.error);
    break;
  case "logs":
    if (!arg) { console.error("Usage: orchestrate logs <issue-number>"); process.exit(1); }
    tailLogs(arg);
    break;
  case "start":
    startScheduled().catch(console.error);
    break;
  default:
    console.log("Usage: orchestrate <status|run|retry <issue>|logs <issue>|start>");
}
