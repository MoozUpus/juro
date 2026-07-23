import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import PizZip from "pizzip";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { createDefaultAnswers, EXAMPLE_RU, EXAMPLE_UZ } from "../lib/document-builder/defaults";
import { generateDocx } from "../lib/document-builder/generation/docx";
import { generatePdf } from "../lib/document-builder/generation/pdf";
import { generateZip } from "../lib/document-builder/generation/zip";
import { amountToWords, parseAmount } from "../lib/document-builder/money-to-words";
import { renderReceipt } from "../lib/document-builder/templates/receipt";
import { validateReceipt } from "../lib/document-builder/validation";
import type { ReceiptAnswers, TransferMethod } from "../lib/document-builder/types";

const root = new URL("../", import.meta.url);
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const configured = (language: "ru" | "uz-cyrl" = "ru"): ReceiptAnswers => {
  const value = structuredClone(language === "ru" ? EXAMPLE_RU : EXAMPLE_UZ);
  value.accuracyConfirmed = true;
  return value;
};

let ruDocx: Uint8Array;
let uzDocx: Uint8Array;
let ruPdf: Uint8Array;
let zipBytes: Uint8Array;

before(async () => {
  const [template, regular, bold, mark] = await Promise.all([
    readFile(new URL("public/document-templates/receipt-ru.docx", root)),
    readFile(new URL("public/document-templates/DejaVuSans-JURO.ttf", root)),
    readFile(new URL("public/document-templates/DejaVuSans-Bold-JURO.ttf", root)),
    readFile(new URL("public/document-templates/juro-mark-footer.png", root)),
  ]);
  const ru = renderReceipt(configured("ru"));
  const uz = renderReceipt(configured("uz-cyrl"));
  ruDocx = generateDocx(toArrayBuffer(template), ru.paragraphs);
  uzDocx = generateDocx(toArrayBuffer(template), uz.paragraphs);
  ruPdf = await generatePdf(ru.paragraphs, toArrayBuffer(regular), toArrayBuffer(bold), toArrayBuffer(mark));
  zipBytes = generateZip([{ name: "Расписка.docx", bytes: ruDocx }, { name: "Расписка.pdf", bytes: ruPdf }]);
});

test("русский документ сохраняет полную юридическую структуру", () => {
  const text = renderReceipt(configured()).plainText;
  assert.match(text, /1\. Получение денежных средств/);
  assert.match(text, /10\. Свидетели/);
  assert.match(text, /Каримов Азиз Акмалович/);
});

test("узбекский документ использует кириллицу и ту же нумерацию", () => {
  const text = renderReceipt(configured("uz-cyrl")).plainText;
  assert.match(text, /1\. Пул маблағларини олиш/);
  assert.match(text, /10\. Гувоҳлар/);
  assert.doesNotMatch(text, /QARZ|TILXAT|guvoh/i);
});

test("поддерживаются все три роли создателя", () => {
  for (const [participantMode, actingSide] of [["self", "lender"], ["for_other", "both"], ["organization", "organization"]] as const) {
    const answers = configured(); answers.participantMode = participantMode; answers.actingSide = actingSide;
    assert.ok(renderReceipt(answers).plainText.length > 1_000);
  }
});

test("сумма в сумах формируется прописью", () => assert.equal(amountToWords("21001", "ru", "UZS", false), "двадцать одна тысяча один сум"));
test("сумма в долларах учитывает валюту", () => assert.equal(amountToWords("125", "ru", "USD", false), "сто двадцать пять долларов США"));
test("доллары с центами сохраняют дробную часть", () => assert.match(amountToWords("125.42", "ru", "USD", true), /42 цента/));
test("узбекская сумма прописью формируется кириллицей", () => assert.equal(amountToWords("123", "uz-cyrl", "UZS", false), "бир юз йигирма уч сўм"));

