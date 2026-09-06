import type { PlatformLocale } from "../platform/routing";

const billingErrors: Record<string, Record<PlatformLocale, string>> = {
  INVALID_INPUT: {
    ru: "Проверьте данные для оформления оплаты.",
    uz: "To‘lovni rasmiylashtirish ma’lumotlarini tekshiring.",
    en: "Check the checkout details and try again.",
  },
  WORKSPACE_UNAVAILABLE: {
    ru: "Рабочее пространство недоступно.",
    uz: "Ish maydoni mavjud emas.",
    en: "The workspace is unavailable.",
  },
  CHECKOUT_UNAVAILABLE: {
    ru: "Оформление оплаты временно недоступно.",
    uz: "To‘lovni rasmiylashtirish vaqtincha mavjud emas.",
    en: "Checkout is temporarily unavailable.",
  },
  CASE_UNAVAILABLE: {
    ru: "Дело не найдено или недоступно.",
    uz: "Ish topilmadi yoki undan foydalanib bo‘lmaydi.",
    en: "The matter was not found or is unavailable.",
  },
  RATE_LIMITED: {
    ru: "Слишком много попыток. Повторите действие позднее.",
    uz: "Urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring.",
    en: "Too many attempts. Please try again later.",
  },
  PLAN_UNAVAILABLE: {
    ru: "Выбранный тариф сейчас недоступен.",
    uz: "Tanlangan tarif hozir mavjud emas.",
    en: "The selected plan is currently unavailable.",
  },
  PRICING_POLICY_UNAVAILABLE: {
    ru: "Утверждённый расчёт оплаты временно недоступен.",
    uz: "Tasdiqlangan to‘lov hisobi vaqtincha mavjud emas.",
    en: "The approved price calculation is temporarily unavailable.",
  },
  TAX_POLICY_UNAVAILABLE: {
    ru: "Утверждённый налоговый расчёт временно недоступен.",
    uz: "Tasdiqlangan soliq hisobi vaqtincha mavjud emas.",
    en: "The approved tax calculation is temporarily unavailable.",
  },
  STANDARD_PAYMENT_POLICY_INVALID: {
    ru: "Безопасное оформление тарифа временно недоступно.",
    uz: "Tarifni xavfsiz rasmiylashtirish vaqtincha mavjud emas.",
    en: "Secure plan checkout is temporarily unavailable.",
  },
  ORDER_UNAVAILABLE: {
    ru: "Заказ недоступен.",
    uz: "Buyurtma mavjud emas.",
    en: "The order is unavailable.",
  },
  ORDER_NOT_CONFIRMABLE: {
    ru: "Заказ уже изменился. Обновите страницу и повторите действие.",
    uz: "Buyurtma holati o‘zgargan. Sahifani yangilang va qayta urinib ko‘ring.",
    en: "The order has changed. Refresh the page and try again.",
  },
  ORDER_EXPIRED: {
    ru: "Срок действия расчёта истёк. Создайте новый заказ.",
    uz: "Hisob muddati tugagan. Yangi buyurtma yarating.",
    en: "This price calculation has expired. Create a new order.",
  },
  ORDER_CONFIRMATION_CONFLICT: {
    ru: "Заказ уже обрабатывается. Подождите и обновите страницу.",
    uz: "Buyurtma qayta ishlanmoqda. Kuting va sahifani yangilang.",
    en: "The order is already being processed. Wait a moment and refresh the page.",
  },
  PROPOSAL_UNAVAILABLE: {
    ru: "Предложение юриста недоступно.",
    uz: "Yurist taklifi mavjud emas.",
    en: "The lawyer's proposal is unavailable.",
  },
  MARKETPLACE_PRICING_UNAVAILABLE: {
    ru: "Утверждённый расчёт услуги временно недоступен.",
    uz: "Tasdiqlangan xizmat hisobi vaqtincha mavjud emas.",
    en: "The approved service calculation is temporarily unavailable.",
  },
  MARKETPLACE_PROVIDER_FEE_UNSUPPORTED: {
    ru: "Безопасная оплата услуги временно недоступна.",
    uz: "Xizmat uchun xavfsiz to‘lov vaqtincha mavjud emas.",
    en: "Secure payment for this service is temporarily unavailable.",
  },
  PAYMENT_PROVIDER_UNAVAILABLE: {
    ru: "Оплата не выполнена: платёжный провайдер не подключён. JURO не показывает ложный результат платежа.",
    uz: "To‘lov bajarilmadi: to‘lov provayderi ulanmagan. JURO soxta muvaffaqiyatni ko‘rsatmaydi.",
    en: "Payment was not completed because the payment provider is not connected. JURO never shows a false payment result.",
  },
  PAYMENT_ADAPTER_REQUIRED: {
    ru: "Для выбранного провайдера ещё не настроено безопасное оформление.",
    uz: "Tanlangan provayder uchun xavfsiz rasmiylashtirish hali sozlanmagan.",
    en: "Secure checkout has not yet been configured for the selected provider.",
  },
};

export function billingErrorMessage(code: string, locale: PlatformLocale): string {
  return billingErrors[code]?.[locale] ?? {
    ru: "Не удалось выполнить платёжное действие. Повторите попытку.",
    uz: "To‘lov amalini bajarib bo‘lmadi. Qayta urinib ko‘ring.",
    en: "We could not complete the billing action. Please try again.",
  }[locale];
}
