import { requireR2 } from "../document-builder/storage/runtime";
import { ComparisonProcessingError } from "./types";

export type ComparisonFileRecord = {
  r2Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
};

export async function comparisonFileForOwner(
  db: D1Database,
  fileId: string,
  workspaceId: string,
  ownerUserId: string,
): Promise<ComparisonFileRecord> {
  const file = await db.prepare(
    `SELECT r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256
     FROM document_files
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND archived_at IS NULL
     LIMIT 1`,
  ).bind(fileId, workspaceId, ownerUserId).first<ComparisonFileRecord>();
  if (!file) {
    throw new ComparisonProcessingError(
      "CORRUPT_FILE",
      "Одна из версий была удалена или недоступна.",
    );
  }
  return file;
}

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return Array.from(
    new Uint8Array(value),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function assertComparisonFileScanEvidence(
  file: ComparisonFileRecord,
  object: R2Object,
): void {
  const metadata = object.customMetadata ?? {};
  const clean = Boolean(
    file.sha256
    && object.size === file.sizeBytes
    && checksumHex(object.checksums.sha256) === file.sha256
    && metadata.sha256 === file.sha256
    && metadata.scanStatus === "clean"
    && metadata.scanId
    && metadata.scanProvider
    && metadata.scanEngine
    && metadata.scanEngineVersion
    && metadata.scanSignatureVersion
  );
  if (!clean) {
    throw new ComparisonProcessingError(
      "FILE_SCAN_REQUIRED",
      "Файл не имеет действующего подтверждения проверки безопасности. Загрузите его повторно.",
    );
  }
}

export async function assertStoredComparisonFileIsClean(
  file: ComparisonFileRecord,
  bucket: R2Bucket = requireR2(),
): Promise<void> {
  const object = await bucket.head(file.r2Key);
  if (!object) {
    throw new ComparisonProcessingError(
      "CORRUPT_FILE",
      "Одна из версий отсутствует в приватном хранилище.",
    );
  }
  assertComparisonFileScanEvidence(file, object);
}

export async function assertComparisonSourceFilesClean(
  db: D1Database,
  input: {
    versionOneFileId: string;
    versionTwoFileId: string;
    workspaceId: string;
    ownerUserId: string;
  },
  bucket: R2Bucket = requireR2(),
): Promise<[ComparisonFileRecord, ComparisonFileRecord]> {
  const files = await Promise.all([
    comparisonFileForOwner(db, input.versionOneFileId, input.workspaceId, input.ownerUserId),
    comparisonFileForOwner(db, input.versionTwoFileId, input.workspaceId, input.ownerUserId),
  ]) as [ComparisonFileRecord, ComparisonFileRecord];
  await Promise.all(files.map((file) => assertStoredComparisonFileIsClean(file, bucket)));
  return files;
}

export async function assertComparisonSourceFilesCleanById(
  db: D1Database,
  input: { comparisonId: string; workspaceId: string; ownerUserId: string },
  bucket: R2Bucket = requireR2(),
): Promise<[ComparisonFileRecord, ComparisonFileRecord]> {
  const comparison = await db.prepare(
    `SELECT version_one_file_id AS versionOneFileId,version_two_file_id AS versionTwoFileId
     FROM document_comparisons
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND deleted_at IS NULL
     LIMIT 1`,
  ).bind(input.comparisonId, input.workspaceId, input.ownerUserId).first<{
    versionOneFileId: string;
    versionTwoFileId: string;
  }>();
  if (!comparison) {
    throw new ComparisonProcessingError("CORRUPT_FILE", "Сравнение или его версии недоступны.");
  }
  return assertComparisonSourceFilesClean(db, {
    ...comparison,
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
  }, bucket);
}
