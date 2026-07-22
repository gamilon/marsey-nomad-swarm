import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isRunId } from "./ids.js";
import type { Run, RunSummary } from "./types.js";

const DEFAULT_LIST_LIMIT = 50;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export class RunStore {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private fileFor(id: string): string {
    if (!isRunId(id)) {
      throw new Error("invalid run id");
    }
    return path.join(this.dir, `${id}.json`);
  }

  /**
   * Persist a run. Refuses to clobber a terminal status with a non-terminal
   * (or different terminal) update — protects cancel vs in-flight execute races.
   * Returns false if the write was skipped.
   */
  async save(run: Run): Promise<boolean> {
    const existing = await this.get(run.id);
    if (existing && TERMINAL.has(existing.status) && existing.status !== run.status) {
      return false;
    }
    await writeFile(this.fileFor(run.id), JSON.stringify(run, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return true;
  }

  async get(id: string): Promise<Run | null> {
    if (!isRunId(id)) {
      return null;
    }
    try {
      const raw = await readFile(this.fileFor(id), "utf8");
      return JSON.parse(raw) as Run;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async listIds(): Promise<string[]> {
    const names = await readdir(this.dir);
    return names
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/, ""))
      .filter(isRunId);
  }

  /** Newest-first summaries; goal truncated for list views. */
  async listSummaries(limit: number = DEFAULT_LIST_LIMIT): Promise<RunSummary[]> {
    const ids = await this.listIds();
    const runs: Run[] = [];
    for (const id of ids) {
      const run = await this.get(id);
      if (run) {
        runs.push(run);
      }
    }
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return runs.slice(0, Math.max(0, limit)).map((run) => ({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      goal: truncate(run.goal, 120),
    }));
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
