import { notFound, redirect } from "next/navigation";

import { isLocale, isWorkspaceId, platformPath } from "../../../../lib/platform/routing";

export default async function BusinessWorkspaceIndex({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  redirect(platformPath(locale, "business", "dashboard", workspaceId));
}
