import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { loadDocxTemplate, loadFooterMark, loadPdfFont } from "../../../../../../lib/document-builder/generation/assets";
import { generateDocx } from "../../../../../../lib/document-builder/generation/docx";
import { generatePdf } from "../../../../../../lib/document-builder/generation/pdf";
import { sanitizeFileName } from "../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { comparisonReportParagraphs } from "../../../../../../lib/document-comparison/report";
import {
  comparisonChanges,
  comparisonForUser,
  parsedSummary,
  verifiedSourcesForChanges,
} from "../../../../../../lib/document-comparison/storage";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function utf8Disposition(fileName: string) {
  return `attachment; filename="juro-comparison"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function responseBody(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export const GET = withApiErrors(async function GET(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf";
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return Response.json({ error: "Сравнение не найдено." }, { status: 404 });
  if (!["completed", "completed_partial"].includes(comparison.status)) {
    return Response.json({ error: "Дождитесь завершения сравнения." }, { status: 409 });
  }
  const changes = await comparisonChanges(db, comparisonId);
  const sources = await verifiedSourcesForChanges(db, changes);
  const paragraphs = comparisonReportParagraphs({
    comparison,
    summary: parsedSummary(comparison.summaryJson),
    changes,
    sources,
  });
  const ru = comparison.locale !== "uz";
  const baseName = sanitizeFileName(
    `${ru ? "Сравнение" : "Taqqoslash"} ${comparison.versionOneName} — ${comparison.versionTwoName}`,
  ).replace(/\.(?:pdf|docx)$/i, "");
  if (format === "docx") {
    const template = await loadDocxTemplate(ru ? "ru" : "uz", request);
    const bytes = generateDocx(template, paragraphs);
    return new Response(responseBody(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": utf8Disposition(`${baseName}.docx`),
        "cache-control": "private, no-store",
      },
    });
  }
  const [regularFont, boldFont, footerMark] = await Promise.all([
    loadPdfFont(false, request),
    loadPdfFont(true, request),
    loadFooterMark(request),
  ]);
  const bytes = await generatePdf(paragraphs, regularFont, boldFont, footerMark, {
    title: ru ? "JURO — отчёт о сравнении документов" : "JURO — hujjatlarni taqqoslash hisoboti",
    producer: "JURO Document Comparison",
    footerLabel: ru ? "Сформировано в JURO" : "JURO’da yaratildi",
    pageLabel: ru ? "Страница" : "Sahifa",
  });
  return new Response(responseBody(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": utf8Disposition(`${baseName}.pdf`),
      "cache-control": "private, no-store",
    },
  });
});
