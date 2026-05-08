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
    // Branch from latest release branch so PRs only show feature changes
    const GH_TOKEN = execSync("gh auth token", { stdio: "pipe" }).toString().trim();
    const remote = execSync("git remote get-url origin", { stdio: "pipe" }).toString().trim()
      .replace(/^git@github\.com:/, "https://github.com/");
    const httpsRemote = remote.replace("https://", `https://x-access-token:${GH_TOKEN}@`);
    execSync(`git fetch "${httpsRemote}" "refs/heads/release/v*:refs/remotes/origin/release/v*"`, { stdio: "pipe" });
    const releaseBranch = execSync(
      "git branch -r | grep -o 'release/v[0-9.]*' | sort -V | tail -1",
      { stdio: "pipe" }
    ).toString().trim() || "release/v0.9.0";
    execSync(`git worktree add "${path}" -b "${branch}" "origin/${releaseBranch}"`, { stdio: "inherit" });
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
