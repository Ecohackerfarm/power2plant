import { loadModels, getModel } from "./models.js";
import { loadState, saveState, type OrchestratorState } from "./state.js";
import { loadTasks, getPendingTasks, type Task } from "./planner.js";
import { createWorktree, removeWorktree, worktreePath } from "./worktree.js";
import { runAgent, runQAReview, runImplFix, runSecurityGate, isAuthTouching, isPRApproved, createPR, createAgentDb, dropAgentDb } from "./worker.js";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

// Load env vars from .env and ~/.bashrc (non-overriding)
function loadEnvFile(path: string): void {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"'\n]*)["']?\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(process.env.HOME ?? "/home/agent", ".bashrc"));

const LOCK_PATH = join(process.cwd(), "autodev/orchestrate/orchestrator.pid");

function acquireLock(): void {
  if (existsSync(LOCK_PATH)) {
    const pid = parseInt(readFileSync(LOCK_PATH, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0); // throws if process doesn't exist
      console.error(`Orchestrator already running (PID ${pid}). Use 'status' to check, or delete ${LOCK_PATH} if stale.`);
      process.exit(1);
    } catch {
      // stale lock
      console.warn(`Removing stale lock for PID ${pid}`);
    }
  }
  writeFileSync(LOCK_PATH, String(process.pid));
  process.on("exit", () => { try { unlinkSync(LOCK_PATH); } catch {} });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

const cmd = process.argv[2];
const arg = process.argv[3];

async function runOrchestration(): Promise<void> {
  const config = loadModels();
  const state = loadState();

  // Reset stale "running" tasks from a previous crashed run
  for (const [key, task] of Object.entries(state.tasks)) {
    if (task.status === "running") {
      console.warn(`[#${key}] resetting stale 'running' → 'failed'`);
      state.tasks[key] = { ...task, status: "failed" };
    }
  }
  saveState(state);

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
      pool.splice(pool.indexOf(p), 1);
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
      lastLog: `autodev/logs/${key}/attempt-${attempt + 1}.log`,
    };
    saveState(state);

    let wtPath: string;
    try {
      wtPath = createWorktree(branch);
    } catch (e) {
      // worktree may already exist from prior failed attempt
      wtPath = worktreePath(branch);
    }

    if (attempt > 0) {
      // Clean up any state left by the previous failed attempt before retrying
      const { execSync: exec } = await import("child_process");
      try {
        exec(`find "${wtPath}/.git" -name "*.lock" -delete 2>/dev/null || true`, { shell: "/bin/sh" });
        exec(`git -C "${wtPath}" checkout -- . 2>/dev/null || true`, { shell: "/bin/sh" });
        exec(`git -C "${wtPath}" clean -fd 2>/dev/null || true`, { shell: "/bin/sh" });
        console.log(`[#${task.issueNumber}] worktree reset for retry`);
      } catch {
        // non-fatal
      }
    }

    try {
      console.log(`[#${task.issueNumber}] attempt ${attempt + 1}/${config.maxRetries} model=${model}`);
      console.log(`[#${task.issueNumber}] creating isolated DB`);
      const dbUrl = createAgentDb(task.issueNumber);

      try {
        await runAgent(task.role, task, attempt, model, wtPath, dbUrl, timeoutMs);

        if (isAuthTouching(wtPath)) {
          console.log(`[#${task.issueNumber}] running security gate`);
          await runSecurityGate(task, attempt, model, wtPath, dbUrl, timeoutMs);
        }
      } finally {
        console.log(`[#${task.issueNumber}] dropping isolated DB`);
        dropAgentDb(task.issueNumber);
      }

      // Safety net: commit any changes the agent wrote but forgot to commit
      const { execSync } = await import("child_process");
      const dirty = execSync("git status --porcelain", { cwd: wtPath }).toString().trim();
      if (dirty) {
        console.log(`[#${task.issueNumber}] auto-committing uncommitted agent changes`);
        execSync("git add -A && git commit -m \"feat: implement issue\"", { cwd: wtPath, shell: "/bin/sh" });
      }

      const prUrl = createPR(task, wtPath);
      const prNumber = prUrl.split("/").pop()!;

      const maxReviewRounds = config.maxReviewRounds ?? 3;
      for (let round = 0; round < maxReviewRounds; round++) {
        console.log(`[#${task.issueNumber}] QA review round ${round + 1}/${maxReviewRounds}`);
        state.tasks[key] = { ...state.tasks[key], status: "qa", qaRound: round + 1 };
        saveState(state);
        await runQAReview(task, attempt, round, model, wtPath, dbUrl, prNumber, timeoutMs);
        if (isPRApproved(prNumber)) {
          console.log(`[#${task.issueNumber}] PR approved`);
          break;
        }
        if (round < maxReviewRounds - 1) {
          console.log(`[#${task.issueNumber}] addressing QA feedback (round ${round + 1})`);
          await runImplFix(task, attempt, round, model, wtPath, dbUrl, prNumber, timeoutMs);
        } else {
          console.log(`[#${task.issueNumber}] max review rounds reached — PR left open for manual review`);
        }
      }

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
        // If we reached QA (PR exists) and failed there, preserve "qa" status so 'continue' can resume
        const prevStatus = state.tasks[key]?.status;
        const finalStatus = (prevStatus === "qa" && state.tasks[key]?.pr) ? "qa" : "failed";
        state.tasks[key] = { ...state.tasks[key], status: finalStatus, worktree: wtPath };
        saveState(state);
        console.error(`[#${task.issueNumber}] all retries exhausted — inspect autodev/logs/${key}/`);
      }
    }
  }
}

