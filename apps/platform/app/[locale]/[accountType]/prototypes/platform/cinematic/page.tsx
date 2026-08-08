import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CinematicPrototypeSurface } from "../../../../../_platform/CinematicPrototypeSurface";
import "../../../../../_platform/cinematic-prototype.css";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { isCinematicPrototypeEnvironment } from "../../../../../../lib/platform/cinematic-prototype";
import { isAccountType, isLocale, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cinematic Legal Intelligence prototype",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CinematicPrototypePage({
  params,
}: {
  params: Promise<{ locale: string; accountType: string }>;
}) {
  const { locale, accountType } = await params;
  if (
    !isCinematicPrototypeEnvironment(runtimeEnv().APP_ENV)
    || !isLocale(locale)
    || !isAccountType(accountType)
    || accountType === "business"
  ) notFound();

  const basePath = platformBasePath(locale, accountType);
  const returnTo = `${basePath}/prototypes/platform/cinematic`;
  const user = await requireChatGPTUser(returnTo);

  return (
    <CinematicPrototypeSurface
      locale={locale}
      accountType={accountType}
      basePath={basePath}
      userName={user.fullName ?? user.displayName}
    />
  );
}
