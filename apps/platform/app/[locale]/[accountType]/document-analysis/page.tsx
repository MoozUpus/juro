import { notFound, redirect } from "next/navigation";

import { isAccountType, isLocale } from "../../../../lib/platform/routing";

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

/**
 * Compatibility entry point for documented external links.
 * The active product surface is named `document-review`; keep the old
 * `document-analysis` contract usable without duplicating UI or state.
 */
export default async function DocumentAnalysisRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; accountType: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();

  redirect(`/${locale}/${accountType}/document-review${reviewSearchParams(await searchParams)}`);
}
