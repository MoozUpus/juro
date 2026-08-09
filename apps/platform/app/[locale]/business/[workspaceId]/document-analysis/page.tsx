import { notFound, redirect } from "next/navigation";

import { isLocale, isWorkspaceId } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const FORWARDED_QUERY_KEYS = ["analysis", "analysisId", "caseId", "mode"] as const;

function reviewSearchParams(searchParams: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of FORWARDED_QUERY_KEYS) {
    const value = searchParams[key];
    if (typeof value === "string") query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function BusinessDocumentAnalysisRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();

  redirect(`/${locale}/business/${encodeURIComponent(workspaceId)}/document-review${reviewSearchParams(await searchParams)}`);
}
