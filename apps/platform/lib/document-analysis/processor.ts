import { AiUnavailableError, type AiStructuredResult } from "../document-builder/ai/openai";
import {
  assertProviderCallAllowed,
  parseProviderEnvironment,
  ProviderCostControlError,
} from "../ai/provider-cost-control";
import { recordProviderUsage } from "../ai/provider-usage";
import {
  ComparisonProcessingError,
  type AnalysisPackageContext,
  type ExtractedDocument,
} from "../document-comparison/types";
import type { LegalSemanticSearchEnv } from "../legal/semantic-retrieval";
import {
  legalDatabaseFreshnessFromAsOf,
  retrieveVerifiedLegalSources,
  type LegalDatabaseFreshness,
  type VerifiedLegalRetrieval,
} from "../legal/verified-retrieval";
import {
  documentAnalysisResultSchema,
  enforceDocumentAnalysisFreshness,
  enforceDocumentAnalysisSourceBoundary,
  enforceDocumentExcerptBoundary,
  type DocumentAnalysisResult,
} from "./schema";
import {
  loadCompletedOcrExtraction,
  OcrProcessingError,
  scheduleOcrProcessing,
} from "./ocr-processor";
import {
  extractAnalysisDocument,
  isAnalysisPackageContext,
  PackageExtractionError,
} from "./package-extractor";
import {
  AnalysisRevisionError,
  analysisSourceVersionId,
  storeInitialAnalysisDocumentVersion,
  suggestedRevisionId,
} from "./revisions";
import { scheduleUserDocumentIndexStatements } from "./user-document-vectors";
import { resolveAiRuntimeSettings, type AiRuntimeSettings } from "../ai/runtime-settings";
import type { BuilderRuntimeEnv } from "../document-builder/storage/runtime";

export const DOCUMENT_ANALYSIS_INLINE_BYTE_LIMIT = 20 * 1024 * 1024;
export const DOCUMENT_ANALYSIS_INLINE_TEXT_LIMIT = 160_000;

export type DocumentAnalysisProcessorEnv = LegalSemanticSearchEnv & BuilderRuntimeEnv & {
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
  sourceFreshness: LegalDatabaseFreshness;
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
    runtimeConfigHash: string;
  };
  extraction: {
    detectedLanguage: string;
    pageCount: number | null;
    textQuality: string;
    packageContext: AnalysisPackageContext | null;
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
      | "DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED"
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
    options?: { semantic?: LegalSemanticSearchEnv },
  ) => Promise<VerifiedLegalRetrieval>;
  analyze: (input: {
    fileName: string;
    mimeType: string;
    extractedText: string;
    detectedLanguage: string;
    extractionWarnings: string[];
    packageContext: AnalysisPackageContext | null;
    locale: "ru" | "uz";
    mode: "quick" | "full" | "expert";
    userSide: string | null;
    sources: VerifiedLegalRetrieval["sources"];
    legalDatabaseAsOf: string;
    requestId: string;
    beforeProviderCall?: (input: {
      provider: "openai" | "anthropic";
      model: string;
    }) => void | Promise<void>;
    runtimeSettings?: AiRuntimeSettings;
  }) => Promise<AiStructuredResult<DocumentAnalysisResult>>;
};

const defaultDependencies: DocumentAnalysisProcessorDependencies = {
  extract: extractAnalysisDocument,
  retrieve: retrieveVerifiedLegalSources,
  analyze: async (input) => {
    const { runDocumentAnalysis } = await import("./provider");
    return runDocumentAnalysis(input, {
      beforeProviderCall: input.beforeProviderCall,
      runtimeSettings: input.runtimeSettings,
    });
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
    const failure = new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PERSISTENCE_FAILED", true) as
      DocumentAnalysisProcessingError & { cause?: unknown };
    failure.cause = error;
    throw failure;
  }
}

