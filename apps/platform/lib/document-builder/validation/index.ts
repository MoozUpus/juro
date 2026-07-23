import { amountToWords, parseAmount } from "../money-to-words";
import { earlyRepaymentText, interestTermsText, transferDetailsText } from "../templates/receipt";
import type { AiReviewResult, QualityScore, ReceiptAnswers, ValidationIssue } from "../types";

const blank = "________________";

const partyFields = [
  "fullName",
  "birthDate",
  "idDocumentType",
  "idDocumentNumber",
  "pinfl",
  "registeredAddress",
  "phone",
] as const;

function issue(
  id: string,
  level: ValidationIssue["level"],
  title: string,
  message: string,
  options: Partial<ValidationIssue> = {},
): ValidationIssue {
  return { id, level, title, message, source: "deterministic", ...options };
}

function filled(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function isAfter(left: string, right: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right)) return false;
  return left > right;
}

export function validateReceipt(answers: ReceiptAnswers): ValidationIssue[] {
  const ru = answers.language === "ru";
  const issues: ValidationIssue[] = [];
  const missingLender = partyFields.filter((field) => !filled(answers.lender[field]));
  const missingBorrower = partyFields.filter((field) => !filled(answers.borrower[field]));

  if (missingLender.length) {
    issues.push(issue("lender-incomplete", "recommended", ru ? "Неполные данные займодавца" : "Қарз берувчи маълумотлари тўлиқ эмас", ru ? `Не заполнено основных полей: ${missingLender.length}. Документ можно сформировать, но идентификация стороны будет слабее.` : `${missingLender.length} та асосий майдон тўлдирилмаган. Ҳужжатни яратиш мумкин, бироқ тарафни аниқлаш қийинлашади.`, { field: "lender.fullName", anchor: "section-1" }));
  }
  if (missingBorrower.length) {
    issues.push(issue("borrower-incomplete", "critical", ru ? "Неполные данные заемщика" : "Қарз олувчи маълумотлари тўлиқ эмас", ru ? `Не заполнено основных полей: ${missingBorrower.length}. Для взыскания долга важно точно идентифицировать заемщика.` : `${missingBorrower.length} та асосий майдон тўлдирилмаган. Қарзни ундириш учун қарз олувчини аниқ белгилаш муҳим.`, { field: "borrower.fullName", anchor: "section-1" }));
  }
  if (!filled(answers.documentPlace)) issues.push(issue("place-missing", "recommended", ru ? "Не указано место составления" : "Тузилган жой кўрсатилмаган", ru ? "Укажите населённый пункт, где подписывается расписка." : "Тилхат имзоланадиган аҳоли пунктини кўрсатинг.", { field: "documentPlace" }));
  if (!filled(answers.documentDate)) issues.push(issue("document-date-missing", "critical", ru ? "Не указана дата документа" : "Ҳужжат санаси кўрсатилмаган", ru ? "Дата нужна для определения момента оформления расписки." : "Сана тилхат расмийлаштирилган пайтни аниқлаш учун керак.", { field: "documentDate" }));
  if (!filled(answers.loanTransferDate)) issues.push(issue("transfer-date-missing", "critical", ru ? "Не указана дата передачи денег" : "Пул топширилган сана кўрсатилмаган", ru ? "Расписка должна подтверждать, когда деньги были фактически переданы." : "Тилхат пул амалда қачон топширилганлигини тасдиқлаши керак.", { field: "loanTransferDate", anchor: "section-1" }));
  if (!filled(answers.loanRepaymentDate)) issues.push(issue("repayment-date-missing", "critical", ru ? "Не указан срок возврата" : "Қайтариш муддати кўрсатилмаган", ru ? "Без даты возврата сложнее определить просрочку." : "Қайтариш санасисиз кечиктиришни аниқлаш қийин.", { field: "loanRepaymentDate", anchor: "section-2" }));

  const amount = parseAmount(answers.loanAmountNumeric);
  if (amount === null || amount <= 0) {
    issues.push(issue("amount-invalid", "critical", ru ? "Сумма займа не указана" : "Қарз суммаси кўрсатилмаган", ru ? "Введите положительную сумму цифрами." : "Мусбат суммани рақамларда киритинг.", { field: "loanAmountNumeric", anchor: "section-1" }));
  }
  const expectedWords = amountToWords(answers.loanAmountNumeric, answers.language, answers.currency, answers.includeCents);
  if (expectedWords && answers.loanAmountWords.trim().toLocaleLowerCase() !== expectedWords.toLocaleLowerCase()) {
    issues.push(issue("amount-words-mismatch", "recommended", ru ? "Сумма цифрами и прописью различается" : "Рақам ва сўз билан ёзилган сумма фарқ қилади", ru ? `Расчётное значение: «${expectedWords}». Проверьте ручное исправление.` : `Ҳисобланган қиймат: «${expectedWords}». Қўлда киритилган ўзгаришни текширинг.`, {
      field: "loanAmountWords",
      anchor: "section-1",
      originalText: answers.loanAmountWords,
      proposedText: expectedWords,
      patch: { type: "set-answer", path: "loanAmountWords", value: expectedWords },
    }));
  }
  if (answers.documentDate && answers.loanTransferDate && isAfter(answers.documentDate, answers.loanTransferDate)) {
    issues.push(issue("document-after-transfer", "optional", ru ? "Документ составлен после передачи" : "Ҳужжат пул топширилгандан кейин тузилган", ru ? "Это допустимо, но убедитесь, что обе даты указаны верно." : "Бу мумкин, аммо ҳар икки сана тўғрилигини текширинг.", { field: "documentDate", anchor: "section-1" }));
  }
  if (answers.loanTransferDate && answers.loanRepaymentDate && isAfter(answers.loanTransferDate, answers.loanRepaymentDate)) {
    issues.push(issue("repayment-before-transfer", "critical", ru ? "Срок возврата раньше передачи денег" : "Қайтариш муддати пул топширилишидан олдин", ru ? "Исправьте даты передачи или возврата." : "Пул топшириш ёки қайтариш санасини тўғриланг.", { field: "loanRepaymentDate", anchor: "section-2" }));
  }
  if (answers.repayment.planType === "schedule") {
    const scheduleTotal = answers.repayment.schedule.reduce((total, row) => total + (parseAmount(row.amount) ?? 0), 0);
    if (!answers.repayment.schedule.length || answers.repayment.schedule.every((row) => !row.date && !row.amount)) {
      issues.push(issue("schedule-empty", "critical", ru ? "График платежей пуст" : "Тўловлар жадвали бўш", ru ? "Добавьте хотя бы один платёж." : "Камида битта тўлов қўшинг.", { field: "repayment.schedule", anchor: "section-2" }));
    }
    if (amount !== null && Math.abs(scheduleTotal - amount) > 0.009) {
      issues.push(issue("schedule-total-mismatch", "recommended", ru ? "Сумма графика не равна сумме займа" : "Жадвал суммаси қарз суммасига тенг эмас", ru ? `Итого по графику: ${scheduleTotal}. Сумма займа: ${amount}. Это предупреждение не блокирует создание.` : `Жадвал бўйича жами: ${scheduleTotal}. Қарз суммаси: ${amount}. Бу огоҳлантириш ҳужжат яратилишини тўхтатмайди.`, { field: "repayment.schedule", anchor: "section-2" }));
    }
  }
  if (answers.interest.mode === "interest" && (!filled(answers.interest.rate) || Number(answers.interest.rate.replace(",", ".")) <= 0)) {
    issues.push(issue("interest-rate-missing", "critical", ru ? "Не указана процентная ставка" : "Фоиз ставкаси кўрсатилмаган", ru ? "Для процентного займа укажите размер ставки." : "Фоизли қарз учун ставка миқдорини кўрсатинг.", { field: "interest.rate", anchor: "section-3" }));
  }
  if (answers.interest.mode === "other" && !filled(answers.interest.otherTerms)) {
    issues.push(issue("interest-other-empty", "critical", ru ? "Не описан иной порядок" : "Бошқа тартиб баён этилмаган", ru ? "Опишите порядок начисления или отсутствие процентов." : "Фоиз ҳисоблаш ёки фоизсизлик тартибини баён этинг.", { field: "interest.otherTerms", anchor: "section-3" }));
  }
  if (answers.earlyRepaymentMode === "conditional" && !filled(answers.earlyRepaymentCustom)) {
    issues.push(issue("early-terms-empty", "recommended", ru ? "Не указаны условия досрочного возврата" : "Муддатидан олдин қайтариш шартлари кўрсатилмаган", ru ? "Опишите условия, при которых досрочный возврат разрешён." : "Муддатидан олдин қайтаришга рухсат бериладиган шартларни баён этинг.", { field: "earlyRepaymentCustom", anchor: "section-3" }));
  }
  if (answers.responsibilityMode === "exclude") {
    issues.push(issue("responsibility-excluded", "recommended", ru ? "Раздел ответственности исключён" : "Жавобгарлик бўлими чиқариб ташланган", ru ? "Документ не содержит стандартного описания последствий просрочки." : "Ҳужжатда кечиктириш оқибатларининг стандарт тавсифи мавжуд эмас.", { field: "responsibilityMode", anchor: "section-4" }));
  }
  if (answers.noticesMode === "exclude") {
    issues.push(issue("notices-excluded", "optional", ru ? "Раздел уведомлений исключён" : "Хабарлар бўлими чиқариб ташланган", ru ? "Сторонам будет сложнее доказать направление юридически значимых сообщений." : "Тарафларга юридик аҳамиятга эга хабарларни юборганликни исботлаш қийинроқ бўлади.", { field: "noticesMode", anchor: "section-6" }));
  }
  if (transferDetailsText(answers) === "________________") {
    issues.push(issue("transfer-proof-missing", "critical", ru ? "Нет подтверждающих сведений о передаче" : "Пул топширилганлигини тасдиқловчи маълумотлар йўқ", ru ? "Добавьте реквизиты квитанции, перевода, место наличной передачи или иной способ подтверждения." : "Квитанция, ўтказма реквизитлари, нақд топшириш жойи ёки бошқа тасдиқ маълумотларини қўшинг.", { field: "transfer", anchor: "section-1" }));
  }
  if (answers.hasWitnesses) {
    answers.witnesses.forEach((witness, index) => {
      if (!filled(witness.fullName) || !filled(witness.idDocumentNumber)) {
        issues.push(issue(`witness-${index}-incomplete`, "recommended", ru ? `Неполные данные свидетеля ${index + 1}` : `${index + 1}-гувоҳ маълумотлари тўлиқ эмас`, ru ? "Укажите как минимум Ф.И.О. и документ свидетеля." : "Камида гувоҳнинг Ф.И.О. ва ҳужжатини кўрсатинг.", { field: `witnesses.${index}`, anchor: "section-10" }));
      }
    });
  }

  const interestText = interestTermsText(answers);
  const earlyText = earlyRepaymentText(answers);
  if (interestText.includes(blank) || earlyText.includes(blank)) {
    issues.push(issue("terms-placeholder", "critical", ru ? "В условиях остались незаполненные сведения" : "Шартларда тўлдирилмаган маълумотлар қолган", ru ? "Проверьте процентные условия и досрочный возврат." : "Фоиз шартлари ва муддатидан олдин қайтаришни текширинг.", { anchor: "section-3" }));
  }
  return issues;
}

