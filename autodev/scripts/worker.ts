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
  const sharedPath = join(process.cwd(), "autodev/agents/_shared.md");
  const rolePath = join(process.cwd(), `autodev/agents/${role}.md`);
  const shared = readFileSync(sharedPath, "utf-8")
    .replaceAll("<WORKTREE_PATH>", worktreePath)
    .replaceAll("<DATABASE_URL>", dbUrl);
  const rolePrompt = readFileSync(rolePath, "utf-8");
  const body = task.body ? `\n\n${task.body}` : "";
  return `${shared}\n\n---\n\n${rolePrompt}\n\n---\n\nImplement GitHub issue #${task.issueNumber}: ${task.title}${body}`;
}

function buildGatePrompt(agentFile: string, task: Task, worktreePath: string, dbUrl: string, instruction: string): string {
  const sharedPath = join(process.cwd(), "autodev/agents/_shared.md");
  const shared = readFileSync(sharedPath, "utf-8")
    .replaceAll("<WORKTREE_PATH>", worktreePath)
    .replaceAll("<DATABASE_URL>", dbUrl);
  const role = readFileSync(join(process.cwd(), `autodev/agents/${agentFile}`), "utf-8");
  return `${shared}\n\n---\n\n${role}\n\n---\n\n${instruction}`;
}

function ensureLog(issueNumber: number, filename: string): string {
  const dir = join(process.cwd(), "autodev/logs", String(issueNumber));
  mkdirSync(dir, { recursive: true });
  return join(dir, filename);
}

function logPath(issueNumber: number, attempt: number): string {
  return ensureLog(issueNumber, `attempt-${attempt + 1}.log`);
}

function spawnAgent(model: string, worktreePath: string, prompt: string, log: string, timeoutMs: number): Promise<void> {
  const agentToken = process.env.AGENT_GITHUB_TOKEN;
  if (!agentToken) throw new Error("AGENT_GITHUB_TOKEN not set");
  const out = createWriteStream(log, { flags: "w" });
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["run", "--model", model, "--dangerously-skip-permissions", "--dir", worktreePath, prompt],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GH_TOKEN: agentToken } }
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

export async function runQAReview(
  task: Task, attempt: number, round: number,
  worktreePath: string, dbUrl: string, prNumber: string, timeoutMs: number
): Promise<void> {
  return spawnAgent(
    "opencode/hy3-preview-free", worktreePath,
    buildGatePrompt("qa-test-reviewer.md", task, worktreePath, dbUrl,
      `Review PR #${prNumber} for issue #${task.issueNumber}: ${task.title}. Approve if correct and tests exist. Request changes with specific comments if not.`),
    ensureLog(task.issueNumber, `attempt-${attempt + 1}.qa-round${round + 1}.log`),
    timeoutMs
  );
}

export async function runImplFix(
  task: Task, attempt: number, round: number,
  model: string, worktreePath: string, dbUrl: string, prNumber: string, timeoutMs: number
): Promise<void> {
  const shared = readFileSync(join(process.cwd(), "autodev/agents/_shared.md"), "utf-8")
    .replaceAll("<WORKTREE_PATH>", worktreePath)
    .replaceAll("<DATABASE_URL>", dbUrl);
  const rolePrompt = readFileSync(join(process.cwd(), `autodev/agents/${task.role}.md`), "utf-8");
  const prompt = `${shared}\n\n---\n\n${rolePrompt}\n\n---\n\nAddress QA review comments on PR #${prNumber} (issue #${task.issueNumber}: ${task.title}).\n1. Read all feedback: \`gh pr view ${prNumber} --json reviews,comments\`\n2. Fix each issue raised (tests, logic, missing coverage)\n3. Run \`pnpm test:run\` via SSH — all tests must pass\n4. Commit and push to the existing branch (do NOT create a new PR)`;
  // Ensure worktree is on the correct feature branch before agent runs
  const currentBranch = execSync("git branch --show-current", { cwd: worktreePath }).toString().trim();
  if (currentBranch !== task.branch) {
    console.warn(`[#${task.issueNumber}] worktree on '${currentBranch}', expected '${task.branch}' — checking out`);
    execSync(`git checkout ${task.branch}`, { cwd: worktreePath });
  }

  await spawnAgent(
    model, worktreePath, prompt,
    ensureLog(task.issueNumber, `attempt-${attempt + 1}.fix-round${round + 1}.log`),
    timeoutMs
  );

  // Safety net: commit + push any changes the agent made but didn't push
  const dirty = execSync("git status --porcelain", { cwd: worktreePath }).toString().trim();
  if (dirty) {
    execSync("git add -A && git commit -m \"fix: address QA review feedback\"", { cwd: worktreePath, shell: "/bin/sh" });
  }
  const ahead = execSync(`git rev-list origin/${task.branch}..HEAD --count 2>/dev/null || echo 0`, { cwd: worktreePath, shell: "/bin/sh" }).toString().trim();
  if (parseInt(ahead) > 0) {
    const token = execSync("gh auth token").toString().trim();
    const sshRemote = execSync("git remote get-url origin", { cwd: worktreePath }).toString().trim();
    const httpsRemote = sshRemote.replace(/^git@github\.com:/, "https://github.com/");
    execSync(`git push "${httpsRemote.replace("https://", `https://x-access-token:${token}@`)}" HEAD:${task.branch}`, { cwd: worktreePath });
  }
}

export function isPRApproved(prNumber: string): boolean {
  try {
    const decision = execSync(
      `gh pr view ${prNumber} --json reviewDecision --jq '.reviewDecision'`
    ).toString().trim();
    return decision === "APPROVED";
  } catch {
    return false;
  }
}

export async function runSecurityGate(task: Task, attempt: number, model: string, worktreePath: string, dbUrl: string, timeoutMs: number): Promise<void> {
  return spawnAgent(
    model, worktreePath,
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
  const agentToken = process.env.AGENT_GITHUB_TOKEN;
  if (!agentToken) throw new Error("AGENT_GITHUB_TOKEN not set");
  const sshRemote = execSync("git remote get-url origin", { cwd: worktreePath }).toString().trim();
  const httpsRemote = sshRemote.replace(/^git@github\.com:/, "https://github.com/");
  const reviewerToken = execSync("gh auth token").toString().trim();
  execSync(
    `git push "${httpsRemote.replace("https://", `https://x-access-token:${reviewerToken}@`)}" HEAD:${task.branch}`,
    { cwd: worktreePath }
  );
  const base = execSync(
    "git branch -r | grep -o 'release/v[0-9.]*' | sort -V | tail -1 || echo 'release/v0.8.0'",
    { cwd: worktreePath }
  ).toString().trim() || "release/v0.8.0";
  return execSync(
    `gh pr create --base "${base}" --title "${task.title}" --body "Closes #${task.issueNumber}"`,
    { cwd: worktreePath, env: { ...process.env, GH_TOKEN: agentToken } }
  ).toString().trim();
}
