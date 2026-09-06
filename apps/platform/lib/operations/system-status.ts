import { z } from "zod";
import {
  deriveComponentHealth,
  readDependencyHealth,
} from "./dependency-health";
import type {
  DependencyHealthEvidenceKind,
  DependencyHealthEnvironment,
  DependencyHealthKey,
  DependencyHealthSnapshot,
  DependencyHealthState,
} from "./dependency-health";
import type { PlatformLocale } from "../platform/routing";

export const statusComponentKeys = [
  "platform",
  "otp",
  "ai",
  "document_analysis",
  "upload",
  "document_builder",
  "email",
  "lawyer_area",
] as const;

export const statusImpactValues = [
  "degraded",
  "partial_outage",
  "outage",
  "maintenance",
] as const;

export const statusIncidentStates = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;

export type StatusComponentKey = (typeof statusComponentKeys)[number];
export type StatusImpact = (typeof statusImpactValues)[number];
export type StatusIncidentState = (typeof statusIncidentStates)[number];
export type PublicComponentState = DependencyHealthState;
export type StatusLocale = PlatformLocale;

const componentMutationSchema = z.object({
  key: z.enum(statusComponentKeys),
  impact: z.enum(statusImpactValues),
}).strict();

export const createStatusIncidentSchema = z.object({
  titleRu: z.string().trim().min(3).max(140),
  titleUz: z.string().trim().min(3).max(140),
  titleEn: z.string().trim().min(3).max(140),
  summaryRu: z.string().trim().min(10).max(2_000),
  summaryUz: z.string().trim().min(10).max(2_000),
  summaryEn: z.string().trim().min(10).max(2_000),
  messageRu: z.string().trim().min(10).max(2_000),
  messageUz: z.string().trim().min(10).max(2_000),
  messageEn: z.string().trim().min(10).max(2_000),
  startedAt: z.string().datetime({ offset: true }),
  components: z.array(componentMutationSchema).min(1).max(statusComponentKeys.length),
}).strict().superRefine((value, context) => {
  const keys = new Set(value.components.map((component) => component.key));
  if (keys.size !== value.components.length) {
    context.addIssue({ code: "custom", path: ["components"], message: "DUPLICATE_COMPONENT" });
  }
});

export const appendStatusUpdateSchema = z.object({
  incidentId: z.string().uuid(),
  state: z.enum(["identified", "monitoring", "resolved"]),
  messageRu: z.string().trim().min(10).max(2_000),
  messageUz: z.string().trim().min(10).max(2_000),
  messageEn: z.string().trim().min(10).max(2_000),
}).strict();

const impactRank: Readonly<Record<StatusImpact, number>> = {
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  outage: 4,
};

const publicStateRank: Readonly<Record<PublicComponentState, number>> = {
  operational: 0,
  // Keep the public aggregate aligned with dependency aggregation: an
  // unverified required dependency must never be hidden by stale evidence.
  stale: 1,
  unknown: 2,
  maintenance: 3,
  degraded: 4,
  partial_outage: 5,
  outage: 6,
};

const componentLabels: Readonly<Record<StatusComponentKey, Record<StatusLocale, string>>> = {
  platform: { ru: "Платформа", uz: "Platforma", en: "Platform" },
  otp: { ru: "Вход и OTP", uz: "Kirish va OTP", en: "Sign-in and OTP" },
  ai: { ru: "AI-юрист", uz: "AI-yurist", en: "AI legal assistant" },
  document_analysis: { ru: "Анализ документов", uz: "Hujjatlarni tahlil qilish", en: "Document analysis" },
  upload: { ru: "Загрузка файлов", uz: "Fayllarni yuklash", en: "File uploads" },
  document_builder: { ru: "Конструктор документов", uz: "Hujjat konstruktori", en: "Document builder" },
  email: { ru: "Email-уведомления", uz: "Email bildirishnomalari", en: "Email notifications" },
  lawyer_area: { ru: "Работа с юристами", uz: "Yuristlar bilan ishlash", en: "Lawyer services" },
};

