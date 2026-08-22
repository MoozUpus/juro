import { redirect } from "next/navigation";

export default async function LawyerProfileEntryPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  redirect(`/ru/lawyers/${encodeURIComponent(profileId)}`);
}
