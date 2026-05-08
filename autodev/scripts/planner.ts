import { readFileSync } from "fs";
import { join } from "path";
import type { OrchestratorState } from "./state.js";

export interface Task {
  issueNumber: number;
  title: string;
  role: string;
  branch: string;
  body?: string;
}

export function loadTasks(): Task[] {
  const path = join(process.cwd(), "autodev/orchestrate/tasks.json");
  return JSON.parse(readFileSync(path, "utf-8")) as Task[];
}

export function getPendingTasks(tasks: Task[], state: OrchestratorState): Task[] {
  return tasks.filter((t) => {
    const s = state.tasks[String(t.issueNumber)];
    return !s || (s.status !== "done" && s.status !== "failed");
  });
}