function printStatus(): void {
  const state = loadState();
  const tasks = loadTasks();

  const config = loadModels();
  const icon: Record<string, string> = { done: "✓", failed: "✗", running: "⟳", qa: "◎", "needs-continue": "!", pending: "·" };

  console.log("\nTASK  ISSUE  ROLE                     STATUS      ATTEMPTS  MODEL                     PR");
  console.log("────  ─────  ───────────────────────  ──────────  ────────  ────────────────────────  ──────");

  for (const task of tasks) {
    const s = state.tasks[String(task.issueNumber)];
    const status = s?.status ?? "pending";
    const statusLabel = status === "qa" ? `qa r${s?.qaRound ?? "?"}/${config.maxReviewRounds ?? 3}`
      : status === "needs-continue" ? "needs-cont"
      : status;
    const attempts = s ? `${s.attempts}/${config.maxRetries}` : "-";
    const model = s?.modelUsed?.split("/").pop() ?? "-";
    const pr = s?.pr ? `#${s.pr.split("/").pop()}` : "-";
    console.log(
      ` ${icon[status] ?? "?"}    #${String(task.issueNumber).padEnd(4)}  ${task.role.padEnd(23)}  ${statusLabel.padEnd(10)}  ${attempts.padEnd(8)}  ${model.padEnd(24)}  ${pr}`
    );
  }

  const failed = Object.values(state.tasks).filter((t) => t.status === "failed");
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length} task(s). Inspect autodev/logs/<issue>/ for details.`);
  }
}

async function continueTask(issueNumber: string): Promise<void> {
  const config = loadModels();
  const state = loadState();
  const tasks = loadTasks();
  const task = tasks.find((t) => String(t.issueNumber) === issueNumber);
  if (!task) { console.error(`Issue #${issueNumber} not found in tasks.json`); process.exit(1); }

  const taskState = state.tasks[issueNumber];
  if (!taskState?.pr) { console.error(`No PR found for #${issueNumber} — use retry instead`); process.exit(1); }
  const prNumber = taskState.pr.split("/").pop()!;

  // Resume from QA phase if the task was interrupted during a QA review round
  const resumeFromQA = taskState.status === "qa" && taskState.qaRound != null;
  const startRound = resumeFromQA ? taskState.qaRound! - 1 : 0;

  const timeoutMs = config.timeoutMinutes * 60 * 1000;
  const model = getModel(0, config.default);
  let wtPath: string;
  try {
    wtPath = createWorktree(task.branch);
  } catch {
    wtPath = worktreePath(task.branch);
  }

  state.tasks[issueNumber] = { ...taskState, status: resumeFromQA ? "qa" : "running", worktree: wtPath };
  saveState(state);

  try {
    const dbUrl = createAgentDb(task.issueNumber);
    try {
      if (!resumeFromQA) {
        console.log(`[#${task.issueNumber}] addressing pending QA feedback before re-review`);
        await runImplFix(task, 0, 0, model, wtPath, dbUrl, prNumber, timeoutMs);
      }

      const maxReviewRounds = config.maxReviewRounds ?? 3;
      for (let round = startRound; round < maxReviewRounds; round++) {
        console.log(`[#${task.issueNumber}] QA continue round ${round + 1}/${maxReviewRounds}`);
        state.tasks[issueNumber] = { ...state.tasks[issueNumber], status: "qa", qaRound: round + 1 };
        saveState(state);
        await runQAReview(task, 0, round, model, wtPath, dbUrl, prNumber, timeoutMs);
        if (isPRApproved(prNumber)) {
          console.log(`[#${task.issueNumber}] PR approved`);
          break;
        }
        if (round < maxReviewRounds - 1) {
          state.tasks[issueNumber] = { ...state.tasks[issueNumber], status: "needs-continue" };
          saveState(state);
          await runImplFix(task, 0, round + 1, model, wtPath, dbUrl, prNumber, timeoutMs);
        } else {
          console.log(`[#${task.issueNumber}] max review rounds reached — PR left open for manual review`);
        }
      }
    } finally {
      dropAgentDb(task.issueNumber);
    }
    removeWorktree(task.branch);
    state.tasks[issueNumber] = { ...state.tasks[issueNumber], status: "done", worktree: null };
    saveState(state);
    console.log(`[#${task.issueNumber}] done — PR: ${taskState.pr}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[#${task.issueNumber}] continue failed: ${msg}`);
    // Preserve current phase status (qa/needs-continue/running) so continue can resume correctly
    state.tasks[issueNumber] = { ...state.tasks[issueNumber], worktree: wtPath };
    saveState(state);
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
  const dir = join(process.cwd(), "autodev/logs", issueNumber);
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

function initRelease(version: string): void {
  const { execSync } = require("child_process");
  const branch = `release/v${version}`;

  // Create branch from current main and push
  execSync(`git checkout main && git pull origin main`, { stdio: "inherit" });
  execSync(`git checkout -b "${branch}"`, { stdio: "inherit" });
  execSync(`git push origin "${branch}"`, { stdio: "inherit" });
  console.log(`Branch ${branch} created and pushed.`);

  // Open PR to main if one doesn't already exist
  const existing = execSync(
    `gh pr list --base main --head "${branch}" --json number --jq '.[0].number'`
  ).toString().trim();
  if (existing && existing !== "null") {
    console.log(`PR to main already exists: #${existing}`);
    return;
  }
  const prUrl = execSync(
    `gh pr create --base main --head "${branch}" --title "release: v${version}" --body "Release branch for v${version}. Merging feature branches here — CI runs on each merge."`,
    { stdio: ["pipe", "pipe", "inherit"] }
  ).toString().trim();
  console.log(`PR to main opened: ${prUrl}`);
}

switch (cmd) {
  case "status":
    printStatus();
    break;
  case "run":
    acquireLock();
    runOrchestration().catch(console.error);
    break;
  case "retry":
    if (!arg) { console.error("Usage: orchestrate retry <issue-number>"); process.exit(1); }
    acquireLock();
    retryTask(arg).catch(console.error);
    break;
  case "logs":
    if (!arg) { console.error("Usage: orchestrate logs <issue-number>"); process.exit(1); }
    tailLogs(arg);
    break;
  case "start":
    acquireLock();
    startScheduled().catch(console.error);
    break;
  case "release":
    if (!arg) { console.error("Usage: orchestrate release <version>  (e.g. 1.0.0)"); process.exit(1); }
    initRelease(arg);
    break;
  case "continue":
    if (!arg) { console.error("Usage: orchestrate continue <issue-number>"); process.exit(1); }
    acquireLock();
    continueTask(arg).catch(console.error);
    break;
  default:
    console.log("Usage: orchestrate <status|run|retry <issue>|logs <issue>|start|release <version>|continue <issue>>");
}
