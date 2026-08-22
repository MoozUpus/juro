import { UserRound } from "lucide-react";
import type {
  AccountType,
  PlatformLocale,
  PlatformModule,
} from "../../lib/platform/routing";
import { ActionPlanClient } from "./ActionPlanClient";
import { ConsultationsClient } from "./ConsultationsClient";
import { LawyerHandoffClient } from "./LawyerHandoffClient";
import { DashboardClient } from "./DashboardClient";
import { CasesClient } from "./CasesClient";
import { TeamClient } from "./TeamClient";
import { AiLawyerClient } from "./AiLawyerClient";
import { BillingClient } from "./BillingClient";
import { DemoPaymentsClient } from "./DemoPaymentsClient";
import { ProfileSettingsClient } from "./ProfileSettingsClient";
import { DocumentReviewClient } from "./DocumentReviewClient";
import { HistoryClient } from "./HistoryClient";
import { ArchiveClient } from "./ArchiveClient";
import { HelpClient } from "./HelpClient";
import { MonitoringClient } from "./MonitoringClient";
import { CalendarClient } from "./CalendarClient";
import { LawyerKnowledgeClient } from "./LawyerKnowledgeClient";
import {
  LawyerDashboardClient,
  LawyerHubClient,
  LawyerScheduleClient,
} from "./LawyerWorkspaceClient";

const titles: Record<PlatformModule, { ru: string; uz: string }> = {
  dashboard: { ru: "Главная", uz: "Bosh sahifa" },
  "ai-chat": { ru: "AI-юрист", uz: "AI-yurist" },
  cases: { ru: "Мои дела", uz: "Mening ishlarim" },
  "document-review": { ru: "Проверить документ", uz: "Hujjatni tekshirish" },
  monitoring: {
    ru: "Мониторинг законодательства",
    uz: "Qonunchilik monitoringi",
  },
  "action-plan": { ru: "План действий", uz: "Harakatlar rejasi" },
  calendar: { ru: "Календарь", uz: "Kalendar" },
  consultations: { ru: "Консультации", uz: "Maslahatlar" },
  knowledge: { ru: "База знаний", uz: "Bilimlar bazasi" },
  history: { ru: "История", uz: "Tarix" },
  archive: { ru: "Архив", uz: "Arxiv" },
  team: { ru: "Команда", uz: "Jamoa" },
  billing: { ru: "Тариф и оплата", uz: "Tarif va to‘lov" },
  "demo-payments": { ru: "Демонстрация платежей", uz: "To‘lovlar namoyishi" },
  security: { ru: "Безопасность", uz: "Xavfsizlik" },
  help: { ru: "Помощь", uz: "Yordam" },
  profile: { ru: "Профиль", uz: "Profil" },
  settings: { ru: "Настройки языка", uz: "Til sozlamalari" },
};

