import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { parsePrivateDocumentLocator } from "../../../../../../lib/document-analysis/private-document-locator";
import { normalizeArticleNumber } from "../../../../../../lib/legal/legal-language";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";
import { trackProductEvent } from "../../../../../../lib/platform/analytics";

type Context = { params: Promise<{ messageId: string }> };

type CitationRow = {
  title: string;
  articleReference: string | null;
  excerpt: string | null;
  documentStatus: string | null;
  effectiveDate: string | null;
  canonicalUrl: string;
  sourceLocale: string;
  validatedAt: string;
  sourceKind: string;
  contentSha256: string;
};

type PrivateDocumentRow = {
  vectorId: string;
  charStart: number;
  charEnd: number;
  page: number;
  documentVersionId: string;
  sourceHash: string;
  language: string;
  r2Key: string;
  sizeBytes: number;
  fileName: string;
  version: number;
  createdAt: string;
};

type CorpusArticleRow = {
  documentId: string;
  variantId: string;
  documentTitle: string;
  documentType: string | null;
  documentNumber: string | null;
  adoptingAuthority: string | null;
  sourceClass: string;
  articleNumber: string | null;
  articleTitle: string | null;
  part: string | null;
  chapter: string | null;
  section: string | null;
  text: string;
  textLength: number;
  language: string;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  versionDate: string | null;
  sourceUrl: string;
  fetchedAt: string;
};

type CorpusLanguageRow = {
  language: string;
  sourceUrl: string | null;
  verifiedAt: string;
  official: number;
};

type CorpusVersionRow = {
  versionNumber: number;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  versionDate: string | null;
  fetchedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ARTICLE_CHARACTERS = 200_000;
const MAX_ARTICLE_PARTS = 64;
const MAX_PRIVATE_DOCUMENT_CHARACTERS = 200_000;

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function officialLexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username && !url.password && !url.port && !url.hash
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      && /^(?:\/(?:ru|uz|uzc|en))?\/docs\/-?\d+\/?$/u.test(url.pathname)
      && url.search === "";
  } catch {
    return false;
  }
}

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedArticle(value: string | null): string | null {
  if (!value) return null;
  const direct = normalizeArticleNumber(value);
  if (direct) return direct;
  const number = value.match(/\d+(?:\s*[-.‐‑–—]\s*[\p{L}\d]+)?/u)?.[0] ?? "";
  return normalizeArticleNumber(number) || null;
}