async function analyzeObject(
  env: DocumentAnalysisProcessorEnv,
  row: AnalysisRow,
  deps: DocumentAnalysisProcessorDependencies,
): Promise<PersistedAnalysis> {
  try {
    if (!row.sha256 || !/^[a-f0-9]{64}$/i.test(row.sha256)) {
      await setAnalysisState(env.DB, row, "failed", "DOCUMENT_ANALYSIS_INTEGRITY_FAILED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_INTEGRITY_FAILED", false);
    }
    let extracted = await loadCompletedOcrExtraction(env, {
      analysisId: row.analysisId,
      workspaceId: row.workspaceId,
      fileId: row.fileId,
      sourceSha256: row.sha256.toLowerCase(),
    });
    if (!extracted) {
      if (row.sizeBytes > DOCUMENT_ANALYSIS_INLINE_BYTE_LIMIT) {
        if (row.mimeType === "application/zip") {
          await setAnalysisState(env.DB, row, "awaiting_external_extraction", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
          throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
        }
        await scheduleOcrProcessing(env.DB, {
          analysisId: row.analysisId,
          fileId: row.fileId,
          workspaceId: row.workspaceId,
          ownerUserId: row.ownerUserId,
          sourceSha256: row.sha256.toLowerCase(),
        });
        throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_OCR_REQUIRED", false);
      }
      const object = await env.BUCKET.get(row.r2Key);
      if (!object) {
        throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_OBJECT_MISSING", false);
      }
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength !== row.sizeBytes || await sha256Hex(bytes) !== row.sha256.toLowerCase()) {
        await setAnalysisState(env.DB, row, "failed", "DOCUMENT_ANALYSIS_INTEGRITY_FAILED");
        throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_INTEGRITY_FAILED", false);
      }
      try {
        extracted = await deps.extract({
          bytes,
          fileName: row.fileName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
        });
      } catch (error) {
        if (error instanceof PackageExtractionError) {
          await setAnalysisState(env.DB, row, "awaiting_external_extraction", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
          throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
        }
        if (
          error instanceof ComparisonProcessingError &&
          (error.code === "OCR_REQUIRED" || error.code === "NO_READABLE_TEXT")
        ) {
          await scheduleOcrProcessing(env.DB, {
            analysisId: row.analysisId,
            fileId: row.fileId,
            workspaceId: row.workspaceId,
            ownerUserId: row.ownerUserId,
            sourceSha256: row.sha256.toLowerCase(),
          });
          throw new DocumentAnalysisProcessingError(
            row.mimeType === "application/zip"
              ? "DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED"
              : "DOCUMENT_ANALYSIS_OCR_REQUIRED",
            false,
          );
        }
        throw error;
      }
    }
    if (extracted.text.length > DOCUMENT_ANALYSIS_INLINE_TEXT_LIMIT) {
      await setAnalysisState(env.DB, row, "awaiting_chunked_analysis", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
    }

    await storeInitialAnalysisDocumentVersion(env, {
      analysisId: row.analysisId,
      workspaceId: row.workspaceId,
      ownerUserId: row.ownerUserId,
      fileName: row.fileName,
      text: extracted.text,
    });

    const request = parseRequestMetadata(row.summaryJson);
    const retrieval = await deps.retrieve(env.DB, extracted.text, request.locale, 8, { semantic: env });
    const providerEnvironment = parseProviderEnvironment(env.APP_ENV);
    const runtimeSettings = await resolveAiRuntimeSettings({ db: env.DB, env });
    const providerCalls: Array<{
      provider: "openai" | "anthropic";
      model: string;
      startedAt: string;
    }> = [];
    let ai: AiStructuredResult<DocumentAnalysisResult>;
    try {
      ai = await deps.analyze({
        fileName: row.fileName,
        mimeType: row.mimeType,
        extractedText: extracted.text,
        detectedLanguage: extracted.detectedLanguage,
        extractionWarnings: extracted.warningCode ? [extracted.warningCode] : [],
        packageContext: extracted.packageContext ?? null,
        locale: request.locale,
        mode: request.mode,
        userSide: null,
        sources: retrieval.sources,
        legalDatabaseAsOf: retrieval.legalDatabaseAsOf,
        requestId: `document-analysis-${row.analysisId}`,
        runtimeSettings,
        beforeProviderCall: async (call) => {
          try {
            await assertProviderCallAllowed({
              db: env.DB,
              environment: providerEnvironment,
              provider: call.provider,
            });
          } catch (error) {
            if (error instanceof ProviderCostControlError && error.code === "PROVIDER_CIRCUIT_OPEN") {
              throw new AiUnavailableError(
                "AI-провайдер остановлен системой контроля расходов.",
                "PROVIDER_CIRCUIT_OPEN",
                false,
              );
            }
            throw error;
          }
          providerCalls.push({ ...call, startedAt: new Date().toISOString() });
        },
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorCode = isAiProviderError(error) ? error.code : "PROVIDER_UNAVAILABLE";
      try {
        for (const call of providerCalls) {
          await recordProviderUsage({
            db: env.DB,
            environment: providerEnvironment,
            workspaceId: row.workspaceId,
            userId: row.ownerUserId,
            feature: "document_analysis",
            operation: call.provider === "openai" ? "responses" : "messages",
            provider: call.provider,
            model: call.model,
            inputTokens: 0,
            outputTokens: 0,
            cachedInputTokens: 0,
            status: "failed",
            errorCode,
            startedAt: call.startedAt,
            completedAt,
            eventId: `provider_usage_document_${row.analysisId}_${call.provider}`,
          });
        }
      } catch {
        // The document analysis state remains the reconciliation source.
      }
      throw error;
    }
    if (providerCalls.length > 0) {
      const completedAt = new Date().toISOString();
      for (const call of providerCalls.filter((call) => call.provider !== ai.provider)) {
        await recordProviderUsage({
          db: env.DB,
          environment: providerEnvironment,
          workspaceId: row.workspaceId,
          userId: row.ownerUserId,
          feature: "document_analysis",
          operation: call.provider === "openai" ? "responses" : "messages",
          provider: call.provider,
          model: call.model,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          status: "failed",
          errorCode: "FALLBACK_USED",
          startedAt: call.startedAt,
          completedAt,
          eventId: `provider_usage_document_${row.analysisId}_${call.provider}`,
        });
      }
      const successfulCall = [...providerCalls].reverse().find((call) => call.provider === ai.provider)!;
      await recordProviderUsage({
        db: env.DB,
        environment: providerEnvironment,
        workspaceId: row.workspaceId,
        userId: row.ownerUserId,
        feature: "document_analysis",
        operation: ai.provider === "openai" ? "responses" : "messages",
        provider: ai.provider,
        model: ai.model,
        providerRequestId: ai.providerResponseId,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        cachedInputTokens: ai.usage.cachedInputTokens,
        status: "succeeded",
        startedAt: successfulCall.startedAt,
        completedAt,
        eventId: `provider_usage_document_${row.analysisId}_${ai.provider}`,
      });
    }
    const sourceById = new Map(retrieval.sources.map((source) => [source.id, source]));
    let boundedResult: DocumentAnalysisResult;
    try {
      const validatedResult = enforceDocumentExcerptBoundary(
        enforceDocumentAnalysisSourceBoundary(
          documentAnalysisResultSchema.parse(ai.data),
          new Set(retrieval.sources.filter((source) => source.excerpt?.trim()).map((source) => source.id)),
        ),
        extracted.text,
      );
      boundedResult = {
        ...validatedResult,
        sources: validatedResult.sources.map((reference) => {
          const source = sourceById.get(reference.sourceId)!;
          return {
            sourceId: source.id,
            actTitle: source.actTitle,
            actIdentifier: source.actIdentifier,
            article: source.article ?? null,
            excerpt: source.excerpt ?? null,
            originalUrl: source.officialUrl,
            verifiedAt: source.verifiedAt,
          };
        }),
      };
    } catch {
      await setAnalysisState(env.DB, row, "failed", "DOCUMENT_ANALYSIS_INVALID_OUTPUT");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_INVALID_OUTPUT", false);
    }
    return {
      result: enforceDocumentAnalysisFreshness(boundedResult, retrieval.freshness),
      sourceFreshness: retrieval.freshness,
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
        runtimeConfigHash: runtimeSettings.configHash,
      },
      extraction: {
        detectedLanguage: extracted.detectedLanguage,
        pageCount: extracted.pageCount,
        textQuality: extracted.textQuality,
        packageContext: extracted.packageContext ?? null,
      },
    };
  } catch (error) {
    if (error instanceof DocumentAnalysisProcessingError) throw error;
    if (error instanceof OcrProcessingError) {
      const status = error.retryable ? "retrying" : "failed";
      await setAnalysisState(env.DB, row, status, error.code);
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_EXTRACTION_FAILED", error.retryable);
    }
    if (error instanceof PackageExtractionError) {
      await setAnalysisState(env.DB, row, "awaiting_external_extraction", "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_CAPACITY_REQUIRED", false);
    }
    if (error instanceof AnalysisRevisionError) {
      await setAnalysisState(env.DB, row, "retrying", "DOCUMENT_ANALYSIS_PERSISTENCE_FAILED");
      throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PERSISTENCE_FAILED", true);
    }
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
      const status = (error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_CIRCUIT_OPEN") && !error.retryable
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
  let revisionCount = 0;
  for (let offset = 0; offset < persisted.result.risks.length; offset += 20) {
    const statements: D1PreparedStatement[] = [];
    for (const risk of persisted.result.risks.slice(offset, offset + 20)) {
      const riskId = crypto.randomUUID();
      statements.push(db.prepare(
        `INSERT INTO document_risks
         (id,analysis_id,level,title,description,excerpt,confidence_percent,risk_type,clause,page,recommendation,proposed_wording,legal_basis_source_ids_json,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        riskId,
        row.analysisId,
        risk.severity,
        risk.title,
        [risk.problem, risk.consequence, risk.recommendation].join("\n\n"),
        risk.exactExcerpt,
        risk.confidence === "high" ? 90 : risk.confidence === "medium" ? 70 : 45,
        risk.riskType,
        risk.clause,
        risk.page,
        risk.recommendation,
        risk.proposedWording,
        JSON.stringify(risk.legalBasisSourceIds),
        now,
      ));
      if (
        risk.exactExcerpt?.trim()
        && risk.proposedWording?.trim()
        && risk.exactExcerpt !== risk.proposedWording
      ) {
        statements.push(db.prepare(
          `INSERT INTO suggested_revisions
           (id,analysis_id,risk_id,source_version_id,workspace_id,owner_user_id,original_text,
            proposed_text,status,decided_by_user_id,decided_at,applied_version_id,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,?,?)`,
        ).bind(
          suggestedRevisionId(riskId), row.analysisId, riskId, analysisSourceVersionId(row.analysisId),
          row.workspaceId, row.ownerUserId, risk.exactExcerpt, risk.proposedWording, now, now,
        ));
        revisionCount += 1;
      }
    }
    await db.batch(statements);
  }

  const runId = `document-analysis-run-${row.analysisId}`;
  const ledgerId = `document-analysis-usage-${row.analysisId}`;
  const idempotencyKey = `document-analysis:${row.analysisId}`;
  const { periodStart, periodEnd } = monthlyPeriod(new Date(now));
  const sourceVersionHash = await sha256Hex(new TextEncoder().encode(
    persisted.result.sources.map((source) => `${source.sourceId}:${source.verifiedAt}`).sort().join("|"),
  ));
  const instructionHash = await sha256Hex(new TextEncoder().encode(
    JSON.stringify({ version: "juro-document-analysis-v1", runtimeConfigHash: persisted.technical.runtimeConfigHash }),
  ));
  const sourceVersion = await db.prepare(
    `SELECT id,sha256 FROM analysis_document_versions
     WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(
    analysisSourceVersionId(row.analysisId),
    row.analysisId,
    row.workspaceId,
    row.ownerUserId,
  ).first<{ id: string; sha256: string }>();
  if (!sourceVersion) {
    throw new DocumentAnalysisProcessingError("DOCUMENT_ANALYSIS_PERSISTENCE_FAILED", true);
  }
  const detectedLanguage = (["ru", "uz", "mixed", "unknown"] as const).includes(
    persisted.extraction.detectedLanguage as "ru" | "uz" | "mixed" | "unknown",
  )
    ? persisted.extraction.detectedLanguage as "ru" | "uz" | "mixed" | "unknown"
    : "unknown";
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
    ...scheduleUserDocumentIndexStatements(db, {
      analysisId: row.analysisId,
      documentVersionId: sourceVersion.id,
      workspaceId: row.workspaceId,
      ownerUserId: row.ownerUserId,
      sourceHash: sourceVersion.sha256,
      language: detectedLanguage,
      now,
    }),
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
        revisionCount,
        sourceFreshnessStatus: persisted.sourceFreshness.status,
        sourceFreshnessAsOf: persisted.sourceFreshness.asOf,
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
    const result = documentAnalysisResultSchema.parse(parsed.result);
    if (parsed.extraction?.packageContext !== null
      && parsed.extraction?.packageContext !== undefined
      && !isAnalysisPackageContext(parsed.extraction.packageContext)) {
      throw new Error("INVALID_PACKAGE_CONTEXT");
    }
    return {
      ...parsed,
      technical: {
        ...parsed.technical,
        runtimeConfigHash: /^[a-f0-9]{64}$/.test(parsed.technical?.runtimeConfigHash ?? "")
          ? parsed.technical.runtimeConfigHash
          : "0".repeat(64),
      },
      result,
      extraction: {
        ...parsed.extraction,
        packageContext: parsed.extraction?.packageContext ?? null,
      },
      sourceFreshness: parsed.sourceFreshness
        ?? legalDatabaseFreshnessFromAsOf(result.legalDatabaseAsOf),
    };
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
  code: "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "INVALID_AI_OUTPUT" | "AI_REFUSED" | "PROVIDER_CIRCUIT_OPEN";
  retryable: boolean;
} {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; retryable?: unknown };
  return candidate.name === "AiUnavailableError"
    && typeof candidate.retryable === "boolean"
    && ["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "INVALID_AI_OUTPUT", "AI_REFUSED", "PROVIDER_CIRCUIT_OPEN"]
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
