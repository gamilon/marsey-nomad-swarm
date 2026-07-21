export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_MAX_GOAL_CHARS = 8 * 1024;
export const DEFAULT_MAX_METADATA_KEYS = 32;

export async function readJsonBody(
  req: AsyncIterable<Uint8Array | Buffer | string>,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === "string"
        ? Buffer.from(chunk)
        : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

export interface CreateRunBody {
  goal: string;
  metadata: Record<string, unknown>;
}

export function parseCreateRunBody(
  body: unknown,
  maxGoalChars: number = DEFAULT_MAX_GOAL_CHARS,
  maxMetadataKeys: number = DEFAULT_MAX_METADATA_KEYS,
): CreateRunBody | { error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body must be a JSON object" };
  }
  const obj = body as Record<string, unknown>;
  if (!obj.goal || typeof obj.goal !== "string") {
    return { error: "goal (string) is required" };
  }
  if (obj.goal.trim().length === 0) {
    return { error: "goal must not be empty" };
  }
  if (obj.goal.length > maxGoalChars) {
    return { error: `goal exceeds ${maxGoalChars} characters` };
  }

  let metadata: Record<string, unknown> = {};
  if (obj.metadata !== undefined) {
    if (
      obj.metadata === null ||
      typeof obj.metadata !== "object" ||
      Array.isArray(obj.metadata)
    ) {
      return { error: "metadata must be a JSON object" };
    }
    metadata = obj.metadata as Record<string, unknown>;
    if (Object.keys(metadata).length > maxMetadataKeys) {
      return { error: `metadata exceeds ${maxMetadataKeys} keys` };
    }
  }

  return { goal: obj.goal, metadata };
}