test("каждый способ передачи формирует юридические детали", () => {
  for (const method of ["cash", "bank", "card", "other"] satisfies TransferMethod[]) {
    const answers = configured(); answers.transfer.method = method;
    const text = renderReceipt(answers).plainText;
    assert.ok(text.includes("передан") || text.includes("передач"));
    assert.doesNotMatch(text, /\{\{/);
  }
});

test("каждый способ возврата поддерживается для одного платежа", () => {
  for (const method of ["cash", "bank", "card", "other"] satisfies TransferMethod[]) {
    const answers = configured(); answers.repayment.planType = "single"; answers.repayment.method = method;
    assert.match(renderReceipt(answers).plainText, /Возврат|возврат/);
  }
});

test("один платеж содержит дату возврата", () => assert.match(renderReceipt(configured()).plainText, /30\.12\.2026|2026/));

test("график частичных платежей выводит все строки", () => {
  const answers = configured(); answers.repayment.planType = "schedule";
  answers.repayment.schedule = [{ id: "a", date: "2026-10-01", amount: "5000000", method: "bank", comment: "Первый" }, { id: "b", date: "2026-12-01", amount: "7500000", method: "card", comment: "Второй" }];
  const text = renderReceipt(answers).plainText;
  assert.match(text, /Первый/); assert.match(text, /Второй/);
});

test("несовпадение суммы графика является предупреждением", () => {
  const answers = configured(); answers.repayment.planType = "schedule";
  answers.repayment.schedule = [{ id: "a", date: "2026-10-01", amount: "1", method: "bank", comment: "" }];
  assert.ok(validateReceipt(answers).some((item) => item.id === "schedule-total-mismatch" && item.level === "recommended"));
});

test("беспроцентный заем сформулирован однозначно", () => assert.match(renderReceipt(configured()).plainText, /беспроцентным/));
test("процентный заем включает ставку и период", () => { const a = configured(); a.interest.mode = "interest"; a.interest.rate = "12"; a.interest.period = "year"; assert.match(renderReceipt(a).plainText, /12%.*год/); });
test("иной процентный режим выводит пользовательский текст", () => { const a = configured(); a.interest.mode = "other"; a.interest.otherTerms = "Особый порядок начисления"; assert.match(renderReceipt(a).plainText, /Особый порядок/); });

test("досрочный возврат поддерживает разрешение", () => { const a = configured(); a.earlyRepaymentMode = "allow"; assert.match(renderReceipt(a).plainText, /досрочн/i); });
test("досрочный возврат поддерживает запрет", () => { const a = configured(); a.earlyRepaymentMode = "deny"; assert.match(renderReceipt(a).plainText, /не допускается/i); });
test("условный досрочный возврат выводит свои условия", () => { const a = configured(); a.earlyRepaymentMode = "conditional"; a.earlyRepaymentCustom = "После уведомления за 5 дней"; assert.match(renderReceipt(a).plainText, /5 дней/); });

test("стандартная ответственность включается", () => assert.match(renderReceipt(configured()).plainText, /4\. Ответственность/));
test("ответственность может быть исключена", () => { const a = configured(); a.responsibilityMode = "exclude"; assert.doesNotMatch(renderReceipt(a).plainText, /ОТВЕТСТВЕННОСТЬ/); });
test("пользовательская ответственность заменяет стандартный блок", () => { const a = configured(); a.responsibilityMode = "custom"; a.responsibilityCustom = "Собственная ответственность"; assert.match(renderReceipt(a).plainText, /Собственная ответственность/); });

test("стандартные уведомления включают срок и контакты", () => assert.match(renderReceipt(configured()).plainText, /календарн/));
test("уведомления могут быть исключены", () => { const a = configured(); a.noticesMode = "exclude"; assert.doesNotMatch(renderReceipt(a).plainText, /6\. УВЕДОМЛЕНИЯ/); });
test("собственные условия уведомлений выводятся", () => { const a = configured(); a.noticesMode = "custom"; a.noticesCustom = "Только нарочно"; assert.match(renderReceipt(a).plainText, /Только нарочно/); });

test("несколько свидетелей получают строки подписей", () => { const a = configured(); a.hasWitnesses = true; a.witnesses.push({ ...a.witnesses[0], id: "w2", fullName: "Второй Свидетель" }); const t = renderReceipt(a).plainText; assert.match(t, /Второй Свидетель/); assert.match(t, /Подпись свидетеля/); });
test("live preview меняется при каждом изменении ответа", () => { const a = createDefaultAnswers("ru"); const beforeText = renderReceipt(a).plainText; a.documentPlace = "Самарканд"; assert.notEqual(renderReceipt(a).plainText, beforeText); assert.match(renderReceipt(a).plainText, /Самарканд/); });

test("детерминированная проверка отмечает неполные данные гостя", () => assert.ok(validateReceipt(createDefaultAnswers("ru")).length >= 5));
test("возврат после входа закреплен через безопасный return_to", async () => { const source = await readFile(new URL("app/document-builder-test/page.tsx", root), "utf8"); assert.match(source, /chatGPTSignInPath\("\/document-builder-test\?resume=1"\)/); });
test("автосохранение использует debounce и ревизию", async () => { const source = await readFile(new URL("app/document-builder-test/DocumentBuilderClient.tsx", root), "utf8"); assert.match(source, /useDebouncedEffect/); assert.match(source, /revisionRef/); });

test("DOCX является настоящим OOXML и содержит данные", () => { assert.equal(String.fromCharCode(...ruDocx.slice(0, 2)), "PK"); const zip = new PizZip(ruDocx); const xml = zip.file("word/document.xml")?.asText() ?? ""; assert.match(xml, /Каримов Азиз Акмалович/); assert.doesNotMatch(xml, /\{\{[^}]+\}\}/); });
test("DOCX использует корректные half-point размеры шрифта", () => { const xml = new PizZip(ruDocx).file("word/document.xml")?.asText() ?? ""; assert.match(xml, /<w:sz w:val="22"\/>/); assert.doesNotMatch(xml, /<w:sz w:val="(?:220|240|280)"\/>/); });
test("узбекский DOCX содержит кириллицу", () => { const xml = new PizZip(uzDocx).file("word/document.xml")?.asText() ?? ""; assert.match(xml, /Пул маблағларини олиш/); });
test("PDF имеет сигнатуру и хотя бы одну страницу", async () => { assert.equal(String.fromCharCode(...ruPdf.slice(0, 4)), "%PDF"); assert.ok((await PDFDocument.load(ruPdf)).getPageCount() > 0); });
test("ZIP содержит только DOCX и PDF", () => { const files = Object.keys(unzipSync(zipBytes)).sort(); assert.deepEqual(files, ["Расписка.docx", "Расписка.pdf"].sort()); });
test("DOCX footer содержит бренд JURO", () => { const zip = new PizZip(ruDocx); const footer = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/.test(name)).map((name) => zip.file(name)?.asText()).join("\n"); assert.match(footer, /Создано в JURO/); });
test("DOCX footer содержит поля PAGE и NUMPAGES", () => { const zip = new PizZip(ruDocx); const footer = Object.keys(zip.files).filter((name) => name.includes("footer") && name.endsWith(".xml")).map((name) => zip.file(name)?.asText()).join("\n"); assert.match(footer, /PAGE/); assert.match(footer, /NUMPAGES/); });