const dependencyLabels: Readonly<Record<DependencyHealthKey, Record<StatusLocale, string>>> = {
  d1: { ru: "База данных", uz: "Ma’lumotlar bazasi", en: "Database" },
  private_r2: { ru: "Защищённое хранилище файлов", uz: "Himoyalangan fayl ombori", en: "Secure file storage" },
  queues: { ru: "Фоновые очереди", uz: "Fon navbatlari", en: "Background queues" },
  queue_dlq: { ru: "Очередь ошибок", uz: "Xatolar navbati", en: "Failed jobs queue" },
  malware_scanner: { ru: "Проверка файлов", uz: "Fayllarni tekshirish", en: "File security scanning" },
  openai: { ru: "AI-провайдер OpenAI", uz: "OpenAI AI-provayderi", en: "OpenAI provider" },
  anthropic: { ru: "AI-провайдер Anthropic", uz: "Anthropic AI-provayderi", en: "Anthropic provider" },
  resend: { ru: "Сервис email", uz: "Email xizmati", en: "Email delivery" },
  legal_source_sync: { ru: "Синхронизация правовых источников", uz: "Huquqiy manbalar sinxronizatsiyasi", en: "Legal source synchronisation" },
  document_analysis: { ru: "Обработка анализа документов", uz: "Hujjat tahlilini qayta ishlash", en: "Document analysis processing" },
  document_builder: { ru: "Генерация документов", uz: "Hujjatlarni yaratish", en: "Document generation" },
  lawyer_area: { ru: "Передача юристу", uz: "Yuristga yuborish", en: "Lawyer handoff" },
};

type IncidentRow = {
  id: string;
  publicReference: string;
  state: StatusIncidentState;
  severity: StatusImpact;
  titleRu: string;
  titleUz: string;
  titleEn: string | null;
  summaryRu: string;
  summaryUz: string;
  summaryEn: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ComponentRow = {
  incidentId: string;
  key: StatusComponentKey;
  impact: StatusImpact;
};

type UpdateRow = {
  id: string;
  incidentId: string;
  state: StatusIncidentState;
  messageRu: string;
  messageUz: string;
  messageEn: string | null;
  createdAt: string;
};

export type PublicStatusIncident = {
  reference: string;
  state: StatusIncidentState;
  severity: StatusImpact;
  title: string;
  summary: string;
  startedAt: string;
  resolvedAt: string | null;
  components: Array<{ key: StatusComponentKey; label: string; impact: StatusImpact }>;
  updates: Array<{ state: StatusIncidentState; message: string; createdAt: string }>;
};

export type PublicStatusSnapshot = {
  overallStatus: PublicComponentState;
  generatedAt: string;
  lastIncidentUpdateAt: string | null;
  components: Array<{
    key: StatusComponentKey;
    label: string;
    status: PublicComponentState;
    lastCheckedAt: string | null;
    lastSuccessfulAt: string | null;
    checkAgeMs: number | null;
    dependencies: Array<{
      key: DependencyHealthKey;
      label: string;
      status: DependencyHealthState;
      checkedAt: string | null;
      checkAgeMs: number | null;
      latencyMs: number | null;
      safeErrorCode: string | null;
      evidenceKind: DependencyHealthEvidenceKind | null;
    }>;
  }>;
  activeIncidents: PublicStatusIncident[];
  recentIncidents: PublicStatusIncident[];
};

export type StatusIncidentAdminView = IncidentRow & {
  components: Array<{ key: StatusComponentKey; impact: StatusImpact }>;
  updates: UpdateRow[];
};

export type StatusIncidentAdminDashboard = {
  incidents: StatusIncidentAdminView[];
  dependencies: DependencyHealthSnapshot[];
  generatedAt: string;
};

const privateProviderDiagnosticCodes = new Set([
  "PROVIDER_CREDIT_BALANCE_LOW",
  "PROVIDER_SPEND_LIMIT_REACHED",
  "PROVIDER_BILLING_CONFIGURATION",
  "PROVIDER_WORKSPACE_CONFIGURATION",
  "PROVIDER_REQUEST_CONFIGURATION",
]);

function publicSafeErrorCode(code: string | null): string | null {
  return code && privateProviderDiagnosticCodes.has(code) ? "PROVIDER_UNAVAILABLE" : code;
}

export class SystemStatusError extends Error {
  constructor(readonly code:
    | "SYSTEM_STATUS_INVALID"
    | "SYSTEM_STATUS_INCIDENT_NOT_FOUND"
    | "SYSTEM_STATUS_TRANSITION_INVALID"
    | "SYSTEM_STATUS_CONFLICT"
    | "SYSTEM_STATUS_PERSISTENCE_FAILED") {
    super(code);
    this.name = "SystemStatusError";
  }
}

function canonicalTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new SystemStatusError("SYSTEM_STATUS_INVALID");
  return new Date(timestamp).toISOString();
}

