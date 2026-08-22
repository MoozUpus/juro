import {
  isAccountType,
  isLocale,
  isWorkspaceId,
  platformBasePath,
  type PlatformLocale,
} from "./routing";

export type BuilderNavigationPaths = {
  locale: PlatformLocale | null;
  builder: string;
  library: string;
  documents: string;
  documentReview: string;
  contacts: string;
  notifications: string;
  category: (categorySlug: string) => string;
  template: (categorySlug: string, documentCode: string) => string;
  document: (documentId: string) => string;
  switchLocale: (locale: PlatformLocale) => string;
};

export type BuilderNavigationContext = {
  caseId?: string | null;
  planStepId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanPathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function withBuilderContext(path: string, context: BuilderNavigationContext): string {
  const params = new URLSearchParams();
  if (context.caseId && UUID_PATTERN.test(context.caseId)) {
    params.set("caseId", context.caseId);
    if (context.planStepId && UUID_PATTERN.test(context.planStepId)) {
      params.set("stepId", context.planStepId);
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function builderNavigationPaths(
  pathname: string,
  context: BuilderNavigationContext = {},
): BuilderNavigationPaths {
  const currentPath = cleanPathname(pathname);
  const segments = currentPath.split("/").filter(Boolean);
  const locale = segments[0];
  const accountType = segments[1];

  if (locale && accountType && isLocale(locale) && isAccountType(accountType)) {
    const canonicalBusinessRoots = new Set([
      "dashboard",
      "ai-chat",
      "cases",
      "documents",
      "document-builder",
      "contacts",
      "notifications",
      "document-review",
      "monitoring",
      "action-plan",
      "consultations",
      "knowledge",
      "history",
      "archive",
      "team",
      "billing",
      "security",
      "help",
      "profile",
      "settings",
    ]);
    const workspaceId = accountType === "business"
      && segments[2]
      && segments[3]
      && isWorkspaceId(segments[2])
      && canonicalBusinessRoots.has(segments[3])
      ? segments[2]
      : undefined;
    const base = platformBasePath(locale, accountType, workspaceId);
    const builder = `${base}/document-builder`;
    return {
      locale,
      builder: withBuilderContext(builder, context),
      library: withBuilderContext(builder, context),
      documents: `${base}/documents`,
      documentReview: `${base}/document-review`,
      contacts: `${base}/contacts`,
      notifications: `${base}/notifications`,
      category: (categorySlug) => withBuilderContext(
        `${builder}/${encodeURIComponent(categorySlug)}`,
        context,
      ),
      template: (categorySlug, documentCode) => withBuilderContext(
        `${builder}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`,
        context,
      ),
      document: (documentId) => `${base}/documents/${encodeURIComponent(documentId)}`,
      switchLocale: (nextLocale) => {
        const nextBase = platformBasePath(nextLocale, accountType, workspaceId);
        return withBuilderContext(`${nextBase}${currentPath.slice(base.length)}`, context);
      },
    };
  }

  const builder = "/document-builder";
  return {
    locale: null,
    builder: withBuilderContext(builder, context),
    library: withBuilderContext(`${builder}/library`, context),
    documents: `${builder}/documents`,
    documentReview: `${builder}/document-review`,
    contacts: `${builder}/contacts`,
    notifications: `${builder}/notifications`,
    category: (categorySlug) => withBuilderContext(
      `${builder}/${encodeURIComponent(categorySlug)}`,
      context,
    ),
    template: (categorySlug, documentCode) => withBuilderContext(
      `${builder}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`,
      context,
    ),
    document: (documentId) => `${builder}/documents/${encodeURIComponent(documentId)}`,
    switchLocale: () => withBuilderContext(currentPath, context),
  };
}
