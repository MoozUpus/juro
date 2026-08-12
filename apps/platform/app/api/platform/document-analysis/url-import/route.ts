import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { parseJsonRequest, type JsonRequestError } from "../../../../../lib/auth/input";
import { requireD1, requireQuarantineR2, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { ArchiveInspectionError, verifyArchiveBytes } from "../../../../../lib/document-analysis/archive-inspector";
import {
  arrayBufferHex,
  DocumentAnalysisUploadError,
  hashUploadIntent,
  initializeDocumentAnalysisUpload,
  parseDocumentAnalysisUploadIntent,
  parseUploadIdempotencyKey,
  validateUploadMagicBytes,
} from "../../../../../lib/document-analysis/upload-pipeline";
import {
  fetchPublicDocumentToQuarantine,
  parsePublicDocumentUrlIntent,
  publicDocumentUrlIntentSchema,
  PublicDocumentUrlError,
} from "../../../../../lib/document-analysis/url-import";
import {
  publicDocumentUrlImportDisabledMessage,
  publicDocumentUrlImportEnabled,
} from "../../../../../lib/document-analysis/public-url-import-feature";
import { workspaceForUser } from "../../../../../lib/platform/workspace";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  operationalFeatureMessage,
  operationalLocaleFromRequest,
  OperationalFeatureError,
} from "../../../../../lib/operations/operational-feature-flags";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function invalidRequestResponse(error: JsonRequestError): Response {
  if (error === "invalid_content_type") return response({ code: "INVALID_CONTENT_TYPE", error: "Импорт ссылки принимает только JSON." }, 415);
  if (error === "payload_too_large") return response({ code: "PAYLOAD_TOO_LARGE", error: "Параметры ссылки превышают допустимый размер." }, 413);
  return response({ code: "INVALID_INPUT", error: "Проверьте публичную ссылку и параметры анализа." }, 400);
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const environment = runtimeEnv();
  if (!publicDocumentUrlImportEnabled(environment.PUBLIC_DOCUMENT_URL_IMPORT_ENABLED)) {
    return response({
      code: "PUBLIC_DOCUMENT_URL_IMPORT_DISABLED",
      error: publicDocumentUrlImportDisabledMessage(operationalLocaleFromRequest(request)),
    }, 503);
  }
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, publicDocumentUrlIntentSchema, 4_096);
  if (!parsed.ok) return invalidRequestResponse(parsed.error);
  const db = requireD1();
  try {
    await assertOperationalFeatureEnabled({ db, environment: operationalEnvironment(environment.APP_ENV), key: "document_analysis_upload" });
  } catch (error) {
    if (!(error instanceof OperationalFeatureError)) throw error;
    return response({ code: error.code, error: operationalFeatureMessage(parsed.data.locale) }, 503);
  }
  const bucket = requireQuarantineR2();
  let temporaryKey: string | null = null;
  let uncommittedFinalKey: string | null = null;
  let recoverableAnalysisId: string | null = null;
  try {
    const input = parsePublicDocumentUrlIntent(parsed.data);
    if (input.caseId) {
      const targetCase = await db.prepare(
        "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
      ).bind(input.caseId, workspace.id).first<{ id: string }>();
      if (!targetCase) return response({ code: "CASE_UNAVAILABLE", error: "Дело недоступно." }, 404);
    }
    const idempotencyKey = parseUploadIdempotencyKey(request.headers.get("idempotency-key"));
    const remote = await fetchPublicDocumentToQuarantine({
      bucket,
      workspaceId: workspace.id,
      userId: user.id,
      url: input.url,
    });
    temporaryKey = remote.temporaryKey;
    await verifyStoredInput(bucket, remote.temporaryKey, remote.mimeType, remote.sizeBytes);
    const uploadIntent = parseDocumentAnalysisUploadIntent({
      fileName: remote.fileName,
      mimeType: remote.mimeType,
      sizeBytes: remote.sizeBytes,
      sha256: remote.sha256,
      locale: input.locale,
      mode: input.mode,
      caseId: input.caseId,
      consent: input.consent,
    });
    const requestHash = await hashUrlImportIntent(await hashUploadIntent(uploadIntent), remote.sourceUrlSha256);
    const initialized = await initializeDocumentAnalysisUpload({
      db,
      workspaceId: workspace.id,
      userId: user.id,
      idempotencyKey,
      requestHash,
      intent: uploadIntent,
    });
    if (initialized.replay && !["initiated", "upload_failed"].includes(initialized.record.status)) {
      await bucket.delete(remote.temporaryKey);
      temporaryKey = null;
      return response({ analysis: publicRecord(initialized.record), replay: true }, 200);
    }
    recoverableAnalysisId = initialized.record.analysisId;
    uncommittedFinalKey = initialized.record.r2Key;
    const source = await bucket.get(remote.temporaryKey);
    if (!source || !("body" in source)) throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Приватный объект импорта недоступен.", 422);
    let stored: R2Object | null = await bucket.head(initialized.record.r2Key);
    if (!stored || stored.size !== remote.sizeBytes || arrayBufferHex(stored.checksums.sha256) !== remote.sha256) {
      if (stored) await bucket.delete(initialized.record.r2Key);
      stored = await bucket.put(initialized.record.r2Key, source.body, {
        onlyIf: new Headers({ "if-none-match": "*" }),
        sha256: remote.sha256,
        httpMetadata: { contentType: remote.mimeType, cacheControl: "private, no-store" },
        customMetadata: {
          workspaceId: workspace.id,
          ownerUserId: user.id,
          analysisId: initialized.record.analysisId,
          fileId: initialized.record.fileId,
          lifecycle: "quarantine",
          source: "public-url",
        },
      });
    }
    await bucket.delete(remote.temporaryKey);
    temporaryKey = null;
    if (!stored) stored = await bucket.head(initialized.record.r2Key);
    if (!stored || stored.size !== remote.sizeBytes || arrayBufferHex(stored.checksums.sha256) !== remote.sha256) {
      await bucket.delete(initialized.record.r2Key);
      throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Копия файла в карантине не прошла проверку целостности.", 422);
    }
    const now = new Date().toISOString();
    const scanQueued = scannerConfigured();
    const statements: D1PreparedStatement[] = [
      db.prepare(
        "UPDATE document_files SET kind='analysis_quarantined',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND kind='analysis_upload_pending'",
      ).bind(now, initialized.record.fileId, workspace.id, user.id),
      db.prepare(
        "UPDATE document_analyses SET status='quarantined',error_code=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status IN ('initiated','upload_failed')",
      ).bind(scanQueued ? null : "MALWARE_SCANNER_UNAVAILABLE", now, initialized.record.analysisId, workspace.id, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_analysis',?,'url_import_quarantined',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, initialized.record.analysisId, JSON.stringify({
        sourceOrigin: remote.sourceOrigin,
        sourceUrlSha256: remote.sourceUrlSha256,
        sizeBytes: remote.sizeBytes,
        mimeType: remote.mimeType,
        sha256Verified: true,
        scannerQueued: scanQueued,
      }), now),
    ];
    if (scanQueued) statements.push(scanOutboxStatement(db, initialized.record, workspace.id, now));
    await db.batch(statements);
    uncommittedFinalKey = null;
    recoverableAnalysisId = null;
    return response({
      code: scanQueued ? "FILE_SCAN_QUEUED" : "FILE_SCAN_UNAVAILABLE",
      analysis: publicRecord({ ...initialized.record, status: "quarantined", errorCode: scanQueued ? null : "MALWARE_SCANNER_UNAVAILABLE" }),
      replay: initialized.replay,
      message: scanQueued
        ? "Публичный файл приватно импортирован и передан на обязательную проверку безопасности."
        : "Публичный файл приватно импортирован в карантин. Анализ не запущен: scanner недоступен.",
    }, 202);
  } catch (error) {
    if (temporaryKey) await bucket.delete(temporaryKey).catch(() => undefined);
    if (uncommittedFinalKey) await bucket.delete(uncommittedFinalKey).catch(() => undefined);
    if (recoverableAnalysisId) {
      await db.prepare(
        "UPDATE document_analyses SET status='upload_failed',error_code='URL_INTEGRITY_FAILED',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status IN ('initiated','upload_failed')",
      ).bind(new Date().toISOString(), recoverableAnalysisId, workspace.id, user.id).run().catch(() => undefined);
    }
    if (error instanceof PublicDocumentUrlError) return response({ code: error.code, error: error.message }, error.status);
    if (error instanceof DocumentAnalysisUploadError) return response({ code: error.code, error: error.message }, error.status);
    if (error instanceof ArchiveInspectionError) {
      return response({ code: "FILE_UNSAFE", reason: error.code, error: "Архив отклонён проверкой структуры." }, 422);
    }
    if (error instanceof SyntaxError) return response({ code: "INVALID_JSON", error: "Некорректный JSON." }, 400);
    throw error;
  }
});

