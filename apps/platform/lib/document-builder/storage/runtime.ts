import { env } from "cloudflare:workers";

export interface BuilderRuntimeEnv {
  ASSETS?: Fetcher;
  DB?: D1Database;
  BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_PROVIDER?: string;
  AI_PROVIDER_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  APP_URL?: string;
  PUBLIC_SITE_URL?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENT_API_KEY?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  ALLOW_PLATFORM_AUTH_HEADERS?: string;
  LEGISLATION_FEED_PROVIDER?: string;
  LEGISLATION_FEED_API_KEY?: string;
  IDENTITY_KEYRING?: string;
  IDENTITY_PROTECTION_MODE?: string;
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
