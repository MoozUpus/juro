import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { normalizeArticleNumber } from "../../../../../../lib/legal/legal-language";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

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
};

type CorpusArticleRow = {
  documentTitle: string;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ARTICLE_CHARACTERS = 200_000;
const MAX_ARTICLE_PARTS = 64;

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
  if (!UUID.test(messageId) || sourceUrl.length > 2_000 || !officialLexUrl(sourceUrl)) {
    return response({ code: "CITATION_UNAVAILABLE" }, 404);
  }
  const db = requireD1();
  const citation = await db.prepare(`SELECT reference.title,
      reference.article_reference AS articleReference,reference.excerpt,
      reference.document_status AS documentStatus,reference.effective_date AS effectiveDate,
      reference.canonical_url AS canonicalUrl,reference.source_locale AS sourceLocale,
      reference.validated_at AS validatedAt
    FROM legal_source_references AS reference
    INNER JOIN conversations AS conversation ON conversation.id=reference.conversation_id
    WHERE reference.message_id=? AND reference.canonical_url=?
      AND reference.citation_validation_status='validated'
      AND conversation.workspace_id=? AND conversation.owner_user_id=?
    LIMIT 1`).bind(messageId, sourceUrl, workspace.id, user.id).first<CitationRow>();
  if (!citation) return response({ code: "CITATION_UNAVAILABLE" }, 404);

  const articleNumber = normalizedArticle(citation.articleReference);
  const articles = articleNumber ? await db.prepare(`SELECT
      coalesce(variant.title,document.title) AS documentTitle,
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
  const combinedArticleText = articleRows
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const articleText = combinedArticleText.slice(0, MAX_ARTICLE_CHARACTERS);
  const truncated = articleRows.length === MAX_ARTICLE_PARTS
    || combinedArticleText.length > MAX_ARTICLE_CHARACTERS
    || articleRows.some((row) => row.textLength > row.text.length);

  return response({
    documentTitle: article?.documentTitle ?? citation.title,
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
  });
});
