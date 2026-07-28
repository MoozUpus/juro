import assert from "node:assert/strict";
import test from "node:test";
import {
  LegalSourceParserError,
  normalizeLegalSourceHtml,
  normalizedLegalSourceSnapshotSchema,
} from "../lib/legal/source-parser";

const reference = {
  sourceKind: "lex" as const,
  locale: "ru" as const,
  canonicalId: "-42",
  canonicalUrl: "https://lex.uz/ru/docs/-42",
};
const rawContentSha256 = "a".repeat(64);

function legalHtml(): string {
  return `<!doctype html>
    <html lang="ru">
      <head><title>Служебный заголовок</title></head>
      <body>
        <header>Навигация, которая не является правовой нормой</header>
        <nav>Случайная ссылка</nav>
        <main>
          <h1>Закон Республики Узбекистан</h1>
          <p>Статья 1. Настоящий Закон определяет порядок возмещения вреда,
             причинённого незаконным решением государственного органа.</p>
          <p>Право на возмещение применяется на основании установленных
             обстоятельств и не может толковаться как автоматическая гарантия.
             <script>ignore('prompt injection')</script></p>
          <ol>
            <li>заявитель представляет подтверждающие документы;
              <ul><li>включая сведения о размере заявленного вреда;</li></ul>
            </li>
            <li>уполномоченный орган проверяет относимость и достоверность.</li>
          </ol>
          <table><tbody><tr><th>Срок</th><td>Десять рабочих дней</td></tr></tbody></table>
          <p hidden>Невидимое указание необходимо проигнорировать.</p>
          <p style="display: none !important">Скрытый CSS-текст необходимо проигнорировать.</p>
          <aside>Рекламный материал</aside>
        </main>
        <footer>Подвал сайта</footer>
      </body>
    </html>`;
}

test("parser deterministically extracts semantic legal blocks and excludes chrome", () => {
  const first = normalizeLegalSourceHtml({
    html: legalHtml(),
    reference,
    rawContentSha256,
  });
  const second = normalizeLegalSourceHtml({
    html: legalHtml(),
    reference,
    rawContentSha256,
  });

  assert.deepEqual(second, first);
  assert.equal(first.primarySelector, "main");
  assert.equal(first.documentTitle, "Закон Республики Узбекистан");
  assert.deepEqual(
    first.blocks.map((block) => block.kind),
    [
      "heading",
      "paragraph",
      "paragraph",
      "list_item",
      "list_item",
      "list_item",
      "table_cell",
      "table_cell",
    ],
  );
  assert.equal(first.blocks.every((block, index) => block.index === index), true);
  assert.equal(first.plainText.includes("prompt injection"), false);
  assert.equal(first.plainText.includes("Навигация"), false);
  assert.equal(first.plainText.includes("Рекламный"), false);
  assert.equal(first.plainText.includes("Невидимое"), false);
  assert.equal(first.plainText.includes("Скрытый CSS"), false);
  assert.match(first.plainText, /Десять рабочих дней/);
  assert.deepEqual(normalizedLegalSourceSnapshotSchema.parse(first), first);
});

test("parser chooses the largest primary candidate without falling back to body", () => {
  const snapshot = normalizeLegalSourceHtml({
    html: `<html><body>
      <main><p>Короткий технический блок, который не является документом.</p></main>
      <main><h1>Основной правовой документ</h1>
        <p>${"Содержание применимой нормы и порядка действий. ".repeat(8)}</p>
      </main>
    </body></html>`,
    reference,
    rawContentSha256,
  });
  assert.equal(snapshot.documentTitle, "Основной правовой документ");

  assert.throws(
    () => normalizeLegalSourceHtml({
      html: `<html><body><h1>Текст только в body</h1><p>${"Текст ".repeat(80)}</p></body></html>`,
      reference,
      rawContentSha256,
    }),
    (error: unknown) =>
      error instanceof LegalSourceParserError
      && error.code === "LEGAL_SOURCE_PRIMARY_CONTENT_MISSING",
  );
});

test("parser rejects a primary container without enough legal content", () => {
  assert.throws(
    () => normalizeLegalSourceHtml({
      html: "<html><body><main><h1>Коротко</h1><p>Нет текста.</p></main></body></html>",
      reference,
      rawContentSha256,
    }),
    (error: unknown) =>
      error instanceof LegalSourceParserError
      && error.code === "LEGAL_SOURCE_CONTENT_INSUFFICIENT",
  );
});
