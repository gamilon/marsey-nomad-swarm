/** One JSON line per event for greppable alloc logs (no goal/handoff bodies). */
export function logEvent(
  fields: Record<string, string | number | boolean | undefined | null>,
): void {
  const line: Record<string, string | number | boolean> = {
    ts: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      line[k] = v;
    }
  }
  console.log(JSON.stringify(line));
}
