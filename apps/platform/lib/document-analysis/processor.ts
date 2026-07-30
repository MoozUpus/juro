import type { AiStructuredResult } from "../document-builder/ai/openai";
import { extractDocument } from "../document-comparison/extract";
import { ComparisonProcessingError, type ExtractedDocument } from "../document-comparison/types";
import { retrieveVerifiedLegalSources, type VerifiedLegalRetrieval } from "../legal/verified-retrieval";
import { documentAnalysisResultSchema, type DocumentAnalysisResult } from "./schema";

export const DOCUMENT_ANALYSIS_INLINE_BYTE_LIMIT = 20 * 1024 * 1024;
export const DOCUMENT_ANALYSIS_INLINE_TEXT_LIMIT = 160_000;

export type DocumentAnalysisProcessorEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

type AnalysisRow = {
  analysisId: string;
  workspaceId: string;
  ownerUserId: string;
  status: string;
  summaryJson: string | null;
  fileId: string;
  fileKind: string;
  r2Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
};

type PersistedAnalysis = {
  result: DocumentAnalysisResult;
  technical: {
    provider: "openai" | "anthropic";
    model: string;
    providerResponseId: string | null;
    fallbackFromProvider: "openai" | "anthropic" | null;
    attempts: number;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
  extraction: {
    detectedLanguage: string;
    pageCount: number | null;
    textQuality: string;
  };
};

export class DocumentAnalysisProcessingError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_ANALYSIS_NOT_FOUND"
      | "DOCUMENT_ANALYSIS_FILE_UNSAFE"
      | "DOCUMENT_ANALYSIS_OBJECT_MISSING"
      | "DOCUMENT_ANALYSIS_INTEGRITY_FAILED"
      | "DOCUMENT_ANALYSIS_EXTRACTION_FAILED"
      | "DOCUMENT_ANALYSIS_OCR_REQUIRED"
      | "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED"
      | "DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE"
      | "DOCUMENT_ANALYSIS_INVALID_OUTPUT"
      | "DOCUMENT_ANALYSIS_PERSISTENCE_FAILED",
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "DocumentAnalysisProcessingError";
  }
}

