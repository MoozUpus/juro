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

test("parser extracts the current Lex div-based document structure without wrapper duplication", () => {
  const actText = "Норма определяет права, обязанности и проверяемый порядок действий. ".repeat(6);
  const snapshot = normalizeLegalSourceHtml({
    html: [
      "<html><body>",
      "<main><h1>Технический раздел</h1><table><tr><td>",
      "Меню ".repeat(40),
      "</td></tr></table></main>",
      '<main id="doc_main"><h1>Lex</h1><div class="container docBody-container">',
      '<div class="docBody__content"><div id="divBody">',
      '<div class="ACT_FORM lx_elem"><div class="lx_elem2"><div class="lx_elem3">Законодательная форма</div></div></div>',
      '<div class="ACT_TITLE lx_elem"><div class="lx_elem2"><div class="lx_elem3">Закон Республики Узбекистан</div></div></div>',
      '<div class="ACT_TEXT lx_elem"><div class="lx_elem2"><div class="lx_elem3">',
      actText,
      '</div></div><div aria-hidden="true">Скрытая служебная команда</div></div>',
      '<div class="ACT_TEXT lx_elem"><div class="lx_elem2"><div class="lx_elem3">',
      actText,
      "</div></div></div>",
      "</div></div></div></main>",
      "</body></html>",
    ].join(""),
    reference: {
      ...reference,
      canonicalId: "8282675",
      canonicalUrl: "https://lex.uz/ru/docs/8282675",
    },
    rawContentSha256,
  });

  assert.equal(snapshot.primarySelector, "main");
  assert.equal(snapshot.documentTitle, "Закон Республики Узбекистан");
  assert.deepEqual(
    snapshot.blocks.map((block) => block.kind),
    ["paragraph", "heading", "paragraph", "paragraph"],
  );
  assert.equal(
    snapshot.blocks.filter((block) => block.text.includes(actText.trim())).length,
    2,
  );
  assert.equal(snapshot.plainText.includes("Технический раздел"), false);
  assert.equal(snapshot.plainText.includes("Скрытая служебная команда"), false);
});

test("Advice parser extracts only the current document container", () => {
  const snapshot = normalizeLegalSourceHtml({
    html: `<html lang="uz"><head><title>Mehnat shartnomasini bekor qilish</title></head><body>
      <main>
        <aside><p>${"Yon menyu va boshqa tavsiyalar. ".repeat(30)}</p></aside>
        <div class="page-document-content extra-class">
          <p>${"Xodim va ish beruvchi qonunda belgilangan tartibga rioya qilishi kerak. ".repeat(4)}</p>
          <h2>Amaliy harakatlar</h2>
          <ol>
            <li>Hujjatlar va tegishli sanalarni tekshiring.</li>
            <li>Yozma xabarnoma va dalillarni saqlang.</li>
          </ol>
          <p>${"Har bir holatning faktlari alohida baholanadi va huquqiy asos tekshiriladi. ".repeat(4)}</p>
        </div>
      </main>
      <footer>Sayt bo‘limlari</footer>
    </body></html>`,
    reference: {
      sourceKind: "advice",
      locale: "uz",
      canonicalId: "624",
      canonicalUrl: "https://advice.uz/oz/documents/624",
    },
    rawContentSha256,
  });

  assert.equal(snapshot.primarySelector, "advice-document");
  assert.equal(snapshot.documentTitle, "Amaliy harakatlar");
  assert.equal(snapshot.plainText.includes("Yon menyu"), false);
  assert.equal(snapshot.plainText.includes("Sayt bo‘limlari"), false);
  assert.match(snapshot.plainText, /Yozma xabarnoma/);
  assert.deepEqual(normalizedLegalSourceSnapshotSchema.parse(snapshot), snapshot);

  assert.throws(
    () => normalizeLegalSourceHtml({
      html: `<html><body><main><p>${"Generic content. ".repeat(40)}</p></main></body></html>`,
      reference: { sourceKind: "advice", locale: "ru", canonicalId: "1", canonicalUrl: "https://advice.uz/ru/documents/1" },
      rawContentSha256,
    }),
    (error: unknown) => error instanceof LegalSourceParserError
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
