import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isCinematicPrototypeEnvironment } from "../../../../lib/platform/cinematic-prototype";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cinematic Legal Intelligence prototype",
  robots: { index: false, follow: false, nocache: true },
};

export default function CinematicPrototypeEntry() {
  if (!isCinematicPrototypeEnvironment(runtimeEnv().APP_ENV)) notFound();
  redirect("/uz/individual/prototypes/platform/cinematic");
}
