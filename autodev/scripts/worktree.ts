import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { join } from "path";

export function worktreePath(branch: string): string {
  return join(process.cwd(), ".worktrees", branch.replaceAll("/", "_"));
}

export function createWorktree(branch: string): string {
  const path = worktreePath(branch);
  const branchExists = (() => {
    try {
      execSync(`git rev-parse --verify "${branch}"`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  if (branchExists) {
    // branch exists from prior attempt — reuse it, don't recreate
    execSync(`git worktree add "${path}" "${branch}"`, { stdio: "inherit" });
  } else {
    execSync(`git worktree add "${path}" -b "${branch}"`, { stdio: "inherit" });
  }
  return path;
}

export function removeWorktree(branch: string): void {
  const path = worktreePath(branch);
  try {
    execSync(`git worktree remove --force "${path}"`, { stdio: "pipe" });
  } catch {
    // fallback: manual remove if git worktree remove fails (permission issues)
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      execSync(`git worktree prune`, { stdio: "pipe" });
    }
  }
  try {
    execSync(`git branch -D "${branch}"`, { stdio: "pipe" });
  } catch {
    // branch may already be gone
  }
}
