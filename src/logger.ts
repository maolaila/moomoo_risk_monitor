import path from "node:path";
import { appendJsonl, ensureDir, nowIso } from "./utils";

export class Logger {
  constructor(private readonly dataDir: string) {}

  async ensure(): Promise<void> {
    await ensureDir(path.join(this.dataDir, "logs"));
  }

  async info(message: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.write("info", message, meta);
  }

  async warn(message: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.write("warn", message, meta);
  }

  async error(message: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.write("error", message, meta);
  }

  private async write(level: string, message: string, meta: Record<string, unknown>): Promise<void> {
    await appendJsonl(path.join(this.dataDir, "logs", `${nowIso().slice(0, 10)}.jsonl`), {
      timestamp: nowIso(),
      level,
      message,
      meta: maskSecrets(meta)
    });
  }
}

function maskSecrets(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }
  if (typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/key|secret|token|password|pass|account|accid|private/i.test(key)) {
      output[key] = "[masked]";
    } else {
      output[key] = maskSecrets(item);
    }
  }
  return output;
}
