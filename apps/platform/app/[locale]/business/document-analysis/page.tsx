import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const FORWARDED_QUERY_KEYS = ["analysis", "analysisId", "caseId", "mode"] as const;

function reviewSearchParams(searchParams: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(FORWARDED_QUERY_KEYS.map((key) => [
    key,
    typeof searchParams[key] === "string" ? searchParams[key] : undefined,
  ]));
}

export default async function LegacyBusinessDocumentAnalysisRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return redirectLegacyBusinessRoute(locale, ["document-review"], reviewSearchParams(await searchParams));
}
