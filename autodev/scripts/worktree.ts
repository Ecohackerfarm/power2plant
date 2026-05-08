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
    execSync(`git worktree add "${path}" "${branch}"`, { stdio: "inherit" });
  } else {
    // Branch from latest release so PRs only show feature changes, not main divergence
    const releaseBranch = execSync(
      "git branch -r | grep -oP 'origin/release/v[0-9.]+' | sort -V | tail -1",
      { stdio: "pipe" }
    ).toString().trim() || "origin/release/v0.9.0";
    execSync(`git worktree add "${path}" -b "${branch}" "${releaseBranch}"`, { stdio: "inherit" });
  }
  return path;
}

export function removeWorktree(branch: string): void {
  const path = worktreePath(branch);
  try {
    execSync(`git worktree remove --force "${path}"`, { stdio: "pipe" });
  } catch {
    if (existsSync(path)) {
      // delete via SSH as node user (uid 1000 owns files created in container)
      const SSH = `ssh -i /home/agent/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no node@power2plant-app-1`;
      try { execSync(`${SSH} "rm -rf '${path}'"`, { stdio: "pipe" }); } catch { rmSync(path, { recursive: true, force: true }); }
      execSync(`git worktree prune`, { stdio: "pipe" });
    }
  }
  try {
    execSync(`git branch -D "${branch}"`, { stdio: "pipe" });
  } catch {
    // branch may already be gone
  }
}
