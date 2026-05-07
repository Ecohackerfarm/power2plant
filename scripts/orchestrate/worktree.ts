import { execSync } from "child_process";
import { join } from "path";

export function worktreePath(branch: string): string {
  return join(process.cwd(), ".worktrees", branch);
}

export function createWorktree(branch: string): string {
  const path = worktreePath(branch);
  execSync(`git worktree add "${path}" -b "${branch}"`, { stdio: "inherit" });
  return path;
}

export function removeWorktree(branch: string): void {
  const path = worktreePath(branch);
  try {
    execSync(`git worktree remove --force "${path}"`, { stdio: "inherit" });
    execSync(`git branch -D "${branch}"`, { stdio: "pipe" });
  } catch {
    // best-effort cleanup
  }
}