export const GET = withApiErrors(async function GET(request: Request, context: Context) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { messageId } = await context.params;
  const sourceUrl = new URL(request.url).searchParams.get("sourceUrl") ?? "";
  const privateVectorId = parsePrivateDocumentLocator(sourceUrl);
  if (!UUID.test(messageId) || sourceUrl.length > 2_000 || (!officialLexUrl(sourceUrl) && !privateVectorId)) {
    return response({ code: "CITATION_UNAVAILABLE" }, 404);
  }
  const db = requireD1();
  const citation = await db.prepare(`SELECT reference.title,
      reference.article_reference AS articleReference,reference.excerpt,
      reference.document_status AS documentStatus,reference.effective_date AS effectiveDate,
      reference.canonical_url AS canonicalUrl,reference.source_locale AS sourceLocale,
      reference.validated_at AS validatedAt,reference.source_kind AS sourceKind,
      reference.content_sha256 AS contentSha256
    FROM legal_source_references AS reference
    INNER JOIN conversations AS conversation ON conversation.id=reference.conversation_id
    WHERE reference.message_id=? AND reference.canonical_url=?
      AND reference.citation_validation_status='validated'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1`).bind(messageId, sourceUrl, workspace.id, user.id).first<CitationRow>();
  if (!citation) return response({ code: "CITATION_UNAVAILABLE" }, 404);

  if (privateVectorId) {
    if (citation.sourceKind !== "internal") return response({ code: "CITATION_UNAVAILABLE" }, 404);
    const privateDocument = await db.prepare(`SELECT
        chunk.vector_id AS vectorId,chunk.char_start AS charStart,chunk.char_end AS charEnd,chunk.page,
        job.document_version_id AS documentVersionId,job.source_hash AS sourceHash,job.language,
        version.r2_key AS r2Key,version.size_bytes AS sizeBytes,version.file_name AS fileName,
        version.version,version.created_at AS createdAt
      FROM user_document_vector_chunks AS chunk
      INNER JOIN user_document_index_jobs AS job ON job.id=chunk.job_id AND job.status='submitted'
      INNER JOIN analysis_document_versions AS version ON version.id=job.document_version_id
        AND version.analysis_id=job.analysis_id AND version.workspace_id=job.workspace_id
        AND version.owner_user_id=job.owner_user_id AND version.sha256=job.source_hash
      INNER JOIN document_analyses AS analysis ON analysis.id=job.analysis_id
        AND analysis.workspace_id=job.workspace_id AND analysis.owner_user_id=job.owner_user_id
      WHERE chunk.vector_id=? AND chunk.status='submitted' AND job.workspace_id=?
        AND analysis.status='completed' AND job.source_hash=?
        AND (job.access_scope='workspace' OR (job.access_scope='owner' AND job.owner_user_id=?))
        AND version.version=(SELECT max(latest.version) FROM analysis_document_versions latest
          WHERE latest.analysis_id=job.analysis_id AND latest.workspace_id=job.workspace_id)
      LIMIT 1`).bind(
      privateVectorId, workspace.id, citation.contentSha256, user.id,
    ).first<PrivateDocumentRow>();
    if (!privateDocument) return response({ code: "CITATION_UNAVAILABLE" }, 404);
    const object = await requireR2().get(privateDocument.r2Key);
    if (
      !object
      || object.size !== Number(privateDocument.sizeBytes)
      || checksumHex(object.checksums.sha256) !== privateDocument.sourceHash
    ) return response({ code: "CITATION_UNAVAILABLE" }, 404);
    const bytes = await object.arrayBuffer();
    if (await sha256(bytes) !== privateDocument.sourceHash) {
      return response({ code: "CITATION_UNAVAILABLE" }, 404);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    } catch {
      return response({ code: "CITATION_UNAVAILABLE" }, 404);
    }
    const displayed = text.slice(0, MAX_PRIVATE_DOCUMENT_CHARACTERS);
    trackProductEvent({ event: "source_opened", surface: "ai_chat" });
    return response({
      documentTitle: privateDocument.fileName,
      documentType: "uploaded_document",
      documentNumber: null,
      adoptingAuthority: null,
      sourceClass: "USER_TRUSTED_PRIVATE",
      articleNumber: null,
      articleTitle: null,
      part: Number(privateDocument.page) > 0 ? `page:${privateDocument.page}` : null,
      chapter: null,
      section: null,
      text: displayed || citation.excerpt,
      fullArticle: false,
      fullDocument: displayed.length > 0,
      privateSource: true,
      truncated: text.length > displayed.length,
      language: privateDocument.language,
      status: "user_supplied",
      validFrom: null,
      validTo: null,
      versionDate: privateDocument.createdAt,
      officialUrl: citation.canonicalUrl,
      verifiedAt: citation.validatedAt,
      availableLanguages: [],
      versionHistory: [{
        versionNumber: privateDocument.version,
        status: "user_supplied",
        validFrom: null,
        validTo: null,
        versionDate: privateDocument.createdAt,
        fetchedAt: citation.validatedAt,
      }],
    });
  }
  if (citation.sourceKind !== "lex") return response({ code: "CITATION_UNAVAILABLE" }, 404);

  const articleNumber = normalizedArticle(citation.articleReference);
  const articles = articleNumber ? await db.prepare(`SELECT
      document.id AS documentId,variant.id AS variantId,
      coalesce(variant.title,document.title) AS documentTitle,
      document.document_type AS documentType,document.document_number AS documentNumber,
      document.adopting_authority AS adoptingAuthority,document.source_class AS sourceClass,
      provision.article_number AS articleNumber,provision.article_title AS articleTitle,
      provision.part,provision.chapter,provision.section,
      substr(provision.text,1,?) AS text,length(provision.text) AS textLength,
      provision.language,version.status,coalesce(provision.valid_from,version.valid_from) AS validFrom,
      coalesce(provision.valid_to,version.valid_to) AS validTo,version.version_date AS versionDate,
      provision.source_url AS sourceUrl,version.fetched_at AS fetchedAt
    FROM legal_corpus_variants AS variant
    INNER JOIN legal_corpus_documents AS document ON document.id=variant.document_id
    INNER JOIN legal_corpus_versions AS version ON version.id=variant.current_version_id
    INNER JOIN legal_corpus_provisions AS provision ON provision.version_id=version.id
    WHERE variant.source_url=? AND provision.article_number_normalized=?
      AND document.scope='global' AND document.availability_status='ready'
    ORDER BY provision.sequence ASC LIMIT ?`).bind(
    MAX_ARTICLE_CHARACTERS, sourceUrl, articleNumber, MAX_ARTICLE_PARTS,
  ).all<CorpusArticleRow>() : null;
  const articleRows = articles?.results ?? [];
  const article = articleRows[0] ?? null;
  const languageRows = article ? (await db.prepare(`SELECT
      language,source_url AS sourceUrl,last_verified_at AS verifiedAt,
      is_official_language_version AS official
    FROM legal_corpus_variants
    WHERE document_id=?
    ORDER BY CASE language WHEN 'uz-Latn' THEN 1 WHEN 'uz-Cyrl' THEN 2 WHEN 'ru' THEN 3 ELSE 4 END
    LIMIT 8`).bind(article.documentId).all<CorpusLanguageRow>()).results : [];
  const versionRows = article ? (await db.prepare(`SELECT
      version_number AS versionNumber,status,valid_from AS validFrom,valid_to AS validTo,
      version_date AS versionDate,fetched_at AS fetchedAt
    FROM legal_corpus_versions
    WHERE variant_id=?
    ORDER BY version_number DESC,fetched_at DESC
    LIMIT 20`).bind(article.variantId).all<CorpusVersionRow>()).results : [];
  const combinedArticleText = articleRows
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const articleText = combinedArticleText.slice(0, MAX_ARTICLE_CHARACTERS);
  const truncated = articleRows.length === MAX_ARTICLE_PARTS
    || combinedArticleText.length > MAX_ARTICLE_CHARACTERS
    || articleRows.some((row) => row.textLength > row.text.length);

  trackProductEvent({ event: "source_opened", surface: "ai_chat" });
  return response({
    documentTitle: article?.documentTitle ?? citation.title,
    documentType: article?.documentType ?? null,
    documentNumber: article?.documentNumber ?? null,
    adoptingAuthority: article?.adoptingAuthority ?? null,
    sourceClass: article?.sourceClass ?? "OFFICIAL_LEGISLATION",
    articleNumber: article?.articleNumber ?? citation.articleReference,
    articleTitle: article?.articleTitle ?? null,
    part: article?.part ?? null,
    chapter: article?.chapter ?? null,
    section: article?.section ?? null,
    text: articleText || citation.excerpt,
    fullArticle: Boolean(article),
    truncated,
    language: article?.language ?? citation.sourceLocale,
    status: article?.status ?? citation.documentStatus ?? "unknown",
    validFrom: article?.validFrom ?? citation.effectiveDate,
    validTo: article?.validTo ?? null,
    versionDate: article?.versionDate ?? citation.effectiveDate,
    officialUrl: citation.canonicalUrl,
    verifiedAt: article?.fetchedAt ?? citation.validatedAt,
    availableLanguages: languageRows.flatMap((row) => row.sourceUrl && officialLexUrl(row.sourceUrl) ? [{
      language: row.language,
      officialUrl: row.sourceUrl,
      verifiedAt: row.verifiedAt,
      official: row.official === 1,
    }] : []),
    versionHistory: versionRows,
  });
});
