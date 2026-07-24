import { assertSafeWrite, requireApiUser } from "../../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse, notFound } from "../../../../../../lib/document-builder/auth/responses";
import { loadDocxTemplate, loadFooterMark, loadPdfFont, ensureTemplatesInR2 } from "../../../../../../lib/document-builder/generation/assets";
import { generateDocx } from "../../../../../../lib/document-builder/generation/docx";
import { paragraphsFromFinalText } from "../../../../../../lib/document-builder/generation/paragraphs";
import { generatePdf } from "../../../../../../lib/document-builder/generation/pdf";
import { generateZip } from "../../../../../../lib/document-builder/generation/zip";
import { loadStoredDocument, requireOwner } from "../../../../../../lib/document-builder/permissions";
import { addActivity, isoNow } from "../../../../../../lib/document-builder/storage/db";
import { putPrivateObject, sanitizeFileName } from "../../../../../../lib/document-builder/storage/files";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { renderReceipt } from "../../../../../../lib/document-builder/templates/receipt";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const ownerAccess = await requireOwner(id, user.id);
    if (!ownerAccess) return forbidden();
    if (ownerAccess.document.status === "Архив") return badRequest("Сначала восстановите документ из архива.");
    const document = await loadStoredDocument(id, user.id);
    if (!document) return notFound();
    if (!document.answers.accuracyConfirmed) {
      return badRequest("Подтвердите достоверность данных и условия использования шаблона.", "CONFIRMATION_REQUIRED");
    }

    const rendered = renderReceipt(document.answers);
    const paragraphs = document.manuallyEdited ? paragraphsFromFinalText(document.finalContent) : rendered.paragraphs;
    const [template, regularFont, boldFont, footerMark] = await Promise.all([
      loadDocxTemplate(document.language, request),
      loadPdfFont(false, request),
      loadPdfFont(true, request),
      loadFooterMark(request),
    ]);
    await ensureTemplatesInR2(document.language, template.slice(0));
    const docx = generateDocx(template, paragraphs);
    const pdf = await generatePdf(paragraphs, regularFont, boldFont, footerMark);
    const baseName = sanitizeFileName(document.title).replace(/\.(?:docx|pdf|zip)$/i, "");
    const zip = generateZip([
      { name: `${baseName}.docx`, bytes: docx },
      { name: `${baseName}.pdf`, bytes: pdf },
    ]);

    const db = requireD1();
    const bucket = requireR2();
    const old = await db.prepare("SELECT r2_key AS r2Key FROM document_files WHERE document_id = ? AND kind IN ('docx', 'pdf', 'zip')")
      .bind(id).all<{ r2Key: string }>();
    const now = isoNow();
    const docxId = crypto.randomUUID();
    const pdfId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    const prefix = `users/${user.id}/documents/${id}/generated`;
    const docxKey = `${prefix}/${docxId}.docx`;
    const pdfKey = `${prefix}/${pdfId}.pdf`;
    const zipKey = `${prefix}/${zipId}.zip`;
    await Promise.all([
      putPrivateObject(docxKey, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", { documentId: id, kind: "docx" }),
      putPrivateObject(pdfKey, pdf, "application/pdf", { documentId: id, kind: "pdf" }),
      putPrivateObject(zipKey, zip, "application/zip", { documentId: id, kind: "zip" }),
    ]);
    await db.batch([
      db.prepare("DELETE FROM document_files WHERE document_id = ? AND kind IN ('docx', 'pdf', 'zip')").bind(id),
      db.prepare("INSERT INTO document_files (id, document_id, owner_user_id, kind, r2_key, file_name, mime_type, size_bytes, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'docx', ?, ?, ?, ?, NULL, ?, ?)")
        .bind(docxId, id, user.id, docxKey, `${baseName}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx.byteLength, now, now),
      db.prepare("INSERT INTO document_files (id, document_id, owner_user_id, kind, r2_key, file_name, mime_type, size_bytes, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'pdf', ?, ?, 'application/pdf', ?, NULL, ?, ?)")
        .bind(pdfId, id, user.id, pdfKey, `${baseName}.pdf`, pdf.byteLength, now, now),
      db.prepare("INSERT INTO document_files (id, document_id, owner_user_id, kind, r2_key, file_name, mime_type, size_bytes, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'zip', ?, ?, 'application/zip', ?, NULL, ?, ?)")
        .bind(zipId, id, user.id, zipKey, `${baseName}.zip`, zip.byteLength, now, now),
      db.prepare("UPDATE documents SET status = 'Готов', generated_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?").bind(now, now, id),
    ]);
    if (old.results.length) await bucket.delete(old.results.map((file) => file.r2Key));
    await addActivity(id, user.id, "document_generated");
    const filePath = (fileId: string) => `/api/document-builder/documents/${id}/files/${fileId}`;
    return jsonResponse({
      status: "Готов",
      files: {
        docx: { id: docxId, name: `${baseName}.docx`, url: filePath(docxId), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: docx.byteLength },
        pdf: { id: pdfId, name: `${baseName}.pdf`, url: filePath(pdfId), mimeType: "application/pdf", size: pdf.byteLength },
        zip: { id: zipId, name: `${baseName}.zip`, url: filePath(zipId), mimeType: "application/zip", size: zip.byteLength },
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
