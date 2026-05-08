import { spawn, execSync } from "child_process";
import { readFileSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import type { Task } from "./planner.js";

const SSH = `ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no root@power2plant-app-1`;
const PGENV = `PGPASSWORD=power2plant`;
const PG_HOST = `db-dev`;
const PG_USER = `power2plant`;

function sshExec(cmd: string): string {
  return execSync(`${SSH} "${cmd.replace(/"/g, '\\"')}"`).toString();
}

export function createAgentDb(issueNumber: number): string {
  const dbName = `power2plant_agent_${issueNumber}`;
  const seedPath = join(process.cwd(), "db/seed.sql");
  execSync(`${PGENV} createdb -h ${PG_HOST} -U ${PG_USER} ${dbName}`);
  execSync(`${PGENV} psql -h ${PG_HOST} -U ${PG_USER} ${dbName} < ${seedPath}`);
  // agents connect via internal container hostname
  return `postgresql://${PG_USER}:power2plant@db:5432/${dbName}`;
}

export function dropAgentDb(issueNumber: number): void {
  const dbName = `power2plant_agent_${issueNumber}`;
  try {
    execSync(`${PGENV} dropdb -h ${PG_HOST} -U ${PG_USER} --if-exists ${dbName}`);
  } catch {
    // best-effort
  }
}

const AUTH_PATTERNS = [
  "src/lib/auth.ts",
  "src/lib/auth-client.ts",
  /src\/app\/api\/garden/,
];

function buildPrompt(role: string, task: Task, worktreePath: string, dbUrl: string): string {
  const sharedPath = join(process.cwd(), "agents/_shared.md");
  const rolePath = join(process.cwd(), `agents/${role}.md`);
  const shared = readFileSync(sharedPath, "utf-8")
    .replaceAll("<WORKTREE_PATH>", worktreePath)
    .replaceAll("<DATABASE_URL>", dbUrl);
  const rolePrompt = readFileSync(rolePath, "utf-8");
  const body = task.body ? `\n\n${task.body}` : "";
  return `${shared}\n\n---\n\n${rolePrompt}\n\n---\n\nImplement GitHub issue #${task.issueNumber}: ${task.title}${body}`;
}

function buildGatePrompt(agentFile: string, task: Task, worktreePath: string, dbUrl: string, instruction: string): string {
  const sharedPath = join(process.cwd(), "agents/_shared.md");
  const shared = readFileSync(sharedPath, "utf-8")
    .replaceAll("<WORKTREE_PATH>", worktreePath)
    .replaceAll("<DATABASE_URL>", dbUrl);
  const role = readFileSync(join(process.cwd(), `agents/${agentFile}`), "utf-8");
  return `${shared}\n\n---\n\n${role}\n\n---\n\n${instruction}`;
}

function logPath(issueNumber: number, attempt: number): string {
  const dir = join(process.cwd(), "logs", String(issueNumber));
  mkdirSync(dir, { recursive: true });
  return join(dir, `attempt-${attempt + 1}.log`);
}

function spawnAgent(model: string, worktreePath: string, prompt: string, log: string, timeoutMs: number): Promise<void> {
  const out = createWriteStream(log, { flags: "w" });
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["run", "--model", model, "--dangerously-skip-permissions", "--dir", worktreePath, prompt],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    proc.stdout.pipe(out);
    proc.stderr.pipe(out);
    const timer = setTimeout(() => { proc.kill("SIGTERM"); reject(new Error(`timeout after ${timeoutMs / 60000}min`)); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`exit code ${code}`));
    });
  });
}

export async function runAgent(
  role: string, task: Task, attempt: number, model: string,
  worktreePath: string, dbUrl: string, timeoutMs: number
): Promise<void> {
  return spawnAgent(
    model, worktreePath,
    buildPrompt(role, task, worktreePath, dbUrl),
    logPath(task.issueNumber, attempt),
    timeoutMs
  );
}

export async function runQAGate(task: Task, attempt: number, worktreePath: string, dbUrl: string, timeoutMs: number): Promise<void> {
  return spawnAgent(
    "opencode/hy3-preview-free", worktreePath,
    buildGatePrompt("qa-test-reviewer.md", task, worktreePath, dbUrl,
      `Review and validate the implementation for issue #${task.issueNumber}: ${task.title}. Run tests. Fix failures.`),
    logPath(task.issueNumber, attempt) + ".qa.log",
    timeoutMs
  );
}

export async function runSecurityGate(task: Task, attempt: number, worktreePath: string, dbUrl: string, timeoutMs: number): Promise<void> {
  return spawnAgent(
    "opencode/hy3-preview-free", worktreePath,
    buildGatePrompt("security-auth-reviewer.md", task, worktreePath, dbUrl,
      `Review auth and security for issue #${task.issueNumber}: ${task.title}.`),
    logPath(task.issueNumber, attempt) + ".security.log",
    timeoutMs
  );
}

export function isAuthTouching(worktreePath: string): boolean {
  try {
    const diff = execSync("git diff --name-only HEAD", { cwd: worktreePath }).toString();
    return diff.split("\n").filter(Boolean).some((f) =>
      AUTH_PATTERNS.some((p) => (typeof p === "string" ? f === p : p.test(f)))
    );
  } catch {
    return false;
  }
}

export function createPR(task: Task, worktreePath: string): string {
  execSync("git push -u origin HEAD", { cwd: worktreePath, stdio: "inherit" });
  const base = execSync(
    "git branch -r | grep -o 'release/v[0-9.]*' | sort -V | tail -1 || echo 'release/v0.8.0'",
    { cwd: worktreePath }
  ).toString().trim() || "release/v0.8.0";
  return execSync(
    `gh pr create --base "${base}" --title "${task.title}" --body "Closes #${task.issueNumber}"`,
    { cwd: worktreePath }
  ).toString().trim();
}
