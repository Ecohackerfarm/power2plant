import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface TaskState {
  status: TaskStatus;
  role: string;
  branch: string;
  attempts: number;
  modelUsed: string | null;
  pr: string | null;
  worktree: string | null;
  lastLog: string | null;
  pid?: number;
}

export interface OrchestratorState {
  lastRun: string | null;
  tasks: Record<string, TaskState>;
}

const STATE_PATH = join(process.cwd(), "autodev/orchestrate/state.json");

export function loadState(): OrchestratorState {
  if (!existsSync(STATE_PATH)) {
    return { lastRun: null, tasks: {} };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as OrchestratorState;
}

export function saveState(state: OrchestratorState): void {
  const tmp = STATE_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  // atomic rename
  require("fs").renameSync(tmp, STATE_PATH);
}
