import { notFound, redirect } from "next/navigation";

import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessComparisonEntry({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  redirect(`${platformBasePath(locale, "business", workspaceId)}/document-review?mode=compare`);
}
