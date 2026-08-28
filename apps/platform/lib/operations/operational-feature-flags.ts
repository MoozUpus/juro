import { z } from "zod";

export const operationalFeatureKeys = [
  "ai_chat",
  "ai_openai_primary",
  "ai_anthropic_fallback",
  "ai_lex_web_discovery",
  "ai_secondary_web_research",
  "document_analysis_upload",
  "lawyer_handoff",
  "voice_mode",
] as const;

export const operationalEnvironments = ["development", "staging", "production"] as const;

export type OperationalFeatureKey = (typeof operationalFeatureKeys)[number];
export type OperationalEnvironment = (typeof operationalEnvironments)[number];
export type OperationalLocale = "ru" | "uz";

export const setOperationalFeatureSchema = z.object({
  key: z.enum(operationalFeatureKeys),
  enabled: z.boolean(),
  reason: z.string().trim().min(10).max(500),
}).strict();

export type OperationalFeatureVersion = {
  id: string;
  environment: OperationalEnvironment;
  key: OperationalFeatureKey;
  version: number;
  enabled: boolean;
  reason: string;
  actorUserId: string | null;
  previousEventHash: string | null;
  eventHash: string | null;
  createdAt: string | null;
};

type StoredOperationalFeatureVersion = Omit<OperationalFeatureVersion, "enabled"> & { enabled: number };

export class OperationalFeatureError extends Error {
  constructor(readonly code:
    | "OPERATIONAL_FEATURE_DISABLED"
    | "OPERATIONAL_FEATURE_INVALID"
    | "OPERATIONAL_FEATURE_NO_CHANGE"
    | "OPERATIONAL_FEATURE_CONFLICT"
    | "OPERATIONAL_FEATURE_INTEGRITY_FAILED") {
    super(code);
    this.name = "OperationalFeatureError";
  }
}

export function operationalEnvironment(value: string | undefined): OperationalEnvironment {
  if (!value || value === "development") return "development";
  if (value === "staging" || value === "production") return value;
  throw new OperationalFeatureError("OPERATIONAL_FEATURE_INVALID");
}

export function operationalLocaleFromRequest(
  request: Request,
  fallback: OperationalLocale = "ru",
): OperationalLocale {
  const explicit = request.headers.get("x-juro-locale")?.trim().toLowerCase();
  if (explicit === "ru" || explicit === "uz") return explicit;
  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      const firstSegment = new URL(referrer).pathname.split("/").filter(Boolean)[0];
      if (firstSegment === "ru" || firstSegment === "uz") return firstSegment;
    } catch {}
  }
  const accepted = request.headers.get("accept-language")?.trim().toLowerCase();
  if (accepted?.startsWith("uz")) return "uz";
  if (accepted?.startsWith("ru")) return "ru";
  return fallback;
}