function publicReference(): string {
  return `INC-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function highestImpact(values: readonly StatusImpact[]): StatusImpact {
  const [first, ...rest] = values;
  if (!first) throw new SystemStatusError("SYSTEM_STATUS_INVALID");
  return rest.reduce<StatusImpact>(
    (current, value) => impactRank[value] > impactRank[current] ? value : current,
    first,
  );
}

function highestPublicState(values: readonly PublicComponentState[]): PublicComponentState {
  return values.reduce<PublicComponentState>(
    (current, value) => publicStateRank[value] > publicStateRank[current] ? value : current,
    "operational",
  );
}

function unknownDependency(key: DependencyHealthKey): DependencyHealthSnapshot {
  return {
    key,
    state: "unknown",
    recordedState: null,
    checkedAt: null,
    lastSuccessfulAt: null,
    checkAgeMs: null,
    latencyMs: null,
    safeErrorCode: null,
    evidenceKind: null,
  };
}

function validTransition(from: StatusIncidentState, to: StatusIncidentState): boolean {
  if (from === "investigating") return to === "identified" || to === "monitoring" || to === "resolved";
  if (from === "identified") return to === "monitoring" || to === "resolved";
  if (from === "monitoring") return to === "resolved";
  return false;
}

async function readRows(db: D1Database): Promise<{
  incidents: IncidentRow[];
  components: ComponentRow[];
  updates: UpdateRow[];
}> {
  const recent = `SELECT id FROM system_status_incidents ORDER BY started_at DESC,id DESC LIMIT 50`;
  const [incidentResult, componentResult, updateResult] = await db.batch([
    db.prepare(
      `SELECT id,public_reference AS publicReference,state,severity,title_ru AS titleRu,
        title_uz AS titleUz,title_en AS titleEn,summary_ru AS summaryRu,
        summary_uz AS summaryUz,summary_en AS summaryEn,
        started_at AS startedAt,resolved_at AS resolvedAt,created_at AS createdAt,
        updated_at AS updatedAt
       FROM system_status_incidents ORDER BY started_at DESC,id DESC LIMIT 50`,
    ),
    db.prepare(
      `SELECT incident_id AS incidentId,component_key AS key,impact
       FROM system_status_incident_components WHERE incident_id IN (${recent})
       ORDER BY incident_id,component_key`,
    ),
    db.prepare(
      `SELECT id,incident_id AS incidentId,state,message_ru AS messageRu,
        message_uz AS messageUz,message_en AS messageEn,created_at AS createdAt
       FROM system_status_updates WHERE incident_id IN (${recent})
       ORDER BY created_at DESC,id DESC`,
    ),
  ]);
  return {
    incidents: incidentResult.results as unknown as IncidentRow[],
    components: componentResult.results as unknown as ComponentRow[],
    updates: updateResult.results as unknown as UpdateRow[],
  };
}

export async function readStatusIncidentAdminDashboard(input: {
  db: D1Database;
  environment: DependencyHealthEnvironment;
  now?: Date;
}): Promise<StatusIncidentAdminDashboard> {
  const now = input.now ?? new Date();
  const [rows, dependencies] = await Promise.all([
    readRows(input.db),
    readDependencyHealth({ db: input.db, environment: input.environment, now }),
  ]);
  return {
    incidents: rows.incidents.map((incident) => ({
      ...incident,
      components: rows.components
        .filter((component) => component.incidentId === incident.id)
        .map(({ key, impact }) => ({ key, impact })),
      updates: rows.updates.filter((update) => update.incidentId === incident.id),
    })),
    dependencies,
    generatedAt: now.toISOString(),
  };
}

export async function readPublicStatus(input: {
  db: D1Database;
  locale: StatusLocale;
  environment: DependencyHealthEnvironment;
  now?: Date;
}): Promise<PublicStatusSnapshot> {
  const now = input.now ?? new Date();
  const [rows, dependencyHealth] = await Promise.all([
    readRows(input.db),
    readDependencyHealth({
      db: input.db,
      environment: input.environment,
      now,
    }),
  ]);
  const componentHealth = deriveComponentHealth(dependencyHealth);
  const componentHealthByKey = new Map(componentHealth.map((component) => [component.key, component]));
  const dependencyHealthByKey = new Map(dependencyHealth.map((dependency) => [dependency.key, dependency]));
  const statusByComponent = new Map<StatusComponentKey, PublicComponentState>(
    componentHealth.map((component) => [component.key, component.status]),
  );

  // A staffed incident is an explicit operations decision. It intentionally
  // overrides automatic evidence for its component until the incident resolves.
  const manualImpactByComponent = new Map<StatusComponentKey, StatusImpact>();
  for (const component of rows.components) {
    const incident = rows.incidents.find((item) => item.id === component.incidentId);
    if (!incident || incident.state === "resolved") continue;
    const current = manualImpactByComponent.get(component.key);
    manualImpactByComponent.set(
      component.key,
      current ? highestImpact([current, component.impact]) : component.impact,
    );
  }
  for (const [key, impact] of manualImpactByComponent) {
    statusByComponent.set(key, impact);
  }

  const projectIncident = (incident: IncidentRow): PublicStatusIncident => ({
    reference: incident.publicReference,
    state: incident.state,
    severity: incident.severity,
    title: input.locale === "ru"
      ? incident.titleRu
      : input.locale === "uz"
        ? incident.titleUz
        : incident.titleEn ?? "Incident details are not available in English.",
    summary: input.locale === "ru"
      ? incident.summaryRu
      : input.locale === "uz"
        ? incident.summaryUz
        : incident.summaryEn ?? "This legacy incident was published before English status updates were introduced.",
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    components: rows.components
      .filter((component) => component.incidentId === incident.id)
      .map((component) => ({
        key: component.key,
        label: componentLabels[component.key][input.locale],
        impact: component.impact,
      })),
    updates: rows.updates
      .filter((update) => update.incidentId === incident.id)
      .slice(0, 20)
      .map((update) => ({
        state: update.state,
        message: input.locale === "ru"
          ? update.messageRu
          : input.locale === "uz"
            ? update.messageUz
            : update.messageEn ?? "This legacy update is not available in English.",
        createdAt: update.createdAt,
      })),
  });
  const active = rows.incidents.filter((incident) => incident.state !== "resolved");
  const recent = rows.incidents.filter((incident) => incident.state === "resolved").slice(0, 10);
  const lastIncidentUpdateAt = rows.incidents.reduce<string | null>(
    (latest, incident) => !latest || incident.updatedAt > latest ? incident.updatedAt : latest,
    null,
  );
  const components = statusComponentKeys.map((key) => {
    const health = componentHealthByKey.get(key);
    const dependencies = (health?.dependencyKeys ?? []).map((dependencyKey) => {
      const dependency = dependencyHealthByKey.get(dependencyKey) ?? unknownDependency(dependencyKey);
      return {
        key: dependency.key,
        label: dependencyLabels[dependency.key][input.locale],
        status: dependency.state,
        checkedAt: dependency.checkedAt,
        checkAgeMs: dependency.checkAgeMs,
        latencyMs: dependency.latencyMs,
        safeErrorCode: publicSafeErrorCode(dependency.safeErrorCode),
        evidenceKind: dependency.evidenceKind,
      };
    });
    return {
      key,
      label: componentLabels[key][input.locale],
      status: statusByComponent.get(key) ?? "unknown",
      lastCheckedAt: health?.lastCheckedAt ?? null,
      lastSuccessfulAt: health?.lastSuccessfulAt ?? null,
      checkAgeMs: health?.checkAgeMs ?? null,
      dependencies,
    };
  });
  return {
    overallStatus: highestPublicState(components.map((component) => component.status)),
    generatedAt: now.toISOString(),
    lastIncidentUpdateAt,
    components,
    activeIncidents: active.map(projectIncident),
    recentIncidents: recent.map(projectIncident),
  };
}

export async function createStatusIncident(input: {
  db: D1Database;
  actorUserId: string;
  value: z.input<typeof createStatusIncidentSchema>;
  now?: Date;
}): Promise<{ id: string; publicReference: string }> {
  const value = createStatusIncidentSchema.parse(input.value);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const startedAt = canonicalTimestamp(value.startedAt);
  if (Date.parse(startedAt) > now.getTime() + 5 * 60_000) {
    throw new SystemStatusError("SYSTEM_STATUS_INVALID");
  }
  const id = crypto.randomUUID();
  const updateId = crypto.randomUUID();
  const reference = publicReference();
  const severity = highestImpact(value.components.map((component) => component.impact));
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO system_status_incidents
         (id,public_reference,state,severity,
          title_ru,title_uz,title_en,summary_ru,summary_uz,summary_en,
          current_update_id,started_at,resolved_at,created_by_user_id,created_at,updated_at)
         VALUES (?,?,'investigating',?, ?,?,?, ?,?,?, ?,?,NULL, ?,?,?)`,
      ).bind(
        id,
        reference,
        severity,
        value.titleRu,
        value.titleUz,
        value.titleEn,
        value.summaryRu,
        value.summaryUz,
        value.summaryEn,
        updateId,
        startedAt,
        input.actorUserId,
        nowIso,
        nowIso,
      ),
      ...value.components.map((component) => input.db.prepare(
        `INSERT INTO system_status_incident_components
         (incident_id,component_key,impact,created_at) VALUES (?,?,?,?)`,
      ).bind(id, component.key, component.impact, nowIso)),
      input.db.prepare(
        `INSERT INTO system_status_updates
         (id,incident_id,state,message_ru,message_uz,message_en,created_by_user_id,created_at)
         VALUES (?,?,'investigating',?,?,?,?,?)`,
      ).bind(updateId, id, value.messageRu, value.messageUz, value.messageEn, input.actorUserId, nowIso),
    ]);
  } catch {
    throw new SystemStatusError("SYSTEM_STATUS_PERSISTENCE_FAILED");
  }
  return { id, publicReference: reference };
}

