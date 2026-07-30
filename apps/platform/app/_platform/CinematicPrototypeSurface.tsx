import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarCheck2,
  FileCheck2,
  FilePenLine,
  MessageSquareText,
  MicOff,
  ShieldCheck,
} from "lucide-react";

import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { DashboardClient } from "./DashboardClient";

type Props = {
  accountType: AccountType;
  basePath: string;
  locale: PlatformLocale;
  userName: string;
};

const copy = {
  ru: {
    stage: "Защищённый staging-прототип · реальные данные пространства",
    companionTitle: "Журобек помогает начать, не отвлекая от работы",
    companionBody:
      "Сейчас используется официальный статичный образ. Голосовой режим с аватаром не включён: в репозитории нет утверждённого rigged 3D-ассета и проверенного STT/TTS-контура.",
    companionStatus: "Статичный fallback · без WebGL",
    companionAction: "Перейти в текстовый AI-чат",
    journeyTitle: "Один контекст — от вопроса до действия",
    journeyBody:
      "Каждый переход ведёт в уже защищённый рабочий маршрут. JURO не показывает фиктивный результат и не теряет выбранное пространство.",
    open: "Открыть",
    routes: [
      {
        title: "Понять ситуацию",
        description: "Задать вопрос AI-юристу и сохранить проверяемый контекст.",
        module: "ai-chat",
        icon: Bot,
      },
      {
        title: "Проверить материал",
        description: "Загрузить документ в реальный безопасный pipeline анализа.",
        module: "document-review",
        icon: FileCheck2,
      },
      {
        title: "Подготовить действие",
        description: "Создать документ или связать задачу с планом и сроком.",
        module: "document-builder",
        icon: FilePenLine,
      },
      {
        title: "Сохранить преемственность",
        description: "Продолжить в деле и передать только выбранный контекст специалисту.",
        module: "cases",
        icon: BriefcaseBusiness,
      },
    ],
    links: {
      plan: "План и сроки",
      specialist: "Передача специалисту",
    },
  },
  uz: {
    stage: "Himoyalangan staging-prototip · makonning haqiqiy ma’lumotlari",
    companionTitle: "Jurobek ishga xalaqit bermasdan boshlashga yordam beradi",
    companionBody:
      "Hozir rasmiy statik tasvir ishlatiladi. Avatarli ovoz rejimi yoqilmagan: repozitoriyda tasdiqlangan rigged 3D-asset va tekshirilgan STT/TTS konturi yo‘q.",
    companionStatus: "Statik fallback · WebGL siz",
    companionAction: "Matnli AI-chatga o‘tish",
    journeyTitle: "Bitta kontekst — savoldan harakatgacha",
    journeyBody:
      "Har bir o‘tish himoyalangan ish marshrutiga olib boradi. JURO soxta natija ko‘rsatmaydi va tanlangan makonni yo‘qotmaydi.",
    open: "Ochish",
    routes: [
      {
        title: "Vaziyatni tushunish",
        description: "AI-yuristga savol berish va tekshiriladigan kontekstni saqlash.",
        module: "ai-chat",
        icon: Bot,
      },
      {
        title: "Materialni tekshirish",
        description: "Hujjatni haqiqiy xavfsiz tahlil pipeline’iga yuklash.",
        module: "document-review",
        icon: FileCheck2,
      },
      {
        title: "Harakatni tayyorlash",
        description: "Hujjat yaratish yoki vazifani reja va muddatga bog‘lash.",
        module: "document-builder",
        icon: FilePenLine,
      },
      {
        title: "Izchillikni saqlash",
        description: "Ishda davom etish va mutaxassisga faqat tanlangan kontekstni berish.",
        module: "cases",
        icon: BriefcaseBusiness,
      },
    ],
    links: {
      plan: "Reja va muddatlar",
      specialist: "Mutaxassisga topshirish",
    },
  },
} as const;

export function CinematicPrototypeSurface({
  accountType,
  basePath,
  locale,
  userName,
}: Props) {
  const text = copy[locale];

  return (
    <div className="cinematic-prototype" data-prototype="cinematic-legal-intelligence">
      <div className="cinematic-prototype-status" role="status">
        <ShieldCheck aria-hidden="true" />
        <strong>{text.stage}</strong>
      </div>

      <aside className="cinematic-companion" aria-label={text.companionTitle}>
        <div className="cinematic-companion-portrait">
          <Image
            src="/jurobek-avatar.webp"
            alt={locale === "ru" ? "Журобек, цифровой помощник JURO" : "Jurobek, JURO raqamli yordamchisi"}
            width={1024}
            height={1792}
            sizes="(max-width: 560px) 84px, 104px"
          />
        </div>
        <div className="cinematic-companion-copy">
          <strong>{text.companionTitle}</strong>
          <p>{text.companionBody}</p>
          <span><MicOff aria-hidden="true" />{text.companionStatus}</span>
        </div>
        <Link href={`${basePath}/ai-chat`}>
          {text.companionAction}
          <ArrowRight aria-hidden="true" />
        </Link>
      </aside>

      <DashboardClient
        locale={locale}
        accountType={accountType}
        userName={userName}
      />

      <section className="cinematic-journey" aria-labelledby="cinematic-journey-title">
        <header>
          <div>
            <h2 id="cinematic-journey-title">{text.journeyTitle}</h2>
            <p>{text.journeyBody}</p>
          </div>
          <nav aria-label={locale === "ru" ? "Продолжение юридической задачи" : "Yuridik vazifani davom ettirish"}>
            <Link href={`${basePath}/action-plan`}><CalendarCheck2 aria-hidden="true" />{text.links.plan}</Link>
            <Link href={`${basePath}/consultations`}><MessageSquareText aria-hidden="true" />{text.links.specialist}</Link>
          </nav>
        </header>
        <ol>
          {text.routes.map(({ title, description, module, icon: Icon }) => (
            <li key={module}>
              <Icon aria-hidden="true" />
              <div><strong>{title}</strong><p>{description}</p></div>
              <Link href={`${basePath}/${module}`} aria-label={`${text.open}: ${title}`}>
                {text.open}<ArrowRight aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