function canonicalEvent(value: {
  id: string;
  environment: OperationalEnvironment;
  key: OperationalFeatureKey;
  version: number;
  enabled: boolean;
  reason: string;
  actorUserId: string;
  previousEventHash: string | null;
  createdAt: string;
}): string {
  return JSON.stringify({
    id: value.id,
    environment: value.environment,
    key: value.key,
    version: value.version,
    enabled: value.enabled,
    reason: value.reason,
    actorUserId: value.actorUserId,
    previousEventHash: value.previousEventHash,
    createdAt: value.createdAt,
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function publicVersion(row: StoredOperationalFeatureVersion): OperationalFeatureVersion {
  return { ...row, enabled: row.enabled === 1 };
}

async function storedVersions(
  db: D1Database,
  environment: OperationalEnvironment,
  key?: OperationalFeatureKey,
): Promise<StoredOperationalFeatureVersion[]> {
  const where = key ? "WHERE environment=? AND feature_key=?" : "WHERE environment=?";
  const result = await db.prepare(
    `SELECT id,environment,feature_key AS key,version,enabled,reason,
      actor_user_id AS actorUserId,previous_event_hash AS previousEventHash,
      event_hash AS eventHash,created_at AS createdAt
     FROM operational_feature_flag_versions ${where}
     ORDER BY feature_key,version`,
  ).bind(...(key ? [environment, key] : [environment])).all<StoredOperationalFeatureVersion>();
  return result.results;
}

export async function verifyOperationalFeatureHistory(
  db: D1Database,
  environment: OperationalEnvironment,
  key?: OperationalFeatureKey,
): Promise<{ valid: boolean; checked: number }> {
  const rows = await storedVersions(db, environment, key);
  const previousByKey = new Map<OperationalFeatureKey, StoredOperationalFeatureVersion>();
  for (const row of rows) {
    const previous = previousByKey.get(row.key);
    const expectedVersion = (previous?.version ?? 0) + 1;
    const expectedPreviousHash = previous?.eventHash ?? null;
    if (row.version !== expectedVersion || row.previousEventHash !== expectedPreviousHash || !row.createdAt || !row.actorUserId || !row.eventHash) {
      return { valid: false, checked: rows.length };
    }
    const expectedHash = await sha256Hex(canonicalEvent({
      id: row.id,
      environment: row.environment,
      key: row.key,
      version: row.version,
      enabled: row.enabled === 1,
      reason: row.reason,
      actorUserId: row.actorUserId,
      previousEventHash: row.previousEventHash,
      createdAt: row.createdAt,
    }));
    if (expectedHash !== row.eventHash) return { valid: false, checked: rows.length };
    previousByKey.set(row.key, row);
  }
  return { valid: true, checked: rows.length };
}

export async function readOperationalFeatureDashboard(input: {
  db: D1Database;
  environment: OperationalEnvironment;
}): Promise<{ environment: OperationalEnvironment; integrity: { valid: boolean; checked: number }; features: OperationalFeatureVersion[]; history: OperationalFeatureVersion[] }> {
  const rows = await storedVersions(input.db, input.environment);
  const history = rows.map(publicVersion).reverse();
  const latest = new Map<OperationalFeatureKey, OperationalFeatureVersion>();
  for (const row of rows) latest.set(row.key, publicVersion(row));
  const features = operationalFeatureKeys.map((key) => latest.get(key) ?? {
    id: `default:${input.environment}:${key}`,
    environment: input.environment,
    key,
    version: 0,
    enabled: true,
    reason: "Built-in safe default: enabled until an operator records a change.",
    actorUserId: null,
    previousEventHash: null,
    eventHash: null,
    createdAt: null,
  });
  return {
    environment: input.environment,
    integrity: await verifyOperationalFeatureHistory(input.db, input.environment),
    features,
    history,
  };
}

export async function setOperationalFeature(input: {
  db: D1Database;
  environment: OperationalEnvironment;
  actorUserId: string;
  value: z.input<typeof setOperationalFeatureSchema>;
  now?: Date;
}): Promise<OperationalFeatureVersion> {
  const parsed = setOperationalFeatureSchema.safeParse(input.value);
  if (!parsed.success) throw new OperationalFeatureError("OPERATIONAL_FEATURE_INVALID");
  const currentRows = await storedVersions(input.db, input.environment, parsed.data.key);
  const integrity = await verifyOperationalFeatureHistory(input.db, input.environment, parsed.data.key);
  if (!integrity.valid) {
    throw new OperationalFeatureError("OPERATIONAL_FEATURE_INTEGRITY_FAILED");
  }
  const current = currentRows.at(-1);
  if ((current ? current.enabled === 1 : true) === parsed.data.enabled) {
    throw new OperationalFeatureError("OPERATIONAL_FEATURE_NO_CHANGE");
  }
  const id = crypto.randomUUID();
  const createdAt = (input.now ?? new Date()).toISOString();
  const version = (current?.version ?? 0) + 1;
  const previousEventHash = current?.eventHash ?? null;
  const eventHash = await sha256Hex(canonicalEvent({
    id,
    environment: input.environment,
    key: parsed.data.key,
    version,
    enabled: parsed.data.enabled,
    reason: parsed.data.reason,
    actorUserId: input.actorUserId,
    previousEventHash,
    createdAt,
  }));
  try {
    await input.db.prepare(
      `INSERT INTO operational_feature_flag_versions
       (id,environment,feature_key,version,enabled,reason,actor_user_id,previous_event_hash,event_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      input.environment,
      parsed.data.key,
      version,
      parsed.data.enabled ? 1 : 0,
      parsed.data.reason,
      input.actorUserId,
      previousEventHash,
      eventHash,
      createdAt,
    ).run();
  } catch {
    throw new OperationalFeatureError("OPERATIONAL_FEATURE_CONFLICT");
  }
  return {
    id,
    environment: input.environment,
    key: parsed.data.key,
    version,
    enabled: parsed.data.enabled,
    reason: parsed.data.reason,
    actorUserId: input.actorUserId,
    previousEventHash,
    eventHash,
    createdAt,
  };
}

export async function assertOperationalFeatureEnabled(input: {
  db: D1Database;
  environment: OperationalEnvironment;
  key: OperationalFeatureKey;
}): Promise<void> {
  const rows = await storedVersions(input.db, input.environment, input.key);
  if (!rows.length) return;
  const current = rows.at(-1);
  const integrity = await verifyOperationalFeatureHistory(input.db, input.environment, input.key);
  if (!current || !integrity.valid) throw new OperationalFeatureError("OPERATIONAL_FEATURE_INTEGRITY_FAILED");
  if (current.enabled !== 1) throw new OperationalFeatureError("OPERATIONAL_FEATURE_DISABLED");
}

export function operationalFeatureMessage(locale: OperationalLocale): string {
  return locale === "uz"
    ? "Bu funksiya operator tomonidan vaqtincha to‘xtatildi. Ma’lumotlar va limitlar o‘zgarmadi."
    : "Функция временно приостановлена оператором. Данные и лимиты не изменены.";
}