export function ModuleContent({
  locale,
  accountType,
  module,
  userName,
  workspaceId,
  publicUrlImportEnabled,
}: {
  locale: PlatformLocale;
  accountType: AccountType;
  module: PlatformModule;
  userName: string;
  workspaceId?: string;
  publicUrlImportEnabled: boolean;
}) {
  const ru = locale === "ru";
  if (accountType === "lawyer" && module === "dashboard")
    return <LawyerDashboardClient locale={locale} userName={userName} />;
  if (accountType === "lawyer" && module === "consultations")
    return <LawyerHubClient locale={locale} />;
  if (accountType === "lawyer" && module === "calendar")
    return <LawyerScheduleClient locale={locale} />;
  if (accountType === "lawyer" && module === "knowledge")
    return <LawyerKnowledgeClient locale={locale} />;
  if (module === "action-plan")
    return <ActionPlanClient locale={locale} accountType={accountType} />;
  if (module === "calendar") return <CalendarClient locale={locale} />;
  if (module === "consultations")
    return (
      <>
        <ConsultationsClient locale={locale} />
        <LawyerHandoffClient
          locale={locale}
          accountType={accountType}
          workspaceId={workspaceId}
        />
      </>
    );
  if (module === "dashboard")
    return (
      <DashboardClient
        locale={locale}
        accountType={accountType}
        userName={userName}
      />
    );
  if (module === "cases")
    return <CasesClient locale={locale} accountType={accountType} />;
  if (module === "team") return <TeamClient locale={locale} />;
  if (module === "ai-chat") return <AiLawyerClient locale={locale} />;
  if (module === "billing")
    return (
      <BillingClient
        locale={locale}
        accountType={accountType}
        workspaceId={workspaceId}
      />
    );
  if (module === "demo-payments")
    return (
      <DemoPaymentsClient
        locale={locale}
        accountType={accountType}
        workspaceId={workspaceId}
      />
    );
  if (module === "profile" || module === "settings" || module === "security")
    return (
      <ProfileSettingsClient
        locale={locale}
        accountType={accountType}
        view={module === "security" ? "security" : module}
      />
    );
  if (module === "document-review")
    return (
      <DocumentReviewClient
        locale={locale}
        accountType={accountType}
        publicUrlImportEnabled={publicUrlImportEnabled}
      />
    );
  if (module === "history") return <HistoryClient locale={locale} />;
  if (module === "archive")
    return <ArchiveClient locale={locale} accountType={accountType} />;
  if (module === "help")
    return <HelpClient locale={locale} accountType={accountType} />;
  if (module === "monitoring")
    return <MonitoringClient locale={locale} accountType={accountType} />;
  const descriptions: Record<PlatformModule, string> = {
    dashboard: "",
    "ai-chat": ru
      ? "Опишите ситуацию. AI-помощник отделит факты от предположений и предложит проверяемые следующие шаги."
      : "Vaziyatni yozing. AI-yordamchi faktlarni taxminlardan ajratib, tekshiriladigan keyingi qadamlarni taklif qiladi.",
    cases: ru
      ? "Дела объединяют документы, планы, сроки, доказательства и консультации."
      : "Ishlar hujjatlar, rejalar, muddatlar, dalillar va maslahatlarni birlashtiradi.",
    "document-review": ru
      ? "Загрузите документ для проверки структуры и возможных рисков."
      : "Tuzilma va ehtimoliy xavflarni tekshirish uchun hujjat yuklang.",
    monitoring: ru
      ? "Настройте темы и получайте только подтверждённые обновления из официальных источников."
      : "Mavzularni sozlang va faqat rasmiy manbalardan tasdiqlangan yangilanishlarni oling.",
    "action-plan": ru
      ? "Создавайте план из подтверждённых фактов и отслеживайте реальные выполненные шаги."
      : "Tasdiqlangan faktlardan reja yarating va haqiqiy bajarilgan qadamlarni kuzating.",
    calendar: ru
      ? "Следите за сроками из планов и задач текущего пространства."
      : "Joriy makondagi reja va vazifa muddatlarini kuzating.",
    consultations: ru
      ? "Передавайте специалисту только выбранный вами контекст."
      : "Mutaxassisga faqat siz tanlagan kontekstni topshiring.",
    knowledge: ru
      ? "Личная рабочая база знаний юриста."
      : "Yuristning shaxsiy ish bilimlar bazasi.",
    history: ru
      ? "История формируется из реальных действий в делах и документах."
      : "Tarix ishlar va hujjatlardagi haqiqiy harakatlardan tuziladi.",
    archive: ru
      ? "Архивные объекты скрыты из рабочих списков, но не удалены."
      : "Arxivdagi obyektlar ish ro‘yxatlaridan yashiriladi, ammo o‘chirilmaydi.",
    team: ru
      ? "Управляйте участниками пространства и их серверными правами."
      : "Makon ishtirokchilari va ularning server huquqlarini boshqaring.",
    billing: ru
      ? "Актуальные условия тарифа отображаются перед подтверждением оплаты."
      : "Amaldagi tarif shartlari to‘lovni tasdiqlashdan oldin ko‘rsatiladi.",
    "demo-payments": ru
      ? "Изолированные записи симуляции не меняют реальные платежи и тариф."
      : "Ajratilgan simulyatsiya yozuvlari haqiqiy to‘lov va tarifni o‘zgartirmaydi.",
    security: ru
      ? "Управляйте доступом, сессиями и передачей документов."
      : "Kirish, sessiyalar va hujjat uzatishni boshqaring.",
    help: ru
      ? "Инструкции по работе с инструментами JURO."
      : "JURO vositalari bilan ishlash bo‘yicha yo‘riqnomalar.",
    profile: ru
      ? "Профильные данные используются только в подтверждённых вами сценариях."
      : "Profil ma’lumotlari faqat siz tasdiqlagan ssenariylarda ishlatiladi.",
    settings: ru
      ? "Переключение языка сохраняет текущий модуль и тип пространства."
      : "Tilni almashtirish joriy modul va makon turini saqlaydi.",
  };
  const Icon = UserRound;
  return (
    <section className="platform-module">
      <header>
        <span>
          <Icon />
        </span>
        <div>
          <small>JURO</small>
          <h1>{titles[module][locale]}</h1>
          <p>{descriptions[module]}</p>
        </div>
      </header>
      <div className="platform-empty platform-module-empty">
        <Icon />
        <h2>
          {ru ? "Рабочих записей пока нет" : "Hozircha ish yozuvlari yo‘q"}
        </h2>
        <p>
          {ru
            ? "Раздел подключён к отдельному URL. Реальные записи появятся после создания соответствующего объекта."
            : "Bo‘lim alohida URLga ulangan. Tegishli obyekt yaratilgandan keyin haqiqiy yozuvlar paydo bo‘ladi."}
        </p>
      </div>
    </section>
  );
}
