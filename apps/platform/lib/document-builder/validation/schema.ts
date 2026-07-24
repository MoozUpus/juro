import { z } from "zod";

const looseString = z.string().max(20_000);
const shortString = z.string().max(500);
const partySchema = z.object({
  fullName: shortString,
  birthDate: shortString,
  idDocumentType: z.enum(["passport", "id_card", ""]),
  idDocumentNumber: shortString,
  idIssuedBy: shortString,
  idIssueDate: shortString,
  pinfl: shortString,
  registeredAddress: looseString,
  phone: shortString,
  email: shortString,
  noticeDetails: looseString,
  contactId: z.string().max(100).optional(),
});

const witnessSchema = z.object({
  id: z.string().max(100),
  fullName: shortString,
  birthDate: shortString,
  idDocumentType: z.enum(["passport", "id_card", ""]),
  idDocumentNumber: shortString,
  pinfl: shortString,
  registeredAddress: looseString,
  phone: shortString,
});

export const receiptAnswersSchema = z.object({
  language: z.enum(["ru", "uz-cyrl"]),
  participantMode: z.enum(["self", "for_other", "organization"]),
  actingSide: z.enum(["lender", "borrower", "both", "organization"]),
  documentPlace: shortString,
  documentDate: shortString,
  lender: partySchema,
  borrower: partySchema,
  loanTransferDate: shortString,
  loanAmountNumeric: shortString,
  loanAmountWords: looseString,
  loanAmountWordsManuallyEdited: z.boolean(),
  currency: z.enum(["UZS", "USD"]),
  includeCents: z.boolean(),
  loanRepaymentDate: shortString,
  interest: z.object({
    mode: z.enum(["interest", "interest_free", "other"]),
    rate: shortString,
    period: z.enum(["month", "year", "other"]),
    customPeriod: looseString,
    paymentOrder: z.enum(["with_principal", "monthly", "other"]),
    customPaymentOrder: looseString,
    additionalTerms: looseString,
    otherTerms: looseString,
  }),
  transfer: z.object({
    method: z.enum(["cash", "bank", "card", "other"]),
    date: shortString,
    place: looseString,
    witnessesPresent: z.boolean(),
    bankName: shortString,
    accountNumber: shortString,
    paymentReference: looseString,
    senderCardLast4: shortString,
    recipientCardLast4: shortString,
    time: shortString,
    transferredAmount: shortString,
    transactionNumber: shortString,
    otherMethodName: shortString,
    channel: looseString,
    confirmationDetails: looseString,
    comment: looseString,
  }),
  repayment: z.object({
    planType: z.enum(["single", "schedule"]),
    date: shortString,
    method: z.enum(["cash", "bank", "card", "other"]),
    place: looseString,
    bankName: shortString,
    accountNumber: shortString,
    paymentReference: looseString,
    senderCardLast4: shortString,
    recipientCardLast4: shortString,
    transactionNumber: shortString,
    otherDetails: looseString,
    comment: looseString,
    schedule: z.array(z.object({
      id: z.string().max(100),
      date: shortString,
      amount: shortString,
      method: z.enum(["cash", "bank", "card", "other"]),
      comment: looseString,
    })).max(100),
  }),
  earlyRepaymentMode: z.enum(["allow", "deny", "conditional"]),
  earlyRepaymentCustom: looseString,
  responsibilityMode: z.enum(["standard", "exclude", "custom"]),
  responsibilityCustom: looseString,
  noticesMode: z.enum(["standard", "exclude", "custom"]),
  noticesCustom: looseString,
  notificationPeriod: shortString,
  hasWitnesses: z.boolean(),
  witnesses: z.array(witnessSchema).max(20),
  additionalTerms: looseString,
  accuracyConfirmed: z.boolean(),
});

export const saveDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  answers: receiptAnswersSchema,
  autoContent: z.string().max(500_000),
  finalContent: z.string().max(500_000),
  manuallyEdited: z.boolean(),
  revision: z.number().int().positive().optional(),
});

const configuredScalarSchema = z.union([z.string().max(50_000), z.number().finite(), z.boolean()]);
const configuredRowSchema = z.record(z.string().max(150), configuredScalarSchema);
export const configuredAnswersSchema = z.record(
  z.string().min(1).max(150),
  z.union([
    configuredScalarSchema,
    z.array(configuredScalarSchema).max(200),
    z.array(configuredRowSchema).max(100),
  ]),
).refine((value) => Object.keys(value).length <= 500, "Слишком много полей в документе.");

export const configuredDraftSchema = z.object({
  templateCode: z.string().regex(/^\d{7}$/),
  language: z.enum(["ru", "uz"]),
  title: z.string().trim().min(1).max(300).optional(),
  answers: configuredAnswersSchema,
  finalContent: z.string().max(500_000).optional(),
  manuallyEdited: z.boolean().optional(),
  caseId: z.string().uuid().optional(),
  planStepId: z.string().uuid().optional(),
}).refine((value) => !value.planStepId || Boolean(value.caseId), "Шаг должен быть связан с делом.");

export const saveConfiguredDocumentSchema = z.object({
  language: z.enum(["ru", "uz"]),
  title: z.string().trim().min(1).max(300),
  answers: configuredAnswersSchema,
  autoContent: z.string().max(500_000),
  finalContent: z.string().max(500_000),
  manuallyEdited: z.boolean(),
  revision: z.number().int().positive().optional(),
});

export const contactInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(300),
  birthDate: shortString,
  idDocumentType: z.enum(["passport", "id_card", ""]),
  idDocumentNumber: shortString,
  idIssuedBy: shortString,
  idIssueDate: shortString,
  pinfl: shortString,
  registeredAddress: looseString,
  phone: shortString,
});
