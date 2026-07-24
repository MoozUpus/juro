import type { LocalizedText, QuestionnaireField } from "./types";

export const t = (ru: string, uz: string): LocalizedText => ({ ru, uz });

export const yesNoOptions = [
  { value: "yes", label: t("Да", "Ha") },
  { value: "no", label: t("Нет", "Yo‘q") },
];

export function courtBlock(prefix = "court"): QuestionnaireField[] {
  return [
    { id: `${prefix}.name`, type: "short-text", label: t("Наименование суда", "Sud nomi"), help: t("Укажите суд, в который будет подан документ.", "Hujjat topshiriladigan sudni ko‘rsating."), required: true },
    { id: `${prefix}.address`, type: "address", label: t("Адрес суда — если известен", "Sud manzili — ma’lum bo‘lsa"), required: false },
  ];
}

export function naturalPersonBlock(prefix: string, roleRu: string, roleUz: string): QuestionnaireField[] {
  return [
    { id: `${prefix}.fullName`, type: "full-name", label: t(`Ф.И.О. — ${roleRu}`, `${roleUz} F.I.Sh.`), required: true, reusableBlock: "party-natural-person" },
    { id: `${prefix}.birthDate`, type: "date", label: t("Дата рождения", "Tug‘ilgan sana"), reusableBlock: "party-natural-person" },
    { id: `${prefix}.pinfl`, type: "pinfl", label: t("ПИНФЛ", "JShShIR"), help: t("Введите вручную. JURO не сверяет ПИНФЛ с государственными базами.", "Qo‘lda kiriting. JURO JShShIRni davlat bazalari bilan solishtirmaydi."), reusableBlock: "pinfl" },
    { id: `${prefix}.passport`, type: "passport", label: t("Паспорт или ID-карта", "Pasport yoki ID-karta"), reusableBlock: "passport-details" },
    { id: `${prefix}.address`, type: "address", label: t("Адрес проживания или регистрации", "Yashash yoki ro‘yxatdan o‘tgan manzil"), required: true, reusableBlock: "party-natural-person" },
    { id: `${prefix}.phone`, type: "phone", label: t("Номер телефона", "Telefon raqami"), reusableBlock: "party-natural-person" },
    { id: `${prefix}.email`, type: "email", label: t("Электронная почта — необязательно", "Elektron pochta — ixtiyoriy"), reusableBlock: "party-natural-person" },
  ];
}

export function representativeBlock(prefix = "representative"): QuestionnaireField[] {
  return [
    { id: `${prefix}.enabled`, type: "radio", label: t("Документ подаёт представитель?", "Hujjat vakil tomonidan topshiriladimi?"), options: yesNoOptions, required: true, reusableBlock: "representative" },
    { id: `${prefix}.fullName`, type: "full-name", label: t("Ф.И.О. представителя", "Vakilning F.I.Sh."), condition: { field: `${prefix}.enabled`, operator: "equals", value: "yes" }, reusableBlock: "representative" },
    { id: `${prefix}.authority`, type: "long-text", label: t("Документ и объём полномочий представителя", "Vakilning hujjati va vakolatlari hajmi"), condition: { field: `${prefix}.enabled`, operator: "equals", value: "yes" }, help: t("Например: доверенность, дата и номер.", "Masalan: ishonchnoma, sana va raqam."), reusableBlock: "representative" },
  ];
}

export function confirmationField(): QuestionnaireField {
  return {
    id: "confirmation.accepted",
    type: "checkbox",
    label: t(
      "Подтверждаю достоверность введённых данных; понимаю, что JURO не является стороной документа и шаблон не заменяет индивидуальную консультацию юриста.",
      "Kiritilgan ma’lumotlarning to‘g‘riligini tasdiqlayman; JURO hujjat tomoni emasligini va shablon individual yuridik maslahat o‘rnini bosmasligini tushunaman.",
    ),
    required: true,
  };
}