export async function appendStatusIncidentUpdate(input: {
  db: D1Database;
  actorUserId: string;
  value: z.input<typeof appendStatusUpdateSchema>;
  now?: Date;
}): Promise<{ changed: boolean }> {
  const value = appendStatusUpdateSchema.parse(input.value);
  const current = await input.db.prepare(
    `SELECT state FROM system_status_incidents WHERE id=? LIMIT 1`,
  ).bind(value.incidentId).first<{ state: StatusIncidentState }>();
  if (!current) throw new SystemStatusError("SYSTEM_STATUS_INCIDENT_NOT_FOUND");
  if (!validTransition(current.state, value.state)) {
    throw new SystemStatusError("SYSTEM_STATUS_TRANSITION_INVALID");
  }
  const now = (input.now ?? new Date()).toISOString();
  const updateId = crypto.randomUUID();
  try {
    await input.db.batch([
      input.db.prepare(
        `UPDATE system_status_incidents SET state=?,current_update_id=?,
          resolved_at=?,updated_at=? WHERE id=? AND state=?`,
      ).bind(
        value.state,
        updateId,
        value.state === "resolved" ? now : null,
        now,
        value.incidentId,
        current.state,
      ),
      input.db.prepare(
        `INSERT INTO system_status_updates
         (id,incident_id,state,message_ru,message_uz,message_en,created_by_user_id,created_at)
         SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (
           SELECT 1 FROM system_status_incidents WHERE id=? AND current_update_id=?
         )`,
      ).bind(
        updateId,
        value.incidentId,
        value.state,
        value.messageRu,
        value.messageUz,
        value.messageEn,
        input.actorUserId,
        now,
        value.incidentId,
        updateId,
      ),
    ]);
  } catch {
    throw new SystemStatusError("SYSTEM_STATUS_PERSISTENCE_FAILED");
  }
  const changed = await input.db.prepare(
    `SELECT 1 AS value FROM system_status_incidents WHERE id=? AND current_update_id=? LIMIT 1`,
  ).bind(value.incidentId, updateId).first<{ value: number }>();
  if (!changed) throw new SystemStatusError("SYSTEM_STATUS_CONFLICT");
  return { changed: true };
}
