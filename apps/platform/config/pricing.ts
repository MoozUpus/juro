export const pricingConfig = {
  currency: "UZS",
  freeStart: {
    priceMinor: 0,
    label: { ru: "Старт — 0 сум", uz: "Boshlash — 0 so‘m" },
    details: {
      ru: "Первичный AI-разбор и первый документ доступны после подключения соответствующих серверных сервисов и в пределах лимитов плана.",
      uz: "Dastlabki AI-tahlil va birinchi hujjat tegishli server xizmatlari ulangandan keyin va reja limitlari doirasida mavjud.",
    },
  },
  plans: [
    {
      code: "individual",
      name: { ru: "Личное пространство", uz: "Shaxsiy makon" },
      priceLabel: "{PRICE_PERSONAL} сум/мес",
      features: {
        ru: ["Личные дела и документы", "Планы действий", "Приватное файловое пространство"],
        uz: ["Shaxsiy ishlar va hujjatlar", "Harakatlar rejalari", "Shaxsiy fayl makoni"],
      },
    },
    {
      code: "business",
      name: { ru: "Бизнес-пространство", uz: "Biznes makoni" },
      priceLabel: "от {PRICE_BUSINESS_FROM} сум/мес",
      features: {
        ru: ["Командные роли", "Совместная работа с документами", "История действий"],
        uz: ["Jamoa rollari", "Hujjatlar bilan hamkorlik", "Harakatlar tarixi"],
      },
    },
    {
      code: "legal_team",
      name: { ru: "Юридическая команда", uz: "Yuridik jamoa" },
      priceLabel: "от {PRICE_LEGAL_FROM} сум/мес",
      features: {
        ru: ["Юридические рабочие процессы", "Расширенные роли", "Очередь обращений и контроль"],
        uz: ["Yuridik ish jarayonlari", "Kengaytirilgan rollar", "Murojaatlar navbati va nazorat"],
      },
    },
  ],
} as const;

export type PricingPlanCode = typeof pricingConfig.plans[number]["code"];
