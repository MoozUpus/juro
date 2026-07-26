import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import {
  deletePrivateObject,
  getPrivateObject,
  putPrivateObject,
  sanitizeFileName,
  sha256Hex,
  validateUploadBytes,
} from "../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

type ExistingFile = {
  id: string;
  r2Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
};

type PreparedFile = ExistingFile & {
  created: boolean;
  bytes: Uint8Array | null;
};

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function prepareFile(input: {
  form: FormData;
  fileField: string;
  existingField: string;
  comparisonId: string;
  version: "one" | "two";
  workspaceId: string;
  userId: string;
}): Promise<PreparedFile> {
  const db = requireD1();
  const existingId = String(input.form.get(input.existingField) || "").trim();
  if (existingId) {
    const existing = await db.prepare(
      `SELECT id,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
        size_bytes AS sizeBytes,sha256
       FROM document_files
       WHERE id=? AND workspace_id=? AND owner_user_id=? AND archived_at IS NULL LIMIT 1`,
    ).bind(existingId, input.workspaceId, input.userId).first<ExistingFile>();
    if (!existing) throw new Error("COMPARISON_FILE_ACCESS_DENIED");
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(existing.mimeType)) {
      throw new Error("UNSUPPORTED_FILE");
    }
    if (!existing.sha256) {
      const object = await getPrivateObject(existing.r2Key);
      if (!object) throw new Error("COMPARISON_FILE_ACCESS_DENIED");
      const bytes = new Uint8Array(await object.arrayBuffer());
      const inspection = validateUploadBytes(
        new File([Uint8Array.from(bytes).buffer], existing.fileName, { type: existing.mimeType }),
        bytes,
      );
      if (inspection) throw new Error(`${inspection.code}:${inspection.message}`);
      existing.sha256 = await sha256Hex(bytes);
      await db.prepare(
        "UPDATE document_files SET sha256=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
      ).bind(existing.sha256, isoNow(), existing.id, input.workspaceId, input.userId).run();
    }
    return { ...existing, created: false, bytes: null };
  }

  const file = input.form.get(input.fileField);
  if (!(file instanceof File)) throw new Error(`COMPARISON_${input.version.toLocaleUpperCase()}_FILE_REQUIRED`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = validateUploadBytes(file, bytes);
  if (inspection) throw new Error(`${inspection.code}:${inspection.message}`);
  const id = crypto.randomUUID();
  const fileName = sanitizeFileName(file.name);
  const extension = fileName.split(".").pop()?.toLocaleLowerCase() || "bin";
  const r2Key = `workspaces/${input.workspaceId}/comparisons/${input.comparisonId}/version-${input.version}-${id}.${extension}`;
  return {
    id,
    r2Key,
    fileName,
    mimeType: file.type,
    sizeBytes: file.size,
    sha256: await sha256Hex(bytes),
    created: true,
    bytes,
  };
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [comparisons, reusableFiles] = await db.batch([
    db.prepare(
      `SELECT c.id,c.status,c.stage,c.summary_json AS summaryJson,c.error_code AS errorCode,
        c.similarity_percent AS similarityPercent,c.overall_risk AS overallRisk,
        c.created_at AS createdAt,c.updated_at AS updatedAt,
        one.file_name AS versionOneName,two.file_name AS versionTwoName
       FROM document_comparisons c
       JOIN document_files one ON one.id=c.version_one_file_id
       JOIN document_files two ON two.id=c.version_two_file_id
       WHERE c.workspace_id=? AND c.owner_user_id=? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC LIMIT 50`,
    ).bind(workspace.id, user.id),
    db.prepare(
      `SELECT id,file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes,sha256,created_at AS createdAt
       FROM document_files
       WHERE workspace_id=? AND owner_user_id=? AND archived_at IS NULL
         AND mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
       ORDER BY created_at DESC LIMIT 30`,
    ).bind(workspace.id, user.id),
  ]);
  return response({ comparisons: comparisons.results, reusableFiles: reusableFiles.results });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const form = await request.formData();
  const locale = form.get("locale") === "uz" ? "uz" : "ru";
  if (form.get("consent") !== "true") {
    return response({
      error: locale === "ru"
        ? "Подтвердите согласие на приватное сохранение и сравнение двух файлов."
        : "Ikki faylni maxfiy saqlash va taqqoslashga rozilikni tasdiqlang.",
    }, 400);
  }

  const comparisonId = crypto.randomUUID();
  const prepared: PreparedFile[] = [];
  try {
    const versionOne = await prepareFile({
      form, fileField: "versionOne", existingField: "versionOneFileId",
      comparisonId, version: "one", workspaceId: workspace.id, userId: user.id,
    });
    prepared.push(versionOne);
    const versionTwo = await prepareFile({
      form, fileField: "versionTwo", existingField: "versionTwoFileId",
      comparisonId, version: "two", workspaceId: workspace.id, userId: user.id,
    });
    prepared.push(versionTwo);
    if (versionOne.id === versionTwo.id) {
      return response({
        error: locale === "ru" ? "Выберите два независимых файла или версии." : "Ikki mustaqil fayl yoki versiyani tanlang.",
        code: "SAME_FILE_REFERENCE",
      }, 400);
    }

    for (const file of prepared) {
      if (file.created && file.bytes) {
        await putPrivateObject(file.r2Key, file.bytes, file.mimeType, {
          workspaceId: workspace.id,
          ownerUserId: user.id,
          comparisonId,
          sha256: file.sha256 || "",
        });
      }
    }

    const db = requireD1();
    const now = isoNow();
    const statements: D1PreparedStatement[] = [];
    for (const file of prepared) {
      if (!file.created) continue;
      statements.push(db.prepare(
        `INSERT INTO document_files
         (id,workspace_id,document_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,archived_at,created_at,updated_at)
         VALUES (?,?,NULL,?,'comparison_version',?,?,?,?,?,NULL,?,?)`,
      ).bind(
        file.id, workspace.id, user.id, file.r2Key, file.fileName, file.mimeType,
        file.sizeBytes, file.sha256, now, now,
      ));
    }
    statements.push(
      db.prepare(
        `INSERT INTO document_comparisons
         (id,workspace_id,owner_user_id,version_one_file_id,version_two_file_id,status,stage,locale,created_at,updated_at)
         VALUES (?,?,?,?,?,'queued','uploaded',?,?,?)`,
      ).bind(comparisonId, workspace.id, user.id, versionOne.id, versionTwo.id, locale, now, now),
      db.prepare(
        `INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at)
         VALUES (?,?,?,'document_comparison','2026-07-26',?,?)`,
      ).bind(crypto.randomUUID(), user.id, workspace.id, JSON.stringify({
        comparisonId,
        versionOneFileId: versionOne.id,
        versionTwoFileId: versionTwo.id,
      }), now),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_comparison',?,'comparison_created',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, comparisonId, JSON.stringify({
        versionOneSha256: versionOne.sha256,
        versionTwoSha256: versionTwo.sha256,
      }), now),
    );
    await db.batch(statements);
    return response({
      comparison: {
        id: comparisonId,
        status: "queued",
        stage: "uploaded",
        versionOneName: versionOne.fileName,
        versionTwoName: versionTwo.fileName,
      },
      warning: versionOne.sha256 && versionOne.sha256 === versionTwo.sha256
        ? (locale === "ru" ? "Файлы идентичны по SHA-256. Сравнение всё равно будет выполнено." : "Fayllar SHA-256 bo‘yicha bir xil. Taqqoslash baribir bajariladi.")
        : null,
    }, 201);
  } catch (error) {
    await Promise.all(prepared
      .filter((file) => file.created)
      .map((file) => deletePrivateObject(file.r2Key).catch(() => undefined)));
    const message = error instanceof Error ? error.message : String(error);
    const [code, detail] = message.includes(":") ? message.split(/:(.*)/s, 2) : [message, ""];
    if ([
      "EMPTY_FILE", "FILE_TOO_LARGE", "UNSUPPORTED_FILE", "CONTENT_TYPE_MISMATCH",
      "CORRUPT_DOCX", "COMPARISON_ONE_FILE_REQUIRED", "COMPARISON_TWO_FILE_REQUIRED",
      "COMPARISON_FILE_ACCESS_DENIED",
    ].includes(code)) {
      return response({ error: detail || (locale === "ru" ? "Проверьте выбранные файлы." : "Tanlangan fayllarni tekshiring."), code }, 400);
    }
    throw error;
  }
});