export function calculateQuality(answers: ReceiptAnswers, issues = validateReceipt(answers)): QualityScore {
  const allFields = [
    answers.documentPlace,
    answers.documentDate,
    answers.loanTransferDate,
    answers.loanAmountNumeric,
    answers.loanAmountWords,
    answers.loanRepaymentDate,
    ...partyFields.map((field) => answers.lender[field]),
    ...partyFields.map((field) => answers.borrower[field]),
  ];
  const dataCompleteness = Math.round((allFields.filter(filled).length / allFields.length) * 100);
  const critical = issues.filter((item) => item.level === "critical").length;
  const recommended = issues.filter((item) => item.level === "recommended").length;
  const legalCompleteness = Math.max(0, Math.min(100, 100 - critical * 13 - recommended * 5));
  const riskLevel = critical > 1 ? "Высокий" : critical || recommended > 3 ? "Средний" : "Низкий";
  const partyProtection = answers.responsibilityMode === "standard" && answers.noticesMode === "standard" && critical === 0 ? "Высокая" : critical > 1 ? "Низкая" : "Средняя";
  return {
    legalCompleteness,
    dataCompleteness,
    riskLevel,
    partyProtection,
    explanation: [
      `Заполнено ${dataCompleteness}% ключевых полей сторон и займа.`,
      `Найдено критических замечаний: ${critical}; рекомендаций: ${recommended}.`,
      "Показатели являются технической оценкой JURO и не являются официальным юридическим заключением.",
    ],
  };
}

export function deterministicReview(answers: ReceiptAnswers): AiReviewResult {
  const issues = validateReceipt(answers);
  return {
    status: "unavailable",
    message: "AI-модель сейчас не подключена: отсутствует серверный OPENAI_API_KEY. Выполнена полная детерминированная проверка полей, дат, сумм, графика и логических противоречий.",
    issues,
    quality: calculateQuality(answers, issues),
    reviewedAt: new Date().toISOString(),
  };
}
