import assert from "node:assert/strict";
import test from "node:test";

import { safeDisplayName } from "../lib/platform/display-name";

test("display names accept human RU and UZ names", () => {
  assert.equal(safeDisplayName("  Азиза   Каримова "), "Азиза Каримова");
  assert.equal(safeDisplayName("O‘tkir Yoqubov"), "O‘tkir Yoqubov");
  assert.equal(safeDisplayName("Lynn Ng"), "Lynn Ng");
  assert.equal(safeDisplayName("Nguyễn Phúc"), "Nguyễn Phúc");
});

test("display names reject technical and misleading identifiers", () => {
  for (const value of [
    "test",
    "qwerty",
    "user@example.com",
    "https://example.com",
    "11111",
    "ААААА",
    "<script>",
    "Client QA JURO",
    "JURO Local Developer",
    "Demo Client",
    "Пользователь Тест",
    "gjvlg hbhjlbh",
    "Gvprts Brnch",
  ]) {
    assert.equal(safeDisplayName(value), "");
  }
});
