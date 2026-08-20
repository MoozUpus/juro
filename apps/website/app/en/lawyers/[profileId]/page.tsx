import LawyerProfilePage, { generateMetadata as generateLocalizedMetadata } from "../../../[locale]/lawyers/[profileId]/page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  return generateLocalizedMetadata({ params: Promise.resolve({ locale: "en", profileId }) });
}

export default async function EnglishLawyerProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  return <LawyerProfilePage params={Promise.resolve({ locale: "en", profileId })} />;
}
