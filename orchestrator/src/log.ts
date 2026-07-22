export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<
  string,
  string | number | boolean | undefined | null
>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = (env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

let minLevel: LogLevel = resolveMinLevel();

/** Test helper / runtime override. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

/**
 * One JSON line per event for greppable Nomad alloc logs.
 * Never put goals, handoffs, or full request bodies in fields.
 */
export function log(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
    return;
  }
  const line: Record<string, string | number | boolean> = {
    ts: new Date().toISOString(),
    level,
    event,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      line[k] = v;
    }
  }
  const payload = JSON.stringify(line);
  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

export const logDebug = (event: string, fields?: LogFields): void =>
  log("debug", event, fields);
export const logInfo = (event: string, fields?: LogFields): void =>
  log("info", event, fields);
export const logWarn = (event: string, fields?: LogFields): void =>
  log("warn", event, fields);
export const logError = (event: string, fields?: LogFields): void =>
  log("error", event, fields);
