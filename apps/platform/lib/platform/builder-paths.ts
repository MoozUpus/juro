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
  contacts: string;
  notifications: string;
  category: (categorySlug: string) => string;
  template: (categorySlug: string, documentCode: string) => string;
  document: (documentId: string) => string;
  switchLocale: (locale: PlatformLocale) => string;
};

function cleanPathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function builderNavigationPaths(pathname: string): BuilderNavigationPaths {
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
      builder,
      library: builder,
      documents: `${base}/documents`,
      contacts: `${base}/contacts`,
      notifications: `${base}/notifications`,
      category: (categorySlug) => `${builder}/${encodeURIComponent(categorySlug)}`,
      template: (categorySlug, documentCode) => `${builder}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`,
      document: (documentId) => `${base}/documents/${encodeURIComponent(documentId)}`,
      switchLocale: (nextLocale) => {
        const nextBase = platformBasePath(nextLocale, accountType, workspaceId);
        return `${nextBase}${currentPath.slice(base.length)}`;
      },
    };
  }

  const builder = "/document-builder";
  return {
    locale: null,
    builder,
    library: `${builder}/library`,
    documents: `${builder}/documents`,
    contacts: `${builder}/contacts`,
    notifications: `${builder}/notifications`,
    category: (categorySlug) => `${builder}/${encodeURIComponent(categorySlug)}`,
    template: (categorySlug, documentCode) => `${builder}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`,
    document: (documentId) => `${builder}/documents/${encodeURIComponent(documentId)}`,
    switchLocale: () => currentPath,
  };
}
