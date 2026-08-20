import TrustPage, { generateMetadata as generateLocalizedMetadata } from "../../[locale]/trust/page";

export async function generateMetadata() {
  return generateLocalizedMetadata({ params: Promise.resolve({ locale: "en" }) });
}

export default function EnglishTrustPage() {
  return <TrustPage params={Promise.resolve({ locale: "en" })} />;
}
