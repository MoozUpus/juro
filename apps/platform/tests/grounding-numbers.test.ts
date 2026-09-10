import assert from "node:assert/strict";
import test from "node:test";
import { groundingNumericTokens } from "../lib/legal/grounding-numbers";

test("written durations and digits have the same evidence identity", () => {
  assert.deepEqual(groundingNumericTokens("три месяца; один год; шестимесячный срок; трёхдневный срок"), ["3", "1", "6"]);
  assert.deepEqual(groundingNumericTokens("uch oy; bir yil; olti oy; ўн икки кун"), ["3", "1", "6", "12"]);
  assert.deepEqual(groundingNumericTokens("three months; one year; six months"), ["3", "1", "6"]);
});

test("composite numerals retain their magnitude and article numbers remain whole tokens", () => {
  assert.deepEqual(groundingNumericTokens("Статья 560. Двадцати пяти; one hundred and five; yigirma bir"), ["560", "25", "105", "21"]);
  assert.deepEqual(groundingNumericTokens("3 миллиона; два миллиона триста тысяч; 1 000; три, пять"), ["3000000", "2300000", "1000", "3", "5"]);
  assert.deepEqual(groundingNumericTokens("от 3 до 5; 3-5; 2,5 миллиона"), ["3", "5", "3-5", "2500000"]);
});
