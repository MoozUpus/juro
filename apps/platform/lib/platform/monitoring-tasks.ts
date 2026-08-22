import { activeLawyerWorkspaceParticipant } from "./lawyer-workspace-access";

export type MonitoringTaskCase = {
  id: string;
  title: string;
  clientName: string | null;
  requestId: string | null;
  accessKind: "workspace" | "lawyer_grant";
};

export type MonitoringTaskCreationInput = {
  userId: string;
  workspaceId: string;
  updateId: string;
  caseId: string;
  requestId?: string | null;
  title: string;
  dueDate?: string | null;
  locale: "ru" | "uz";
  now?: string;
};

export type MonitoringTaskCreationResult = {
  taskId: string;
  caseId: string;
  requestId: string | null;
  created: boolean;
};

type MonitoringEventRow = {
  id: string;
  officialUrl: string;
  eventTitle: string;
  changeType: string;
  fingerprint: string;
  detectedAt: string;
  sourceTitle: string;
  sourceIdentifier: string | null;
  sourceLastCheckedAt: string;
};

type MonitoringTaskAccess = {
  workspaceId: string;
  caseId: string;
  requestId: string | null;
  clientUserId: string | null;
  actorRole: "workspace_member" | "lawyer";
};

export class MonitoringTaskError extends Error {
  constructor(
    public readonly code:
      | "CASE_UNAVAILABLE"
      | "MONITORING_UPDATE_UNAVAILABLE"
      | "MONITORING_SOURCE_INVALID",
  ) {
    super(code);
  }
}

function officialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}

function dueAtFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(`${value}T09:00:00+05:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function listMonitoringTaskCases(
  db: D1Database,
  userId: string,
  workspaceId: string,
  now = new Date().toISOString(),
): Promise<MonitoringTaskCase[]> {
  const [workspaceCases, lawyerCases] = await Promise.all([
    db.prepare(
      `SELECT c.id,c.title,NULL AS clientName,NULL AS requestId,'workspace' AS accessKind
       FROM cases c
       WHERE c.workspace_id=? AND c.archived_at IS NULL
       ORDER BY c.updated_at DESC LIMIT 100`,
    ).bind(workspaceId).all<MonitoringTaskCase>(),
    db.prepare(
      `SELECT DISTINCT c.id,c.title,u.full_name AS clientName,r.id AS requestId,
        'lawyer_grant' AS accessKind
       FROM lawyer_access_grants g
       JOIN lawyer_requests r ON r.id=g.lawyer_request_id AND r.case_id=g.case_id
       JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=g.lawyer_user_id
         AND p.status='public_approved' AND p.marketplace_status='public_approved'
       JOIN cases c ON c.id=g.case_id AND c.archived_at IS NULL
       JOIN user_profiles u ON u.id=r.requester_user_id
       WHERE g.lawyer_user_id=? AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at>?)
       ORDER BY c.updated_at DESC LIMIT 100`,
    ).bind(userId, now).all<MonitoringTaskCase>(),
  ]);
  const cases = new Map<string, MonitoringTaskCase>();
  for (const item of workspaceCases.results) cases.set(item.id, item);
  for (const item of lawyerCases.results) {
    if (!cases.has(item.id)) cases.set(item.id, item);
  }
  return [...cases.values()];
}

async function resolveTaskAccess(
  db: D1Database,
  input: MonitoringTaskCreationInput,
  now: string,
): Promise<MonitoringTaskAccess> {
  const owned = await db.prepare(
    `SELECT c.id,c.workspace_id AS workspaceId
     FROM cases c WHERE c.id=? AND c.workspace_id=? AND c.archived_at IS NULL LIMIT 1`,
  ).bind(input.caseId, input.workspaceId).first<{ id: string; workspaceId: string }>();
  if (owned) {
    return {
      workspaceId: owned.workspaceId,
      caseId: owned.id,
      requestId: null,
      clientUserId: null,
      actorRole: "workspace_member",
    };
  }
  if (!input.requestId) throw new MonitoringTaskError("CASE_UNAVAILABLE");
  const participant = await activeLawyerWorkspaceParticipant(
    db,
    input.userId,
    input.requestId,
    now,
  );
  if (!participant || participant.role !== "lawyer" || participant.caseId !== input.caseId) {
    throw new MonitoringTaskError("CASE_UNAVAILABLE");
  }
  return {
    workspaceId: participant.workspaceId,
    caseId: participant.caseId,
    requestId: participant.requestId,
    clientUserId: participant.clientUserId,
    actorRole: "lawyer",
  };
}

export async function createMonitoringTaskFromChange(
  db: D1Database,
  input: MonitoringTaskCreationInput,
): Promise<MonitoringTaskCreationResult> {
  const now = input.now ?? new Date().toISOString();
  const [access, event] = await Promise.all([
    resolveTaskAccess(db, input, now),
    db.prepare(
      `SELECT e.id,e.canonical_url AS officialUrl,e.act_title AS eventTitle,
        e.change_type AS changeType,e.fingerprint,e.detected_at AS detectedAt,
        m.act_title AS sourceTitle,m.canonical_id AS sourceIdentifier,
        m.last_checked_at AS sourceLastCheckedAt
       FROM legal_monitoring_change_events e
       JOIN legal_monitoring_metadata m ON m.id=e.metadata_id
       WHERE e.id=? AND m.http_status BETWEEN 200 AND 299
         AND m.last_error_code IS NULL LIMIT 1`,
    ).bind(input.updateId).first<MonitoringEventRow>(),
  ]);
  if (!event) throw new MonitoringTaskError("MONITORING_UPDATE_UNAVAILABLE");
  if (!officialLexUrl(event.officialUrl)) {
    throw new MonitoringTaskError("MONITORING_SOURCE_INVALID");
  }

  const existing = await db.prepare(
    `SELECT task_id AS taskId FROM monitoring_task_sources
     WHERE case_id=? AND change_event_id=? AND created_by_user_id=? LIMIT 1`,
  ).bind(access.caseId, event.id, input.userId).first<{ taskId: string }>();
  if (existing) {
    return {
      taskId: existing.taskId,
      caseId: access.caseId,
      requestId: access.requestId,
      created: false,
    };
  }

  const taskId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const dueAt = dueAtFromDate(input.dueDate);
  const description = input.locale === "ru"
    ? `Проверить официальный акт и оценить влияние обнаруженного metadata-изменения Lex.uz на дело. Источник: ${event.officialUrl}`
    : `Rasmiy hujjatni tekshirish va Lex.uz metadata o‘zgarishining ishga ta’sirini baholash. Manba: ${event.officialUrl}`;
  const evidence = {
    schemaVersion: 1,
    evidenceKind: "lex_metadata_monitor",
    changeEventId: event.id,
    officialUrl: event.officialUrl,
    sourceIdentifier: event.sourceIdentifier,
    sourceTitle: event.sourceTitle,
    changeType: event.changeType,
    fingerprint: event.fingerprint,
    detectedAt: event.detectedAt,
    sourceLastCheckedAt: event.sourceLastCheckedAt,
  };
  const auditMetadata = {
    source: "legal_monitoring_change_event",
    updateId: event.id,
    officialUrl: event.officialUrl,
    requestId: access.requestId,
    actorRole: access.actorRole,
  };
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO tasks
        (id,workspace_id,case_id,plan_step_id,owner_user_id,title,description,
         legal_basis,source_date,due_at,deadline_type,status,created_at,updated_at,completed_at)
       VALUES (?,?,?,NULL,?,?,?,?,?,?,'calendar_days','planned',?,?,NULL)`,
    ).bind(
      taskId,
      access.workspaceId,
      access.caseId,
      input.userId,
      input.title.trim(),
      description,
      event.officialUrl,
      event.detectedAt,
      dueAt,
      now,
      now,
    ),
    db.prepare(
      `INSERT INTO monitoring_task_sources
        (id,task_id,workspace_id,case_id,change_event_id,created_by_user_id,
         official_url,source_title,source_identifier,source_detected_at,
         source_last_checked_at,snapshot_json,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      evidenceId,
      taskId,
      access.workspaceId,
      access.caseId,
      event.id,
      input.userId,
      event.officialUrl,
      event.sourceTitle,
      event.sourceIdentifier,
      event.detectedAt,
      event.sourceLastCheckedAt,
      JSON.stringify(evidence),
      now,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'task',?,'monitoring_task_created',?,?)`,
    ).bind(crypto.randomUUID(), access.workspaceId, input.userId, taskId, JSON.stringify(auditMetadata), now),
    db.prepare(
      `INSERT INTO case_events
        (id,case_id,actor_user_id,event_type,metadata_json,created_at)
       VALUES (?,?,?,'monitoring_task_created',?,?)`,
    ).bind(crypto.randomUUID(), access.caseId, input.userId, JSON.stringify({ ...auditMetadata, taskId }), now),
  ];
  if (access.actorRole === "lawyer" && access.clientUserId) {
    statements.push(db.prepare(
      `INSERT INTO notifications
        (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       VALUES (?,?,?,NULL,'case_task',?,'monitoring_task_created',?,?,NULL,?)`,
    ).bind(
      crypto.randomUUID(),
      access.workspaceId,
      access.clientUserId,
      access.caseId,
      input.locale === "ru" ? "Юрист создал задачу по изменению законодательства" : "Yurist qonunchilik o‘zgarishi bo‘yicha vazifa yaratdi",
      input.title.trim(),
      now,
    ));
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await db.prepare(
      `SELECT task_id AS taskId FROM monitoring_task_sources
       WHERE case_id=? AND change_event_id=? AND created_by_user_id=? LIMIT 1`,
    ).bind(access.caseId, event.id, input.userId).first<{ taskId: string }>();
    if (!raced) throw error;
    return {
      taskId: raced.taskId,
      caseId: access.caseId,
      requestId: access.requestId,
      created: false,
    };
  }
  return {
    taskId,
    caseId: access.caseId,
    requestId: access.requestId,
    created: true,
  };
}
