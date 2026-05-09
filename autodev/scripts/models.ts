import { readFileSync } from "fs";
import { join } from "path";

export interface ModelsConfig {
  default: string[];
  maxRetries: number;
  maxReviewRounds: number;
  timeoutMinutes: number;
  maxParallel: number;
  schedule: string;
}

export function loadModels(): ModelsConfig {
  const path = join(process.cwd(), "autodev/orchestrate/models.json");
  return JSON.parse(readFileSync(path, "utf-8")) as ModelsConfig;
}

export function getModel(attempt: number, models: string[]): string {
  return models[attempt % models.length];
}
