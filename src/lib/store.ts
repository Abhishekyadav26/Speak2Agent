import { promises as fs } from "fs";
import path from "path";
import type { AgentRecord, RunRecord } from "./agent-schema";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await ensureDir();
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export async function listAgents(): Promise<AgentRecord[]> {
  return readJson<AgentRecord[]>("agents.json", []);
}

export async function saveAgents(agents: AgentRecord[]) {
  await writeJson("agents.json", agents);
}

export async function listRuns(): Promise<RunRecord[]> {
  return readJson<RunRecord[]>("runs.json", []);
}

export async function saveRuns(runs: RunRecord[]) {
  await writeJson("runs.json", runs);
}

/** Sum of live spending today (UTC) for budget enforcement. */
export function spentTodayUsd(runs: RunRecord[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return runs
    .filter((r) => r.mode === "live" && r.createdAt.slice(0, 10) === today && r.status === "succeeded")
    .reduce((a, r) => a + r.totalSpentUsd, 0);
}
