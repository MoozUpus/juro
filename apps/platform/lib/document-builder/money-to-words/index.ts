import type { Currency, DocumentLanguage } from "../types";

const RU_ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const RU_ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const RU_TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const RU_TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const RU_HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

const UZ_ONES = ["", "бир", "икки", "уч", "тўрт", "беш", "олти", "етти", "саккиз", "тўққиз"];
const UZ_TENS = ["", "ўн", "йигирма", "ўттиз", "қирқ", "эллик", "олтмиш", "етмиш", "саксон", "тўқсон"];

function normalizeAmount(value: string): { whole: bigint; fraction: number } | null {
  const cleaned = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(cleaned)) return null;
  const [wholeRaw, fractionRaw = ""] = cleaned.split(".");
  try {
    return {
      whole: BigInt(wholeRaw || "0"),
      fraction: Number((fractionRaw + "00").slice(0, 2)),
    };
  } catch {
    return null;
  }
}

function ruPlural(value: number | bigint, forms: [string, string, string]): string {
  const n = Number(BigInt(value) % 100n);
  if (n >= 11 && n <= 19) return forms[2];
  const last = n % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function ruTriplet(value: number, feminine = false): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const tensAndOnes = value % 100;
  if (hundreds) words.push(RU_HUNDREDS[hundreds]);
  if (tensAndOnes >= 10 && tensAndOnes <= 19) {
    words.push(RU_TEENS[tensAndOnes - 10]);
  } else {
    const tens = Math.floor(tensAndOnes / 10);
    const ones = tensAndOnes % 10;
    if (tens) words.push(RU_TENS[tens]);
    if (ones) words.push((feminine ? RU_ONES_F : RU_ONES)[ones]);
  }
  return words;
}

function integerToRu(value: bigint): string {
  if (value === 0n) return "ноль";
  const groups: Array<{ divisor: bigint; forms: [string, string, string]; feminine?: boolean }> = [
    { divisor: 1_000_000_000_000n, forms: ["триллион", "триллиона", "триллионов"] },
    { divisor: 1_000_000_000n, forms: ["миллиард", "миллиарда", "миллиардов"] },
    { divisor: 1_000_000n, forms: ["миллион", "миллиона", "миллионов"] },
    { divisor: 1_000n, forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
  ];
  let remainder = value;
  const words: string[] = [];
  for (const group of groups) {
    const groupValue = Number(remainder / group.divisor);
    if (groupValue > 0) {
      words.push(...ruTriplet(groupValue, group.feminine), ruPlural(groupValue, group.forms));
      remainder %= group.divisor;
    }
  }
  if (remainder > 0n) words.push(...ruTriplet(Number(remainder)));
  return words.join(" ");
}

function uzTriplet(value: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) words.push(UZ_ONES[hundreds], "юз");
  const tens = Math.floor(rest / 10);
  const ones = rest % 10;
  if (tens) words.push(UZ_TENS[tens]);
  if (ones) words.push(UZ_ONES[ones]);
  return words;
}

function integerToUz(value: bigint): string {
  if (value === 0n) return "ноль";
  const groups: Array<[bigint, string]> = [
    [1_000_000_000_000n, "триллион"],
    [1_000_000_000n, "миллиард"],
    [1_000_000n, "миллион"],
    [1_000n, "минг"],
  ];
  let remainder = value;
  const words: string[] = [];
  for (const [divisor, name] of groups) {
    const groupValue = Number(remainder / divisor);
    if (groupValue > 0) {
      words.push(...uzTriplet(groupValue), name);
      remainder %= divisor;
    }
  }
  if (remainder > 0n) words.push(...uzTriplet(Number(remainder)));
  return words.join(" ");
}

export function amountToWords(
  value: string,
  language: DocumentLanguage,
  currency: Currency,
  includeCents: boolean,
): string {
  const parsed = normalizeAmount(value);
  if (!parsed) return "";

  if (language === "uz-cyrl") {
    const base = integerToUz(parsed.whole);
    if (currency === "UZS") return `${base} сўм`;
    const dollars = `${base} АҚШ доллари`;
    return includeCents ? `${dollars} ${String(parsed.fraction).padStart(2, "0")} цент` : dollars;
  }

  const base = integerToRu(parsed.whole);
  if (currency === "UZS") {
    return `${base} ${ruPlural(parsed.whole, ["сум", "сума", "сумов"])}`;
  }
  const dollars = `${base} ${ruPlural(parsed.whole, ["доллар США", "доллара США", "долларов США"])}`;
  return includeCents
    ? `${dollars} ${String(parsed.fraction).padStart(2, "0")} ${ruPlural(parsed.fraction, ["цент", "цента", "центов"])}`
    : dollars;
}

export function parseAmount(value: string): number | null {
  const parsed = normalizeAmount(value);
  if (!parsed) return null;
  const number = Number(parsed.whole) + parsed.fraction / 100;
  return Number.isFinite(number) ? number : null;
}

export function formatNumericAmount(value: string, includeCents: boolean): string {
  const parsed = normalizeAmount(value);
  if (!parsed) return value || "________________";
  const grouped = parsed.whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return includeCents ? `${grouped},${String(parsed.fraction).padStart(2, "0")}` : grouped;
}
