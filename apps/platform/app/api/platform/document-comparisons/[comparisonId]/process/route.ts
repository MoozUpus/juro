import { AiUnavailableError } from "../../../../../../lib/document-builder/ai/openai";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { getPrivateObject, putPrivateObject } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { compareDocuments, summarizeChanges } from "../../../../../../lib/document-comparison/diff";
import { extractDocument } from "../../../../../../lib/document-comparison/extract";
import { enrichComparisonChanges, type ComparisonLegalSource } from "../../../../../../lib/document-comparison/legal-analysis";
import { filterTrustedVerifiedLegalSources } from "../../../../../../lib/legal/source-trust";
import {
  comparisonForUser,
  loadExtractedDocument,
} from "../../../../../../lib/document-comparison/storage";
import { ComparisonProcessingError, type ComparisonChange, type ComparisonLocale } from "../../../../../../lib/document-comparison/types";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function updateStage(db: D1Database, comparisonId: string, workspaceId: string, stage: string) {
  await db.prepare(
    "UPDATE document_comparisons SET status='processing',stage=?,error_code=NULL,updated_at=? WHERE id=? AND workspace_id=?",
  ).bind(stage, isoNow(), comparisonId, workspaceId).run();
}

async function fileBytes(db: D1Database, fileId: string, workspaceId: string, ownerUserId: string) {
  const file = await db.prepare(
    `SELECT r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes
     FROM document_files WHERE id=? AND workspace_id=? AND owner_user_id=? AND archived_at IS NULL LIMIT 1`,
  ).bind(fileId, workspaceId, ownerUserId).first<{
    r2Key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>();
  if (!file) throw new ComparisonProcessingError("CORRUPT_FILE", "Одна из версий была удалена или недоступна.");
  const object = await getPrivateObject(file.r2Key);
  if (!object) throw new ComparisonProcessingError("CORRUPT_FILE", "Одна из версий отсутствует в приватном хранилище.");
  return { ...file, bytes: new Uint8Array(await object.arrayBuffer()) };
}

async function storeChanges(db: D1Database, comparisonId: string, changes: ComparisonChange[]) {
  await db.prepare("DELETE FROM comparison_changes WHERE comparison_id=?").bind(comparisonId).run();
  for (let offset = 0; offset < changes.length; offset += 60) {
    const batch = changes.slice(offset, offset + 60).map((change) => db.prepare(
      `INSERT INTO comparison_changes
       (id,comparison_id,ordinal,change_type,before_section_id,after_section_id,before_label,after_label,
        before_heading,after_heading,before_text,after_text,word_diff_json,summary,legal_effect,
        affected_party,risk_effect,risk_level,recommendation,source_ids_json,confidence_percent,
        reviewed_at,extraction_warning,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      change.id, comparisonId, change.ordinal, change.changeType,
      change.beforeSectionId, change.afterSectionId, change.beforeLabel, change.afterLabel,
      change.beforeHeading, change.afterHeading, change.beforeText, change.afterText,
      JSON.stringify(change.wordDiff), change.summary, change.legalEffect, change.affectedParty,
      change.riskEffect, change.riskLevel, change.recommendation, JSON.stringify(change.sourceIds),
      change.confidencePercent, change.reviewedAt, change.extractionWarning ? 1 : 0, isoNow(),
    ));
    if (batch.length) await db.batch(batch);
  }
}

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return response({ error: "Сравнение не найдено." }, 404);
  if (comparison.status === "completed") return response({ comparison: { id: comparisonId, status: comparison.status, stage: comparison.stage } });
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const lock = await db.prepare(
    `UPDATE document_comparisons SET status='processing',error_code=NULL,updated_at=?
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND deleted_at IS NULL
       AND (status!='processing' OR updated_at<?)`,
  ).bind(isoNow(), comparisonId, workspace.id, user.id, staleBefore).run();
  if (!lock.meta.changes) return response({ error: "Сравнение уже обрабатывается." }, 409);

  try {
    let versionOne = await loadExtractedDocument(comparison.versionOneJsonKey);
    if (!versionOne) {
      await updateStage(db, comparisonId, workspace.id, "extracting_version_one");
      const firstFile = await fileBytes(db, comparison.versionOneFileId, workspace.id, user.id);
      versionOne = await extractDocument(firstFile);
      const versionOneJsonKey = `workspaces/${workspace.id}/comparisons/${comparisonId}/version-one.json`;
      await putPrivateObject(versionOneJsonKey, new TextEncoder().encode(JSON.stringify(versionOne)), "application/json", {
        comparisonId, version: "one", workspaceId: workspace.id,
      });
      await db.prepare(
        "UPDATE document_comparisons SET version_one_json_key=?,updated_at=? WHERE id=? AND workspace_id=?",
      ).bind(versionOneJsonKey, isoNow(), comparisonId, workspace.id).run();
    }

    let versionTwo = await loadExtractedDocument(comparison.versionTwoJsonKey);
    if (!versionTwo) {
      await updateStage(db, comparisonId, workspace.id, "extracting_version_two");
      const secondFile = await fileBytes(db, comparison.versionTwoFileId, workspace.id, user.id);
      versionTwo = await extractDocument(secondFile);
      const versionTwoJsonKey = `workspaces/${workspace.id}/comparisons/${comparisonId}/version-two.json`;
      await putPrivateObject(versionTwoJsonKey, new TextEncoder().encode(JSON.stringify(versionTwo)), "application/json", {
        comparisonId, version: "two", workspaceId: workspace.id,
      });
      await db.prepare(
        "UPDATE document_comparisons SET version_two_json_key=?,updated_at=? WHERE id=? AND workspace_id=?",
      ).bind(versionTwoJsonKey, isoNow(), comparisonId, workspace.id).run();
    }

    await updateStage(db, comparisonId, workspace.id, "structuring");
    const locale = (comparison.locale === "uz" ? "uz" : "ru") as ComparisonLocale;
    await updateStage(db, comparisonId, workspace.id, "diffing");
    let result = compareDocuments(versionOne, versionTwo, locale);
    result = {
      ...result,
      changes: result.changes.map((change) => ({
        ...change,
        id: `${comparisonId}-change-${change.ordinal}`,
        extractionWarning: versionOne.textQuality !== "good" || versionTwo.textQuality !== "good",
      })),
    };

    let aiStatus: "completed" | "unavailable" | "not_required" | "failed" =
      result.summary.totalChanges ? "unavailable" : "not_required";
    let model: string | null = null;
    if (result.summary.totalChanges) {
      await updateStage(db, comparisonId, workspace.id, "legal_analysis");
      const sourceRows = await db.prepare(
        `SELECT id,act_title AS actTitle,act_identifier AS actIdentifier,official_url AS officialUrl,
          revision_date AS revisionDate,last_checked_at AS lastCheckedAt,locale,status
         FROM legal_sources WHERE status='verified' ORDER BY last_checked_at DESC LIMIT 80`,
      ).all();
      try {
        const enriched = await enrichComparisonChanges({
          changes: result.changes,
          locale,
          sources: filterTrustedVerifiedLegalSources(
            sourceRows.results as unknown as ComparisonLegalSource[],
          ),
        });
        result = { ...result, changes: enriched.changes };
        model = enriched.model;
        aiStatus = "completed";
      } catch (error) {
        aiStatus = error instanceof AiUnavailableError ? "unavailable" : "failed";
      }
    }

    const summary = summarizeChanges(result.changes, result.summary.similarityPercent, isoNow());
    summary.aiStatus = aiStatus;
    summary.model = model;
    summary.sourceStatus = result.changes.some((change) => change.sourceIds.length)
      ? (result.changes.every((change) => change.riskLevel === "information" || change.sourceIds.length) ? "verified" : "partial")
      : "unverified";
    result = { ...result, summary };
    await storeChanges(db, comparisonId, result.changes);
    const completedStatus = aiStatus === "completed" || aiStatus === "not_required" ? "completed" : "completed_partial";
    await db.batch([
      db.prepare(
        `UPDATE document_comparisons
         SET status=?,stage='completed',summary_json=?,similarity_percent=?,overall_risk=?,
           ai_status=?,model_name=?,model_version=?,error_code=NULL,updated_at=?
         WHERE id=? AND workspace_id=?`,
      ).bind(
        completedStatus, JSON.stringify(summary), summary.similarityPercent, summary.overallRisk,
        aiStatus, model ? "openai" : null, model, isoNow(), comparisonId, workspace.id,
      ),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_comparison',?,'comparison_completed',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, comparisonId, JSON.stringify({
        totalChanges: summary.totalChanges,
        materialChanges: summary.materialChanges,
        similarityPercent: summary.similarityPercent,
        aiStatus,
      }), isoNow()),
    ]);
    return response({ comparison: { id: comparisonId, status: completedStatus, stage: "completed", summary } });
  } catch (error) {
    const code = error instanceof ComparisonProcessingError ? error.code : "COMPARISON_PROCESSING_FAILED";
    await db.prepare(
      "UPDATE document_comparisons SET status='failed',error_code=?,updated_at=? WHERE id=? AND workspace_id=?",
    ).bind(code, isoNow(), comparisonId, workspace.id).run();
    const failedState = await db.prepare(
      "SELECT stage FROM document_comparisons WHERE id=? AND workspace_id=? LIMIT 1",
    ).bind(comparisonId, workspace.id).first<{ stage: string }>();
    return response({
      error: error instanceof ComparisonProcessingError ? error.message : "Сравнение не завершено. Повторите обработку.",
      code,
      comparison: { id: comparisonId, status: "failed", stage: failedState?.stage || comparison.stage },
    }, 422);
  }
});
