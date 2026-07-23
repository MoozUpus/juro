import { putPrivateObject } from "../storage/files";
import { runtimeEnv } from "../storage/runtime";
import type { DocumentLanguage } from "../types";

async function fetchStaticAsset(path: string, request: Request): Promise<ArrayBuffer> {
  const url = new URL(path, request.url);
  const assetFetcher = runtimeEnv().ASSETS;
  const response = assetFetcher
    ? await assetFetcher.fetch(new Request(url, { headers: { accept: "*/*" } }))
    : await fetch(url);
  if (!response.ok) throw new Error(`Static generation asset unavailable: ${path}`);
  return response.arrayBuffer();
}

export function loadDocxTemplate(language: DocumentLanguage, request: Request): Promise<ArrayBuffer> {
  return fetchStaticAsset(
    language === "ru" ? "/document-templates/receipt-ru.docx" : "/document-templates/receipt-uz-cyrl.docx",
    request,
  );
}

export function loadPdfFont(bold: boolean, request: Request): Promise<ArrayBuffer> {
  return fetchStaticAsset(
    bold ? "/document-templates/DejaVuSans-Bold-JURO.ttf" : "/document-templates/DejaVuSans-JURO.ttf",
    request,
  );
}

export function loadFooterMark(request: Request): Promise<ArrayBuffer> {
  return fetchStaticAsset("/document-templates/juro-mark-footer.png", request);
}

export async function ensureTemplatesInR2(language: DocumentLanguage, template: ArrayBuffer): Promise<void> {
  const bucket = runtimeEnv().BUCKET;
  if (!bucket) return;
  const key = `system/templates/receipt-${language}.docx`;
  if (!(await bucket.head(key))) {
    await putPrivateObject(key, template, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", {
      source: "approved-juro-receipt-template",
      language,
    });
  }
}
