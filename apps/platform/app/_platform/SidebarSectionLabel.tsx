import type { PlatformLocale } from "../../lib/platform/routing";

type Props = {
  locale: PlatformLocale;
  ru: string;
  uz: string;
};

export function SidebarSectionLabel({ locale, ru, uz }: Props) {
  return <small className="platform-sidebar-section-label">{locale === "ru" ? ru : uz}</small>;
}
