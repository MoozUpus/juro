import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { SafeMarkdown } from "../app/_platform/SafeMarkdown";

test("safe Markdown renders GFM structure and only allowlisted legal-answer links", () => {
  const markdown = `## Основание

- Первый пункт
- Второй пункт

| Норма | Статус |
| --- | --- |
| Статья 1 | действует |

> Точная цитата

[Lex](https://lex.uz/ru/docs/1) [Other](https://example.org/page) [Bad](javascript:alert(1))

<script>window.evil = true</script>

![tracking](https://example.org/pixel.png)`;
  const html = renderToStaticMarkup(createElement(SafeMarkdown, {
    allowedLinks: ["https://lex.uz/ru/docs/1"],
  }, markdown));

  assert.match(html, /<h3>Основание<\/h3>/u);
  assert.match(html, /<ul>/u);
  assert.match(html, /role="region" aria-label="Scrollable table"/u);
  assert.match(html, /<blockquote>/u);
  assert.match(html, /href="https:\/\/lex\.uz\/ru\/docs\/1"/u);
  assert.doesNotMatch(html, /href="https:\/\/example\.org/u);
  assert.doesNotMatch(html, /javascript:|<script|<img/iu);
});
