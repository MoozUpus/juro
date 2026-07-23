import type { RenderedParagraph } from "../types";

export function paragraphsFromFinalText(text: string): RenderedParagraph[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .map((line, index): RenderedParagraph => {
      const kind: RenderedParagraph["kind"] = !line
        ? "spacer"
        : index === 0 || line === "РАСПИСКА" || line === "ТИЛХАТ"
          ? "title"
          : /^(?:\d+\.\s|ЗАЕМЩИК$|ЗАЙМОДАВЕЦ$|ҚАРЗ ОЛУВЧИ$|ҚАРЗ БЕРУВЧИ$)/.test(line) && !/^\d+\.\d+\./.test(line)
            ? "heading"
            : /^(?:Подпись|Дата подписания|Имзо|Имзоланган сана)/.test(line)
              ? "signature"
              : /[;.]$/.test(line) && !/^\d+\./.test(line) && line.length < 180
                ? "list"
                : "body";
      return { id: `manual-${index + 1}`, text: line, kind, keepWithNext: kind === "heading" };
    });
}
