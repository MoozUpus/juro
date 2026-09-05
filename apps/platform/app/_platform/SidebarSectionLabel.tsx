import type { PlatformLocale } from "../../lib/platform/routing";

type Props = {
  locale: PlatformLocale;
  ru: string;
  uz: string;
  en: string;
};

export function SidebarSectionLabel({ locale, ru, uz, en }: Props) {
  return <small className="platform-sidebar-section-label">{{ ru, uz, en }[locale]}</small>;
}
