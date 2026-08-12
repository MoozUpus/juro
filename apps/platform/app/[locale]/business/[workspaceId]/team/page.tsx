import { renderBusinessModuleRoute } from "../../../../_platform/ModuleRoutePage";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  return renderBusinessModuleRoute({ locale, workspaceId, module: "team" });
}
