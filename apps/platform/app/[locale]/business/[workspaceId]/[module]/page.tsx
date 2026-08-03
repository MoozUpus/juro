import { notFound } from "next/navigation";

import { ModuleContent } from "../../../../_platform/ModuleContent";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import {
  isLocale,
  isPlatformModule,
  isWorkspaceId,
  platformPath,
} from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessModulePage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string; module: string }>;
}) {
  const { locale, workspaceId, module } = await params;
  if (
    !isLocale(locale)
    || !isWorkspaceId(workspaceId)
    || !isPlatformModule(module)
  ) notFound();
  const user = await requireChatGPTUser(
    platformPath(locale, "business", module, workspaceId),
  );
  return (
    <ModuleContent
      locale={locale}
      accountType="business"
      module={module}
      userName={user.fullName ?? user.displayName}
      workspaceId={workspaceId}
    />
  );
}
