import { renderBusinessModuleRoute } from "../../../../_platform/ModuleRoutePage";

export const dynamic = "force-dynamic";

export default async function BusinessModulePage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string; module: string }>;
}) {
  const { locale, workspaceId, module } = await params;
  return renderBusinessModuleRoute({
    locale,
    workspaceId,
    module: module as Parameters<typeof renderBusinessModuleRoute>[0]["module"],
  });
}
