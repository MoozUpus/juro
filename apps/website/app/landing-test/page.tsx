import type { Metadata } from "next";
import { LandingTestPage } from "../components/landing-test/LandingTestPage";

export const metadata: Metadata = {
  title: "JURO — Юрист в кармане",
  description: "AI-помощник и живые юристы в одном сервисе.",
};

export default function Page() {
  return <LandingTestPage />;
}