async function verifyStoredInput(bucket: R2Bucket, key: string, mimeType: string, sizeBytes: number): Promise<void> {
  const [prefixObject, suffixObject] = await Promise.all([
    bucket.get(key, { range: { offset: 0, length: Math.min(8, sizeBytes) } }),
    bucket.get(key, { range: { suffix: Math.min(2, sizeBytes) } }),
  ]);
  if (!prefixObject || !suffixObject || !("body" in prefixObject) || !("body" in suffixObject)) {
    throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Импортированный файл нельзя прочитать.", 422);
  }
  const prefix = new Uint8Array(await prefixObject.arrayBuffer());
  const suffix = new Uint8Array(await suffixObject.arrayBuffer());
  if (!validateUploadMagicBytes(mimeType, prefix, suffix)) {
    throw new PublicDocumentUrlError("URL_CONTENT_TYPE_UNSUPPORTED", "Содержимое не соответствует заявленному формату.", 422);
  }
  if (mimeType === "application/zip" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const object = await bucket.get(key);
    if (!object || !("body" in object)) throw new PublicDocumentUrlError("URL_INTEGRITY_FAILED", "Архив нельзя прочитать.", 422);
    await verifyArchiveBytes(new Uint8Array(await object.arrayBuffer()), mimeType);
  }
}

