import { renderAccountModuleRoute } from "../../../_platform/ModuleRoutePage";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  return renderAccountModuleRoute({ locale, accountType, module: "history" });
}