test("My Documents реализован как защищенный D1 route", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/route.ts", root), "utf8"); assert.match(source, /requireApiUser/); assert.match(source, /FROM documents/); });
test("duplicate создает новую независимую запись", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/route.ts", root), "utf8"); assert.match(source, /createStoredDocument/); assert.match(source, /— копия/); });
test("archive и restore следуют утвержденным статусам", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/[id]/route.ts", root), "utf8"); assert.match(source, /status = 'Архив'/); assert.match(source, /status = 'Готов'/); });
test("удаление требует решения только для подписанного PDF", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/[id]/route.ts", root), "utf8"); assert.match(source, /SIGNED_FILE_DECISION_REQUIRED/); });
test("подписанный файл ограничен PDF и 10 МБ", async () => { const source = await readFile(new URL("lib/document-builder/storage/files.ts", root), "utf8"); assert.match(source, /10 \* 1024 \* 1024/); assert.match(source, /signedPdfOnly/); });

test("collaboration проверяет owner и collaborator", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/[id]/collaboration/route.ts", root), "utf8"); assert.match(source, /access\.role !== "owner"/); assert.match(source, /access\.role === "collaborator"/); });
test("комментарии и двусторонние proposals сохраняются", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/[id]/collaboration/route.ts", root), "utf8"); assert.match(source, /INSERT INTO document_comments/); assert.match(source, /owner_accepted/); assert.match(source, /collaborator_accepted/); });
test("AI-рекомендация применима только после явного действия", () => { const a = configured(); a.loanAmountWords = "ошибка"; const issue = validateReceipt(a).find((item) => item.id === "amount-words-mismatch"); assert.equal(issue?.patch?.type, "set-answer"); assert.notEqual(a.loanAmountWords, issue?.patch?.value); });

test("основная публичная ссылка имеет срок 7 дней", async () => { const source = await readFile(new URL("app/api/document-builder-test/documents/[id]/share/route.ts", root), "utf8"); assert.match(source, /addDays\(now, 7\)/); assert.match(source, /token_hash/); });
test("самостоятельная PDF-ссылка имеет срок 24 часа", async () => { const source = await readFile(new URL("app/api/document-builder-test/standalone-files/[id]/share/route.ts", root), "utf8"); assert.match(source, /addHours\(now, 24\)/); });
test("код доступа состоит из четырех цифр и хранится как hash", async () => { const route = await readFile(new URL("app/api/document-builder-test/standalone-files/[id]/share/route.ts", root), "utf8"); const cryptoSource = await readFile(new URL("lib/document-builder/share-links/crypto.ts", root), "utf8"); assert.match(cryptoSource, /padStart\(4/); assert.match(route, /code_hash/); });
test("истекшая ссылка возвращает точное сообщение", async () => { const source = await readFile(new URL("app/document-builder-test/signed-share/[token]/page.tsx", root), "utf8"); assert.match(source, /Срок действия ссылки истёк/); });
test("новая активная ссылка деактивирует предыдущую", async () => { const source = await readFile(new URL("app/api/document-builder-test/standalone-files/[id]/share/route.ts", root), "utf8"); assert.match(source, /deactivated_at/); });
test("mobile preview имеет fullscreen режим без overflow", async () => { const css = await readFile(new URL("app/document-builder-test/document-builder.css", root), "utf8"); assert.match(css, /dbt-mobile-preview-button/); assert.match(css, /position:\s*fixed/); assert.match(css, /overflow-x:\s*hidden/); });
test("print mode скрывает форму и оставляет документ", async () => { const css = await readFile(new URL("app/document-builder-test/document-builder.css", root), "utf8"); assert.match(css, /@media print/); assert.match(css, /dbt-print-only/); assert.match(css, /visibility:\s*hidden/); });
test("парсер суммы принимает запятую и два знака", () => assert.equal(parseAmount("1 234,56"), 1234.56));
