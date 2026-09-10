/** Canonical quantities for evidence comparison; no legal outcomes or article
 * numbers belong here. Keep written numerals comparable with digit renderings. */
const numerals = new Map<string, number>();
const forms: Array<[number, string]> = [
  [0, "ноль нуль нуля zero nol нол"],
  [1, "один одна одно одного одной одному одним одну one bir бир"],
  [2, "два две двух двум двумя two ikki икки"],
  [3, "три трех трёх трем трём тремя three uch уч"],
  [4, "четыре четырех четырёх четырем четырём четырьмя four to'rt тўрт"],
  [5, "пять пяти пятью five besh беш"],
  [6, "шесть шести шестью six olti олти"],
  [7, "семь семи семью seven yetti етти"],
  [8, "восемь восьми восемью eight sakkiz саккиз"],
  [9, "девять девяти девятью nine to'qqiz тўққиз"],
  [10, "десять десяти десятью ten o'n ўн"],
  [11, "одиннадцать одиннадцати eleven"], [12, "двенадцать двенадцати twelve"],
  [13, "тринадцать тринадцати thirteen"], [14, "четырнадцать четырнадцати fourteen"],
  [15, "пятнадцать пятнадцати fifteen"], [16, "шестнадцать шестнадцати sixteen"],
  [17, "семнадцать семнадцати seventeen"], [18, "восемнадцать восемнадцати eighteen"],
  [19, "девятнадцать девятнадцати nineteen"],
  [20, "двадцать двадцати twenty yigirma йигирма"],
  [30, "тридцать тридцати thirty o'ttiz ўттиз"],
  [40, "сорок сорока forty qirq қирқ"],
  [50, "пятьдесят пятидесяти fifty ellik эллик"],
  [60, "шестьдесят шестидесяти sixty oltmish олтмиш"],
  [70, "семьдесят семидесяти seventy yetmish етмиш"],
  [80, "восемьдесят восьмидесяти eighty sakson саксон"],
  [90, "девяносто девяноста ninety to'qson тўқсон"],
  [100, "сто ста hundred yuz юз"], [200, "двести двухсот"],
  [300, "триста трехсот трёхсот"], [400, "четыреста четырехсот четырёхсот"],
  [500, "пятьсот пятисот"], [600, "шестьсот шестисот"],
  [700, "семьсот семисот"], [800, "восемьсот восьмисот"], [900, "девятьсот девятисот"],
  [1_000, "тысяча тысячи тысяч тысячу thousand ming минг"],
  [1_000_000, "миллион миллиона миллионов million миллион"],
];
for (const [number, words] of forms) for (const word of words.split(" ")) numerals.set(word, number);

export function groundingNumericTokens(value: string): string[] {
  const text = value.normalize("NFKC").toLocaleLowerCase("und").replace(/[‘’ʻʼ]/gu, "'")
    .replace(/\b\d{1,3}(?:[ \u00a0]\d{3})+\b/gu, (number) => number.replace(/\s/gu, ""));
  const values = new Set<string>();
  let group = 0, total = 0, lastValue: number | null = null, previousEnd = 0, lastScale = 0;
  const flush = () => {
    if (lastValue !== null) values.add(String(total + group));
    group = 0; total = 0; lastValue = null; lastScale = 0;
  };
  for (const token of text.matchAll(/\d+(?:[.,-]\d+)*|[\p{L}]+(?:'[\p{L}]+)*/gu)) {
    const word = token[0];
    if (!/^[\s-]*$/u.test(text.slice(previousEnd, token.index))) flush();
    if (word === "and" && (group >= 100 || total > 0)) {
      previousEnd = token.index + word.length; continue;
    }
    const digits = /^\d/u.test(word);
    let number = digits && /^\d+(?:[.,]\d+)?$/u.test(word)
      ? Number(word.replace(",", ".")) : numerals.get(word);
    if (digits && number === undefined) { flush(); values.add(word); previousEnd = token.index + word.length; continue; }
    if (number === undefined) {
      // Inflected compound duration adjectives: шестимесячный, трёхдневного.
      const compound = word.match(/^(.+?)(?:месяч|днев|недель|годич|летн|часов)/u);
      if (compound) number = numerals.get(compound[1]!);
    }
    if (number === undefined) { flush(); previousEnd = token.index + word.length; continue; }
    // Adjacent single digits are not an additive numeral phrase.
    if (lastValue !== null && lastValue < 10 && number < 10) flush();
    if (digits) { flush(); group = number; }
    else if (number >= 1_000) {
      if (group === 0 && total === 0 && /^(?:тысячи|тысяч|миллиона|миллионов)$/u.test(word)) {
        previousEnd = token.index + word.length; continue;
      }
      if (total > 0 && group === 0 && number > lastScale) total *= number;
      else total += (group || 1) * number;
      group = 0; lastScale = number;
    }
    else if (number === 100) group = (group || 1) * 100;
    else group += number;
    lastValue = number;
    previousEnd = token.index + word.length;
  }
  flush();
  return [...values];
}
