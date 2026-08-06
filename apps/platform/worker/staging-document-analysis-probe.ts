import PizZip from "pizzip";
import { executeMalwareScanJob } from "../lib/document-analysis/malware-scanner";
import {
  DocumentAnalysisProcessingError,
  executeDocumentAnalysisJob,
} from "../lib/document-analysis/processor";
import { runDocumentAnalysis } from "../lib/document-analysis/provider";
import type { PlatformJobEnv } from "./platform-jobs";

const probeKey = "staging-document-analysis-v1";
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const probeIds = {
  userId: `${probeKey}-user`,
  workspaceId: `${probeKey}-workspace`,
  memberId: `${probeKey}-member`,
  fileId: `${probeKey}-file`,
  analysisId: `${probeKey}-analysis`,
  quarantineKey: `quarantine-v2/probes/${probeKey}.docx`,
} as const;

export type StagingDocumentAnalysisProbeSummary = {
  attempted: number;
  completed: number;
  failed: number;
  skipped: number;
  errorCode?: string;
};

type ProbeStage = "prepare" | "seed" | "scan" | "analysis" | "verify" | "cleanup";

export function stagingDocumentAnalysisProbeEnabled(
  env: Pick<PlatformJobEnv, "APP_ENV"> & { STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED?: string },
): boolean {
  return env.APP_ENV === "staging"
    && env.STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED === "true";
}

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function syntheticDocx(): Uint8Array {
  const paragraphs = [
    "СИНТЕТИЧЕСКИЙ ДОГОВОР ДЛЯ ПРОВЕРКИ STAGING",
    "Поставщик обязуется передать Заказчику тестовую услугу. Заказчик оплачивает 10 000 000 сум в течение 10 календарных дней после подписания акта.",
    "При нарушении срока применяется ответственность в соответствии с условиями договора. Документ не создаёт реальных прав или обязанностей.",
  ];
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>",
  );
  zip.file(
    "_rels/.rels",
    "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>",
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${xmlEscape(paragraph)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
  );
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function probeObjectKeys(env: PlatformJobEnv): Promise<string[]> {
  const versions = await env.DB.prepare(
    "SELECT r2_key AS r2Key FROM analysis_document_versions WHERE analysis_id=? AND workspace_id=?",
  ).bind(probeIds.analysisId, probeIds.workspaceId).all<{ r2Key: string }>();
  return [
    probeIds.quarantineKey,
    `safe-v1/${probeIds.workspaceId}/${probeIds.analysisId}/${probeIds.fileId}`,
    ...versions.results.map((version) => version.r2Key),
  ];
}

async function cleanup(env: PlatformJobEnv): Promise<void> {
  const objectKeys = await probeObjectKeys(env);
  await Promise.all([
    env.QUARANTINE_BUCKET.delete(probeIds.quarantineKey),
    ...objectKeys.filter((key) => key !== probeIds.quarantineKey).map((key) => env.BUCKET.delete(key)),
  ]);
  // Keep cleanup sequential rather than batched: a synthetic probe can leave
  // an AI run, an outbox item, and cascading analysis rows. This makes the
  // dependency order explicit, so a failed later cleanup action cannot roll
  // back earlier safe deletions as one batch.
  const statements = [
    env.DB.prepare("DELETE FROM job_outbox WHERE workspace_id=? OR subject_id=?").bind(probeIds.workspaceId, probeIds.analysisId),
    env.DB.prepare("DELETE FROM ai_provider_usage_events WHERE workspace_id=? AND user_id=?").bind(probeIds.workspaceId, probeIds.userId),
    env.DB.prepare("DELETE FROM ai_cost_daily_aggregates WHERE workspace_id=? AND user_id=?").bind(probeIds.workspaceId, probeIds.userId),
    env.DB.prepare("DELETE FROM ai_usage_ledger WHERE workspace_id=? AND user_id=?").bind(probeIds.workspaceId, probeIds.userId),
    env.DB.prepare("DELETE FROM ai_runs WHERE workspace_id=? AND user_id=?").bind(probeIds.workspaceId, probeIds.userId),
    env.DB.prepare("DELETE FROM workspace_audit_events WHERE workspace_id=?").bind(probeIds.workspaceId),
    env.DB.prepare("DELETE FROM document_analyses WHERE id=? AND workspace_id=?").bind(probeIds.analysisId, probeIds.workspaceId),
    env.DB.prepare("DELETE FROM document_files WHERE id=? AND workspace_id=?").bind(probeIds.fileId, probeIds.workspaceId),
    env.DB.prepare("UPDATE user_profiles SET default_workspace_id=NULL WHERE id=? AND default_workspace_id=?").bind(probeIds.userId, probeIds.workspaceId),
    env.DB.prepare("DELETE FROM workspace_members WHERE workspace_id=?").bind(probeIds.workspaceId),
    env.DB.prepare("DELETE FROM workspaces WHERE id=?").bind(probeIds.workspaceId),
    env.DB.prepare("DELETE FROM user_profiles WHERE id=?").bind(probeIds.userId),
  ];
  for (const statement of statements) await statement.run();
}

async function assertCleanup(env: PlatformJobEnv): Promise<void> {
  const remaining = await env.DB.prepare(`SELECT
    (SELECT count(*) FROM user_profiles WHERE id=?) +
    (SELECT count(*) FROM workspaces WHERE id=?) +
    (SELECT count(*) FROM document_files WHERE id=?) +
    (SELECT count(*) FROM document_analyses WHERE id=?) +
    (SELECT count(*) FROM file_scan_results WHERE analysis_id=?) +
    (SELECT count(*) FROM analysis_document_versions WHERE analysis_id=?) +
    (SELECT count(*) FROM ai_runs WHERE workspace_id=? AND user_id=?) +
    (SELECT count(*) FROM ai_usage_ledger WHERE workspace_id=? AND user_id=?) +
    (SELECT count(*) FROM ai_provider_usage_events WHERE workspace_id=? AND user_id=?) AS remaining`).bind(
    probeIds.userId,
    probeIds.workspaceId,
    probeIds.fileId,
    probeIds.analysisId,
    probeIds.analysisId,
    probeIds.analysisId,
    probeIds.workspaceId,
    probeIds.userId,
    probeIds.workspaceId,
    probeIds.userId,
    probeIds.workspaceId,
    probeIds.userId,
  ).first<{ remaining: number }>();
  if (Number(remaining?.remaining ?? -1) !== 0) {
    throw new Error("STAGING_DOCUMENT_ANALYSIS_PROBE_CLEANUP_FAILED");
  }
}

async function seedSyntheticAnalysis(env: PlatformJobEnv): Promise<void> {
  const bytes = syntheticDocx();
  const sourceSha256 = await sha256(bytes);
  const now = new Date().toISOString();
  const stored = await env.QUARANTINE_BUCKET.put(probeIds.quarantineKey, bytes, {
    sha256: sourceSha256,
    httpMetadata: { contentType: docxMime, cacheControl: "private, no-store" },
    customMetadata: { probe: probeKey, synthetic: "true" },
  });
  if (!stored || stored.size !== bytes.byteLength) {
    throw new Error("STAGING_DOCUMENT_ANALYSIS_PROBE_OBJECT_WRITE_FAILED");
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_profiles(id,email,full_name,locale,account_type,lifecycle_status,created_at,updated_at)
      VALUES (?,?,?,'ru','individual','active',?,?)`).bind(
      probeIds.userId,
      `${probeKey}@example.test`,
      "JURO synthetic document analysis probe",
      now,
      now,
    ),
    env.DB.prepare("INSERT INTO workspaces(id,type,name,locale,created_at,updated_at) VALUES (?,'individual',?,'ru',?,?)").bind(
      probeIds.workspaceId,
      "JURO synthetic document analysis probe",
      now,
      now,
    ),
    env.DB.prepare(`INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
      VALUES (?,?,?,'owner','active',?,?,?)`).bind(
      probeIds.memberId,
      probeIds.workspaceId,
      probeIds.userId,
      now,
      now,
      now,
    ),
    env.DB.prepare(`INSERT INTO document_files
      (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
      VALUES (?,?,?,'analysis_quarantined',?,'synthetic-staging-contract.docx',?,?,?, ?,?)`).bind(
      probeIds.fileId,
      probeIds.workspaceId,
      probeIds.userId,
      probeIds.quarantineKey,
      docxMime,
      bytes.byteLength,
      sourceSha256,
      now,
      now,
    ),
    env.DB.prepare(`INSERT INTO document_analyses
      (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,error_code,consent_version,created_at,updated_at)
      VALUES (?,?,?,?,'quarantined',?,'MALWARE_SCANNER_UNAVAILABLE','synthetic-probe',?,?)`).bind(
      probeIds.analysisId,
      probeIds.workspaceId,
      probeIds.userId,
      probeIds.fileId,
      JSON.stringify({ locale: "ru", mode: "quick" }),
      now,
      now,
    ),
  ]);
}

async function assertCompleted(env: PlatformJobEnv): Promise<void> {
  const row = await env.DB.prepare(`SELECT analysis.status AS analysisStatus,file.kind AS fileKind,
      scan.verdict AS scanVerdict,(SELECT count(*) FROM ai_runs WHERE workspace_id=analysis.workspace_id AND user_id=analysis.owner_user_id AND id=?) AS runCount
     FROM document_analyses analysis
     JOIN document_files file ON file.id=analysis.uploaded_file_id
     JOIN file_scan_results scan ON scan.analysis_id=analysis.id
     WHERE analysis.id=? AND analysis.workspace_id=? LIMIT 1`).bind(
      `document-analysis-run-${probeIds.analysisId}`,
      probeIds.analysisId,
      probeIds.workspaceId,
    ).first<{ analysisStatus: string; fileKind: string; scanVerdict: string; runCount: number }>();
  if (
    row?.analysisStatus !== "completed"
    || row.fileKind !== "analysis_safe"
    || row.scanVerdict !== "clean"
    || Number(row.runCount) !== 1
  ) {
    throw new Error("STAGING_DOCUMENT_ANALYSIS_PROBE_COMPLETION_FAILED");
  }
}

/**
 * One explicitly enabled staging-only lifecycle check. It intentionally uses a
 * synthetic non-user DOCX and the normal scanner and analysis handlers, but
 * retains no document text, provider response or durable probe data afterward.
 */
export async function runStagingDocumentAnalysisProbe(
  env: PlatformJobEnv & { STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED?: string },
): Promise<StagingDocumentAnalysisProbeSummary> {
  if (!stagingDocumentAnalysisProbeEnabled(env)) {
    return { attempted: 0, completed: 0, failed: 0, skipped: 1 };
  }
  if (env.MALWARE_SCAN_ENABLED !== "true" || !env.MALWARE_SCANNER) {
    return { attempted: 1, completed: 0, failed: 1, skipped: 0, errorCode: "DOCUMENT_ANALYSIS_PROBE_SCANNER_DISABLED" };
  }
  let stage: ProbeStage = "prepare";
  let summary: StagingDocumentAnalysisProbeSummary;
  try {
    await cleanup(env);
    await assertCleanup(env);
    stage = "seed";
    await seedSyntheticAnalysis(env);
    stage = "scan";
    const scan = await executeMalwareScanJob(env, probeIds.analysisId, probeIds.workspaceId);
    if (scan.status !== "safe") throw new Error("STAGING_DOCUMENT_ANALYSIS_PROBE_SCAN_FAILED");
    stage = "analysis";
    // This probe must leave room for cleanup within one scheduled invocation.
    // Its short one-attempt policy is strictly an injected test dependency;
    // user analyses keep their production timeout and retry policy.
    const analysis = await executeDocumentAnalysisJob(env, probeIds.analysisId, probeIds.workspaceId, {
      analyze: (input) => runDocumentAnalysis(input, {
        beforeProviderCall: input.beforeProviderCall,
        runtimeSettings: input.runtimeSettings,
        providerTimeoutMs: 20_000,
        providerMaxAttempts: 1,
      }),
    });
    if (analysis.status !== "completed") throw new Error("STAGING_DOCUMENT_ANALYSIS_PROBE_ANALYSIS_FAILED");
    stage = "verify";
    await assertCompleted(env);
    summary = { attempted: 1, completed: 1, failed: 0, skipped: 0 };
  } catch (error) {
    const processorCode = error instanceof DocumentAnalysisProcessingError
      ? error.code
      : null;
    const processorStage = error instanceof DocumentAnalysisProcessingError
      ? error.diagnosticStage
      : null;
    const processorDetail = error instanceof DocumentAnalysisProcessingError
      ? error.diagnosticDetail
      : null;
    const errorCode = stage === "analysis" && processorStage && processorDetail
      ? `DOCUMENT_ANALYSIS_PROBE_ANALYSIS_${processorStage.toUpperCase()}_${processorDetail}`
      : stage === "analysis" && processorCode && processorStage
      ? `DOCUMENT_ANALYSIS_PROBE_ANALYSIS_${processorStage.toUpperCase()}_${processorCode}`
      : stage === "analysis" && processorCode
        ? `DOCUMENT_ANALYSIS_PROBE_ANALYSIS_${processorCode}`
      : `DOCUMENT_ANALYSIS_PROBE_${stage.toUpperCase()}_FAILED`;
    console.error(JSON.stringify({ event: "staging.document_analysis_probe_failed", stage, errorCode }));
    summary = { attempted: 1, completed: 0, failed: 1, skipped: 0, errorCode };
  }
  try {
    stage = "cleanup";
    await cleanup(env);
    await assertCleanup(env);
  } catch {
    // Never throw from cleanup: preserve a safe structured status for the
    // scheduler and prevent a generic cron failure from hiding probe residue.
    console.error(JSON.stringify({
      event: "staging.document_analysis_probe_cleanup_failed",
      stage,
      errorCode: "DOCUMENT_ANALYSIS_PROBE_CLEANUP_FAILED",
    }));
    return { attempted: 1, completed: 0, failed: 1, skipped: 0, errorCode: "DOCUMENT_ANALYSIS_PROBE_CLEANUP_FAILED" };
  }
  return summary;
}