export type DocumentAnalysisProcessorDependencies = {
  extract: (input: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<ExtractedDocument>;
  retrieve: (
    db: D1Database,
    query: string,
    locale: "ru" | "uz",
    limit?: number,
  ) => Promise<VerifiedLegalRetrieval>;
  analyze: (input: {
    fileName: string;
    mimeType: string;
    extractedText: string;
    detectedLanguage: string;
    extractionWarnings: string[];
    locale: "ru" | "uz";
    mode: "quick" | "full" | "expert";
    userSide: string | null;
    sources: VerifiedLegalRetrieval["sources"];
    legalDatabaseAsOf: string;
    requestId: string;
  }) => Promise<AiStructuredResult<DocumentAnalysisResult>>;
};

const defaultDependencies: DocumentAnalysisProcessorDependencies = {
  extract: extractDocument,
  retrieve: retrieveVerifiedLegalSources,
  analyze: async (input) => {
    const { runDocumentAnalysis } = await import("./provider");
    return runDocumentAnalysis(input);
  },
};

export async function executeDocumentAnalysisJob(
  env: DocumentAnalysisProcessorEnv,
  analysisId: string,
  workspaceId: string,
  dependencies: Partial<DocumentAnalysisProcessorDependencies> = {},
): Promise<{ status: "completed" | "already_completed"; analysisId: string }> {
  const deps = { ...defaultDependencies, ...dependencies };
  const row = await loadAnalysis(env.DB, analysisId, workspaceId);
  if (!row) {
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_NOT_FOUND", false);
  }
  if (row.status === "completed") return { status: "already_completed", analysisId };

  let persisted: PersistedAnalysis;
  if (row.status === "persisting") {
    persisted = parsePersistedAnalysis(row.summaryJson);
  } else {
    assertSafeReadyState(row);
    const claimed = await env.DB.prepare(
      "UPDATE document_analyses SET status='processing',error_code=NULL,updated_at=? WHERE id=? AND workspace_id=? AND status='ready'",
    ).bind(new Date().toISOString(), analysisId, workspaceId).run();
    if (Number(claimed.meta.changes ?? 0) !== 1 && row.status !== "processing") {
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_FILE_UNSAFE", false);
    }
    persisted = await analyzeObject(env, row, deps);
    await env.DB.prepare(
      "UPDATE document_analyses SET status='persisting',summary_json=?,error_code=NULL,updated_at=? WHERE id=? AND workspace_id=? AND status='processing'",
    ).bind(JSON.stringify(persisted), new Date().toISOString(), analysisId, workspaceId).run();
  }

  try {
    await persistNormalizedAnalysis(env.DB, row, persisted);
    return { status: "completed", analysisId };
  } catch (error) {
    if (error instanceof DocumentAnalysisProcessingError) throw error;
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PERSISTENCE_FAILED", true);
  }
}

async function analyzeObject(
  env: DocumentAnalysisProcessorEnv,
  row: AnalysisRow,
  deps: DocumentAnalysisProcessorDependencies,
): Promise<PersistedAnalysis> {
  try {
    if (row.sizeBytes > DOCUMENT_ANALYSIS_INLINE_BYTE_LIMIT) {
      await setAnalysisState(env.DB, row, "awaiting_external_extraction", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
    }
    const object = await env.BUCKET.get(row.r2Key);
    if (!object) {
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_OBJECT_MISSING", false);
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== row.sizeBytes || !row.sha256 || await sha256Hex(bytes) !== row.sha256.toLowerCase()) {
      await setAnalysisState(env.DB, row, "failed", "DOCUMENT_ANALYSIS_INTEGRITY_FAILED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_INTEGRITY_FAILED", false);
    }

    const extracted = await deps.extract({
      bytes,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    if (extracted.text.length > DOCUMENT_ANALYSIS_INLINE_TEXT_LIMIT) {
      await setAnalysisState(env.DB, row, "awaiting_chunked_analysis", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
    }

    const request = parseRequestMetadata(row.summaryJson);
    const retrieval = await deps.retrieve(env.DB, extracted.text, request.locale, 8);
    const ai = await deps.analyze({
      fileName: row.fileName,
      mimeType: row.mimeType,
      extractedText: extracted.text,
      detectedLanguage: extracted.detectedLanguage,
      extractionWarnings: extracted.warningCode ? [extracted.warningCode] : [],
      locale: request.locale,
      mode: request.mode,
      userSide: null,
      sources: retrieval.sources,
      legalDatabaseAsOf: retrieval.legalDatabaseAsOf,
      requestId: `document-analysis-${row.analysisId}`,
    });
    return {
      result: ai.data,
      technical: {
        provider: ai.provider,
        model: ai.model,
        providerResponseId: ai.providerResponseId,
        fallbackFromProvider: ai.fallbackFromProvider,
        attempts: ai.attempts,
        latencyMs: ai.latencyMs,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        cachedInputTokens: ai.usage.cachedInputTokens,
      },
      extraction: {
        detectedLanguage: extracted.detectedLanguage,
        pageCount: extracted.pageCount,
        textQuality: extracted.textQuality,
      },
    };
  } catch (error) {
    if (error instanceof DocumentAnalysisProcessingError) throw error;
    if (error instanceof ComparisonProcessingError) {
      const waiting = error.code === "OCR_REQUIRED" ? "awaiting_ocr" : "failed";
      const code = error.code === "OCR_REQUIRED"
        ? "DOCUMENT_ANALYSIS_OCR_REQUIRED"
        : "DOCUMENT_ANALYSIS_EXTRACTION_FAILED";
      await setAnalysisState(env.DB, row, waiting, code);
      throw new DocumentAnalysisProcessingError(code, false);
    }
    if (isAiProviderError(error)) {
      const code = error.code === "INVALID_AI_OUTPUT"
        ? "DOCUMENT_ANALYSIS_INVALID_OUTPUT"
        : "DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE";
      const status = error.code === "PROVIDER_UNAVAILABLE" && !error.retryable
        ? "awaiting_ai_configuration"
        : error.retryable ? "retrying" : "failed";
      await setAnalysisState(env.DB, row, status, code);
      throw new DocumentAnalysisProcessingError(code, error.retryable);
    }
    await setAnalysisState(env.DB, row, "retrying", "DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE");
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE", true);
  }
}

async function persistNormalizedAnalysis(
  db: D1Database,
  row: AnalysisRow,
  persisted: PersistedAnalysis,
): Promise<void> {
  const now = new Date().toISOString();
  const summary = legacyCompatibleSummary(persisted);
  await db.prepare("DELETE FROM document_risks WHERE analysis_id=?").bind(row.analysisId).run();
  for (let offset = 0; offset < persisted.result.risks.length; offset += 20) {
    await db.batch(persisted.result.risks.slice(offset, offset + 20).map((risk) => db.prepare(
      `INSERT INTO document_risks
       (id,analysis_id,level,title,description,excerpt,confidence_percent,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      row.analysisId,
      risk.severity,
      risk.title,
      [risk.problem, risk.consequence, risk.recommendation].join("\n\n"),
      risk.exactExcerpt,
      risk.confidence === "high" ? 90 : risk.confidence === "medium" ? 70 : 45,
      now,
    )));
  }

  const runId = `document-analysis-run-${row.analysisId}`;
  const ledgerId = `document-analysis-usage-${row.analysisId}`;
  const idempotencyKey = `document-analysis:${row.analysisId}`;
  const { periodStart, periodEnd } = monthlyPeriod(new Date(now));
  const sourceVersionHash = await sha256Hex(new TextEncoder().encode(
    persisted.result.sources.map((source) => `${source.sourceId}:${source.verifiedAt}`).sort().join("|"),
  ));
  const instructionHash = await sha256Hex(new TextEncoder().encode("juro-document-analysis-v1"));
  await db.batch([
    db.prepare(
      `INSERT INTO ai_runs
       (id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,idempotency_key,
        correlation_id,provider,model,provider_response_id,fallback_from_provider,answer_mode,reasoning_mode,
        status,legal_database_as_of,instruction_hash,source_version_hash,input_tokens,output_tokens,
        cached_input_tokens,estimated_cost_microusd,attempt_count,latency_ms,error_code,started_at,
        completed_at,created_at,updated_at)
       VALUES (?,?,?,NULL,NULL,NULL,?,?,?,?,?,?,?,?, 'completed',?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,
        provider_response_id=excluded.provider_response_id,fallback_from_provider=excluded.fallback_from_provider,
        status='completed',legal_database_as_of=excluded.legal_database_as_of,
        source_version_hash=excluded.source_version_hash,input_tokens=excluded.input_tokens,
        output_tokens=excluded.output_tokens,cached_input_tokens=excluded.cached_input_tokens,
        attempt_count=excluded.attempt_count,latency_ms=excluded.latency_ms,
        completed_at=excluded.completed_at,updated_at=excluded.updated_at`,
    ).bind(
      runId, row.workspaceId, row.ownerUserId, idempotencyKey, `document-analysis-${row.analysisId}`,
      persisted.technical.provider, persisted.technical.model, persisted.technical.providerResponseId,
      persisted.technical.fallbackFromProvider, persisted.result.mode,
      persisted.result.mode === "expert" ? "deep" : "fast", persisted.result.legalDatabaseAsOf,
      instructionHash, sourceVersionHash, persisted.technical.inputTokens,
      persisted.technical.outputTokens, persisted.technical.cachedInputTokens,
      persisted.technical.attempts, persisted.technical.latencyMs, now, now, now, now,
    ),
    db.prepare(
      `INSERT INTO ai_usage_ledger
       (id,workspace_id,user_id,ai_run_id,idempotency_key,feature,period_start,period_end,units,status,
        provider,model,input_tokens,output_tokens,cached_input_tokens,estimated_cost_microusd,
        released_at,consumed_at,created_at,updated_at)
       VALUES (?,?,?,?,?,'document_analysis',?,?,1,'consumed',?,?,?,?,?,NULL,NULL,?,?,?)
       ON CONFLICT(ai_run_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,
        input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,
        cached_input_tokens=excluded.cached_input_tokens,status='consumed',consumed_at=excluded.consumed_at,
        updated_at=excluded.updated_at`,
    ).bind(
      ledgerId, row.workspaceId, row.ownerUserId, runId, idempotencyKey,
      periodStart, periodEnd, persisted.technical.provider, persisted.technical.model,
      persisted.technical.inputTokens, persisted.technical.outputTokens,
      persisted.technical.cachedInputTokens, now, now, now,
    ),
    db.prepare(
      "UPDATE document_analyses SET status='completed',summary_json=?,error_code=NULL,updated_at=? WHERE id=? AND workspace_id=? AND status='persisting'",
    ).bind(JSON.stringify(summary), now, row.analysisId, row.workspaceId),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'document_analysis',?,'analysis_completed',?,?)`,
    ).bind(
      crypto.randomUUID(), row.workspaceId, row.ownerUserId, row.analysisId,
      JSON.stringify({
        provider: persisted.technical.provider,
        model: persisted.technical.model,
        fallbackFromProvider: persisted.technical.fallbackFromProvider,
        riskCount: persisted.result.risks.length,
        sourceCount: persisted.result.sources.length,
      }),
      now,
    ),
  ]);
}

function assertSafeReadyState(row: AnalysisRow): void {
  if (!(["ready", "processing"] as string[]).includes(row.status) || row.fileKind !== "analysis_safe") {
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_FILE_UNSAFE", false);
  }
}

async function loadAnalysis(
  db: D1Database,
  analysisId: string,
  workspaceId: string,
): Promise<AnalysisRow | null> {
  return db.prepare(
    `SELECT a.id AS analysisId,a.workspace_id AS workspaceId,a.owner_user_id AS ownerUserId,
      a.status,a.summary_json AS summaryJson,f.id AS fileId,f.kind AS fileKind,f.r2_key AS r2Key,
      f.file_name AS fileName,f.mime_type AS mimeType,f.size_bytes AS sizeBytes,f.sha256
     FROM document_analyses a JOIN document_files f ON f.id=a.uploaded_file_id
     WHERE a.id=? AND a.workspace_id=? AND f.workspace_id=? AND f.archived_at IS NULL LIMIT 1`,
  ).bind(analysisId, workspaceId, workspaceId).first<AnalysisRow>();
}

function parseRequestMetadata(value: string | null): {
  locale: "ru" | "uz";
  mode: "quick" | "full" | "expert";
} {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    return {
      locale: parsed.locale === "uz" ? "uz" : "ru",
      mode: parsed.mode === "full" || parsed.mode === "expert" ? parsed.mode : "quick",
    };
  } catch {
    return { locale: "ru", mode: "quick" };
  }
}

function parsePersistedAnalysis(value: string | null): PersistedAnalysis {
  try {
    const parsed = JSON.parse(value || "{}") as PersistedAnalysis;
    return { ...parsed, result: documentAnalysisResultSchema.parse(parsed.result) };
  } catch {
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PERSISTENCE_FAILED", true);
  }
}

function legacyCompatibleSummary(persisted: PersistedAnalysis) {
  const result = persisted.result;
  return {
    summary: result.summary,
    parties: result.parties.map((party) => `${party.name} — ${party.role}`),
    dates: result.dates,
    obligations: result.obligations.map((item) => `${item.party}: ${item.obligation}`),
    payments: result.amounts,
    disputedTerms: result.contradictions,
    missingItems: result.missingClauses.map((item) => item.title),
    questions: result.questions,
    disclaimer: result.legalComplianceStatus === "unverified"
      ? "Правовые основания не подтверждены проверенными источниками; показан структурный анализ документа."
      : "Правовые выводы привязаны к проверенным источникам, но результат требует профессиональной проверки.",
    result,
    technical: persisted.technical,
    extraction: persisted.extraction,
  };
}

async function setAnalysisState(
  db: D1Database,
  row: AnalysisRow,
  status: string,
  errorCode: string,
): Promise<void> {
  await db.prepare(
    "UPDATE document_analyses SET status=?,error_code=?,updated_at=? WHERE id=? AND workspace_id=?",
  ).bind(status, errorCode, new Date().toISOString(), row.analysisId, row.workspaceId).run();
}

function isAiProviderError(error: unknown): error is {
  code: "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "INVALID_AI_OUTPUT" | "AI_REFUSED";
  retryable: boolean;
} {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; retryable?: unknown };
  return candidate.name === "AiUnavailableError"
    && typeof candidate.retryable === "boolean"
    && ["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "INVALID_AI_OUTPUT", "AI_REFUSED"]
      .includes(String(candidate.code));
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function monthlyPeriod(now: Date): { periodStart: string; periodEnd: string } {
  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}
