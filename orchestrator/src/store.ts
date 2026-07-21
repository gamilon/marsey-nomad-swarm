import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isRunId } from "./ids.js";
import type { Run } from "./types.js";

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

  async save(run: Run): Promise<void> {
    await writeFile(this.fileFor(run.id), JSON.stringify(run, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
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
}
