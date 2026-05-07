import { spawn, execSync } from "child_process";
import { readFileSync, mkdirSync, createWriteStream, existsSync } from "fs";
import { join } from "path";
import type { Task } from "./planner.js";
import type { ModelsConfig } from "./models.js";

const AUTH_PATTERNS = [
  "src/lib/auth.ts",
  "src/lib/auth-client.ts",
  /src\/app\/api\/garden/,
];

function buildPrompt(role: string, task: Task, worktreePath: string): string {
  const sharedPath = join(process.cwd(), "agents/_shared.md");
  const rolePath = join(process.cwd(), `agents/${role}.md`);
  const shared = readFileSync(sharedPath, "utf-8").replaceAll("<WORKTREE_PATH>", worktreePath);
  const rolePrompt = readFileSync(rolePath, "utf-8");
  const body = task.body ? `\n\n${task.body}` : "";
  return `${shared}\n\n---\n\n${rolePrompt}\n\n---\n\nImplement GitHub issue #${task.issueNumber}: ${task.title}${body}`;
}

function logPath(issueNumber: number, attempt: number): string {
  const dir = join(process.cwd(), "logs", String(issueNumber));
  mkdirSync(dir, { recursive: true });
  return join(dir, `attempt-${attempt + 1}.log`);
}

export async function runAgent(
  role: string,
  task: Task,
  attempt: number,
  model: string,
  worktreePath: string,
  timeoutMs: number
): Promise<void> {
  const prompt = buildPrompt(role, task, worktreePath);
  const log = logPath(task.issueNumber, attempt);
  const out = createWriteStream(log, { flags: "w" });

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["run", "--model", model, "--dangerously-skip-permissions", "--dir", worktreePath, prompt],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    proc.stdout.pipe(out);
    proc.stderr.pipe(out);

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`timeout after ${timeoutMs / 60000}min`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`exit code ${code}`));
    });
  });
}

export async function runQAGate(task: Task, attempt: number, worktreePath: string, timeoutMs: number): Promise<void> {
  const qaPrompt = buildQAPrompt(task, worktreePath);
  const log = logPath(task.issueNumber, attempt) + ".qa.log";
  const out = createWriteStream(log, { flags: "w" });

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["run", "--model", "opencode/hy3-preview-free", "--dangerously-skip-permissions", "--dir", worktreePath, qaPrompt],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    proc.stdout.pipe(out);
    proc.stderr.pipe(out);

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("QA gate timeout"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`QA gate failed (exit ${code})`));
    });
  });
}

function buildQAPrompt(task: Task, worktreePath: string): string {
  const sharedPath = join(process.cwd(), "agents/_shared.md");
  const rolePath = join(process.cwd(), "agents/qa-test-reviewer.md");
  const shared = readFileSync(sharedPath, "utf-8").replaceAll("<WORKTREE_PATH>", worktreePath);
  const role = readFileSync(rolePath, "utf-8");
  return `${shared}\n\n---\n\n${role}\n\n---\n\nReview and validate the implementation for issue #${task.issueNumber}: ${task.title}. Run tests. If tests fail, fix them.`;
}

export function isAuthTouching(worktreePath: string): boolean {
  try {
    const diff = execSync("git diff --name-only HEAD", { cwd: worktreePath }).toString();
    const files = diff.split("\n").filter(Boolean);
    return files.some((f) =>
      AUTH_PATTERNS.some((p) => (typeof p === "string" ? f === p : p.test(f)))
    );
  } catch {
    return false;
  }
}

export async function runSecurityGate(task: Task, attempt: number, worktreePath: string, timeoutMs: number): Promise<void> {
  const sharedPath = join(process.cwd(), "agents/_shared.md");
  const rolePath = join(process.cwd(), "agents/security-auth-reviewer.md");
  const shared = readFileSync(sharedPath, "utf-8").replaceAll("<WORKTREE_PATH>", worktreePath);
  const role = readFileSync(rolePath, "utf-8");
  const prompt = `${shared}\n\n---\n\n${role}\n\n---\n\nReview auth and security for issue #${task.issueNumber}: ${task.title}.`;
  const log = logPath(task.issueNumber, attempt) + ".security.log";
  const out = createWriteStream(log, { flags: "w" });

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["run", "--model", "opencode/hy3-preview-free", "--dangerously-skip-permissions", "--dir", worktreePath, prompt],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    proc.stdout.pipe(out);
    proc.stderr.pipe(out);

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("security gate timeout"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`security gate failed (exit ${code})`));
    });
  });
}

export function createPR(task: Task, worktreePath: string): string {
  execSync("git push -u origin HEAD", { cwd: worktreePath, stdio: "inherit" });
  const base = execSync(
    "git branch -r | grep -o 'release/v[0-9.]*' | sort -V | tail -1 || echo 'release/v0.8.0'",
    { cwd: worktreePath }
  ).toString().trim() || "release/v0.8.0";
  const result = execSync(
    `gh pr create --base "${base}" --title "${task.title}" --body "Closes #${task.issueNumber}"`,
    { cwd: worktreePath }
  ).toString().trim();
  return result;
}
