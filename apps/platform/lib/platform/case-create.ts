import { z } from "zod";

import type { AccountType, PlatformLocale } from "./routing";

export const CASE_SCENARIOS = {
  "unpaid-salary": {
    audience: "personal",
    label: { ru: "Невыплата заработной платы", uz: "Ish haqi to‘lanmasligi" },
    steps: {
      ru: ["Собрать трудовые документы и расчёты", "Подготовить письменное требование работодателю", "Зафиксировать вручение требования", "Проверить ответ и определить следующий способ защиты"],
      uz: ["Mehnat hujjatlari va hisob-kitoblarni yig‘ish", "Ish beruvchiga yozma talab tayyorlash", "Talab topshirilganini qayd etish", "Javobni tekshirib, keyingi himoya usulini belgilash"],
    },
  },
  debt: {
    audience: "personal",
    label: { ru: "Возврат долга", uz: "Qarzni qaytarish" },
    steps: {
      ru: ["Собрать подтверждения долга", "Проверить срок и условия возврата", "Подготовить требование о возврате", "Зафиксировать ответ или отсутствие ответа"],
      uz: ["Qarzni tasdiqlovchi dalillarni yig‘ish", "Qaytarish muddati va shartlarini tekshirish", "Qaytarish talabini tayyorlash", "Javobni yoki javob yo‘qligini qayd etish"],
    },
  },
  consumer: {
    audience: "personal",
    label: { ru: "Защита прав потребителя", uz: "Iste’molchi huquqlarini himoya qilish" },
    steps: {
      ru: ["Собрать чек, договор и переписку", "Сформулировать нарушение и требование", "Направить претензию", "Оценить ответ и дальнейшие действия"],
      uz: ["Chek, shartnoma va yozishmalarni yig‘ish", "Buzilish va talabni ifodalash", "Talabnoma yuborish", "Javob va keyingi harakatlarni baholash"],
    },
  },
  "debt-recovery": {
    audience: "business",
    label: { ru: "Взыскание задолженности", uz: "Qarzdorlikni undirish" },
    steps: {
      ru: ["Проверить договор и первичные документы", "Рассчитать подтверждённую задолженность", "Подготовить досудебную претензию", "Зафиксировать ответ и решение о следующем этапе"],
      uz: ["Shartnoma va birlamchi hujjatlarni tekshirish", "Tasdiqlangan qarzdorlikni hisoblash", "Sudgacha talabnoma tayyorlash", "Javob va keyingi bosqich qarorini qayd etish"],
    },
  },
  "contract-breach": {
    audience: "business",
    label: { ru: "Нарушение договора", uz: "Shartnoma buzilishi" },
    steps: {
      ru: ["Зафиксировать обязательство и нарушение", "Собрать доказательства исполнения своей стороны", "Подготовить уведомление или претензию", "Согласовать способ урегулирования"],
      uz: ["Majburiyat va buzilishni qayd etish", "O‘z tomonining ijrosini tasdiqlovchi dalillarni yig‘ish", "Bildirishnoma yoki talabnoma tayyorlash", "Hal etish usulini kelishish"],
    },
  },
} as const;

export type CaseScenarioId = keyof typeof CASE_SCENARIOS;

export const caseCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2_000).optional(),
  legalArea: z.enum(["unpaid-salary", "debt", "consumer", "debt-recovery", "contract-breach"]),
  locale: z.enum(["ru", "uz"]),
  accountType: z.enum(["individual", "entrepreneur", "lawyer", "business"]),
}).strict().refine(
  (input) => caseScenarioMatchesAccount(input.legalArea, input.accountType),
  { path: ["legalArea"], message: "Scenario is not available for this account type" },
);

export function caseScenarioMatchesAccount(id: CaseScenarioId, accountType: AccountType): boolean {
  return CASE_SCENARIOS[id].audience === (accountType === "business" ? "business" : "personal");
}

export function caseScenariosForAccount(accountType: AccountType) {
  const audience = accountType === "business" ? "business" : "personal";
  return (Object.entries(CASE_SCENARIOS) as Array<[CaseScenarioId, typeof CASE_SCENARIOS[CaseScenarioId]]>)
    .filter(([, scenario]) => scenario.audience === audience)
    .map(([id, scenario]) => ({ id, ...scenario.label }));
}

export function caseScenarioSteps(id: CaseScenarioId, locale: PlatformLocale): readonly string[] {
  return CASE_SCENARIOS[id].steps[locale];
}
