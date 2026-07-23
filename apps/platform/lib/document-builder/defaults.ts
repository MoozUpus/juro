import type {
  DocumentLanguage,
  PartyDetails,
  ReceiptAnswers,
  RepaymentScheduleItem,
  WitnessDetails,
} from "./types";
import { createRowId } from "./id";

export function todayIso(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function emptyParty(): PartyDetails {
  return {
    fullName: "",
    birthDate: "",
    idDocumentType: "",
    idDocumentNumber: "",
    idIssuedBy: "",
    idIssueDate: "",
    pinfl: "",
    registeredAddress: "",
    phone: "",
    email: "",
    noticeDetails: "",
  };
}

export function newScheduleItem(): RepaymentScheduleItem {
  return {
    id: createRowId(),
    date: "",
    amount: "",
    method: "cash",
    comment: "",
  };
}

export function newWitness(): WitnessDetails {
  return {
    id: createRowId(),
    fullName: "",
    birthDate: "",
    idDocumentType: "",
    idDocumentNumber: "",
    pinfl: "",
    registeredAddress: "",
    phone: "",
  };
}

export function createDefaultAnswers(language: DocumentLanguage = "ru"): ReceiptAnswers {
  const today = todayIso();
  return {
    language,
    participantMode: "self",
    actingSide: "lender",
    documentPlace: "",
    documentDate: today,
    lender: emptyParty(),
    borrower: emptyParty(),
    loanTransferDate: today,
    loanAmountNumeric: "",
    loanAmountWords: "",
    loanAmountWordsManuallyEdited: false,
    currency: "UZS",
    includeCents: false,
    loanRepaymentDate: "",
    interest: {
      mode: "interest_free",
      rate: "",
      period: "year",
      customPeriod: "",
      paymentOrder: "with_principal",
      customPaymentOrder: "",
      additionalTerms: "",
      otherTerms: "",
    },
    transfer: {
      method: "cash",
      date: today,
      place: "",
      witnessesPresent: false,
      bankName: "",
      accountNumber: "",
      paymentReference: "",
      senderCardLast4: "",
      recipientCardLast4: "",
      time: "",
      transferredAmount: "",
      transactionNumber: "",
      otherMethodName: "",
      channel: "",
      confirmationDetails: "",
      comment: "",
    },
    repayment: {
      planType: "single",
      date: "",
      method: "cash",
      place: "",
      bankName: "",
      accountNumber: "",
      paymentReference: "",
      senderCardLast4: "",
      recipientCardLast4: "",
      transactionNumber: "",
      otherDetails: "",
      comment: "",
      // Keep the first row deterministic so the public page can be rendered in
      // constrained Worker SSR runtimes. Rows added interactively still receive
      // cryptographically random client-side identifiers via newScheduleItem().
      schedule: [{
        id: "initial-payment",
        date: "",
        amount: "",
        method: "cash",
        comment: "",
      }],
    },
    earlyRepaymentMode: "allow",
    earlyRepaymentCustom: "",
    responsibilityMode: "standard",
    responsibilityCustom: "",
    noticesMode: "standard",
    noticesCustom: "",
    notificationPeriod: "3",
    hasWitnesses: false,
    witnesses: [{
      id: "initial-witness",
      fullName: "",
      birthDate: "",
      idDocumentType: "",
      idDocumentNumber: "",
      pinfl: "",
      registeredAddress: "",
      phone: "",
    }],
    additionalTerms: "",
    accuracyConfirmed: false,
  };
}

export const EXAMPLE_RU: ReceiptAnswers = {
  ...createDefaultAnswers("ru"),
  participantMode: "self",
  actingSide: "borrower",
  documentPlace: "г. Ташкент",
  documentDate: "2026-07-23",
  lender: {
    fullName: "Каримов Азиз Акмалович",
    birthDate: "1988-05-14",
    idDocumentType: "id_card",
    idDocumentNumber: "AA 0000000",
    idIssuedBy: "Мирзо-Улугбекским РОВД",
    idIssueDate: "2022-06-10",
    pinfl: "00000000000000",
    registeredAddress: "г. Ташкент, примерный адрес",
    phone: "+998 90 000 00 00",
    email: "aziz@example.uz",
    noticeDetails: "+998 90 000 00 00, aziz@example.uz",
  },
  borrower: {
    fullName: "Рахимов Бекзод Бахтиёрович",
    birthDate: "1991-11-02",
    idDocumentType: "passport",
    idDocumentNumber: "AB 0000000",
    idIssuedBy: "Юнусабадским РОВД",
    idIssueDate: "2021-03-18",
    pinfl: "11111111111111",
    registeredAddress: "г. Ташкент, примерный адрес",
    phone: "+998 91 000 00 00",
    email: "bekzod@example.uz",
    noticeDetails: "+998 91 000 00 00, bekzod@example.uz",
  },
  loanTransferDate: "2026-07-23",
  loanAmountNumeric: "25000000",
  loanAmountWords: "двадцать пять миллионов сумов",
  currency: "UZS",
  loanRepaymentDate: "2026-12-23",
  transfer: {
    ...createDefaultAnswers("ru").transfer,
    method: "bank",
    date: "2026-07-23",
    bankName: "Пример Банк",
    accountNumber: "счёт, оканчивающийся на 1234",
    paymentReference: "Заем по расписке",
    confirmationDetails: "электронная банковская квитанция",
  },
  repayment: {
    ...createDefaultAnswers("ru").repayment,
    date: "2026-12-23",
    method: "bank",
    bankName: "Пример Банк",
    accountNumber: "счёт, оканчивающийся на 1234",
    paymentReference: "Возврат займа",
  },
  earlyRepaymentMode: "allow",
  responsibilityMode: "standard",
  noticesMode: "standard",
  notificationPeriod: "3",
  hasWitnesses: true,
  witnesses: [{
    id: "example-witness",
    fullName: "Назаров Дилшод Рустамович",
    birthDate: "1985-08-09",
    idDocumentType: "id_card",
    idDocumentNumber: "AC 0000000",
    pinfl: "22222222222222",
    registeredAddress: "г. Ташкент, примерный адрес",
    phone: "+998 93 000 00 00",
  }],
};

export const EXAMPLE_UZ: ReceiptAnswers = {
  ...EXAMPLE_RU,
  language: "uz-cyrl",
  documentPlace: "Тошкент шаҳри",
  lender: {
    ...EXAMPLE_RU.lender,
    fullName: "Каримов Азиз Акмалович",
    idIssuedBy: "Мирзо Улуғбек тумани ИИБ",
    registeredAddress: "Тошкент шаҳри, намунавий манзил",
  },
  borrower: {
    ...EXAMPLE_RU.borrower,
    fullName: "Раҳимов Бекзод Бахтиёрович",
    idIssuedBy: "Юнусобод тумани ИИБ",
    registeredAddress: "Тошкент шаҳри, намунавий манзил",
  },
  loanAmountWords: "йигирма беш миллион сўм",
  transfer: {
    ...EXAMPLE_RU.transfer,
    bankName: "Намуна Банк",
    accountNumber: "1234 рақамлари билан тугайдиган ҳисобварақ",
    paymentReference: "Тилхат бўйича қарз",
    confirmationDetails: "электрон банк квитанцияси",
  },
  repayment: {
    ...EXAMPLE_RU.repayment,
    bankName: "Намуна Банк",
    accountNumber: "1234 рақамлари билан тугайдиган ҳисобварақ",
    paymentReference: "Қарзни қайтариш",
  },
  witnesses: [{
    ...EXAMPLE_RU.witnesses[0],
    fullName: "Назаров Дилшод Рустамович",
    registeredAddress: "Тошкент шаҳри, намунавий манзил",
  }],
};
