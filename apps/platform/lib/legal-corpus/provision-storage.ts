/** Stored in `exact_quote_source` when the exact quote is the adjacent `text`
 * column. This preserves the value without storing the same legal text twice. */
export const EXACT_QUOTE_FROM_TEXT = "@text";

export function resolveExactQuoteSource(text: string, stored: string): string {
  return stored === EXACT_QUOTE_FROM_TEXT ? text : stored;
}