function scannerConfigured(): boolean {
  const environment = runtimeEnv();
  return environment.MALWARE_SCAN_ENABLED === "true" && Boolean(environment.MALWARE_SCANNER) && Boolean(environment.MALWARE_SCAN_QUEUE);
}

function scanOutboxStatement(
  db: D1Database,
  record: Awaited<ReturnType<typeof initializeDocumentAnalysisUpload>>["record"],
  workspaceId: string,
  now: string,
): D1PreparedStatement {
  return db.prepare(`INSERT OR IGNORE INTO job_outbox
    (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
     correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
    VALUES (?,'MALWARE_SCAN_QUEUE','malware.scan',1,?,?,?, ?,?,?,'pending',0,?,?)`).bind(
    `job-malware-${record.analysisId}`,
    `idem-malware-${record.analysisId}-${record.sha256.slice(0, 16)}`,
    record.analysisId,
    workspaceId,
    `corr-malware-${record.analysisId}`,
    now,
    now,
    now,
    now,
  );
}

async function hashUrlImportIntent(uploadHash: string, sourceUrlSha256: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${uploadHash}:${sourceUrlSha256}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicRecord(record: Awaited<ReturnType<typeof initializeDocumentAnalysisUpload>>["record"]) {
  return {
    id: record.analysisId,
    fileId: record.fileId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    status: record.status,
    errorCode: record.errorCode,
    caseId: record.caseId,
  };
}
