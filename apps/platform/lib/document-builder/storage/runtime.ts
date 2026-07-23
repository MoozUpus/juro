import { env } from "cloudflare:workers";

export interface BuilderRuntimeEnv {
  ASSETS?: Fetcher;
  DB?: D1Database;
  BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export class ServiceUnavailableError extends Error {
  readonly code: "D1_UNAVAILABLE" | "R2_UNAVAILABLE";

  constructor(code: "D1_UNAVAILABLE" | "R2_UNAVAILABLE", message: string) {
    super(message);
    this.name = "ServiceUnavailableError";
    this.code = code;
  }
}

export function runtimeEnv(): BuilderRuntimeEnv {
  return env as unknown as BuilderRuntimeEnv;
}

export function requireD1(): D1Database {
  const db = runtimeEnv().DB;
  if (!db) {
    throw new ServiceUnavailableError(
      "D1_UNAVAILABLE",
      "Хранилище документов временно недоступно: отсутствует Cloudflare D1 binding DB.",
    );
  }
  return db;
}

export function requireR2(): R2Bucket {
  const bucket = runtimeEnv().BUCKET;
  if (!bucket) {
    throw new ServiceUnavailableError(
      "R2_UNAVAILABLE",
      "Файловое хранилище временно недоступно: отсутствует Cloudflare R2 binding BUCKET.",
    );
  }
  return bucket;
}
