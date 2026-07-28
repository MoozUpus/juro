import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { z } from "zod";
import type {
  LegalSourceKind,
  LegalSourceLocale,
  LegalSourceReference,
} from "./source-fetch";

export const LEGAL_SOURCE_PARSER_ERROR_CODES = [
  "LEGAL_SOURCE_PRIMARY_CONTENT_MISSING",
  "LEGAL_SOURCE_CONTENT_INSUFFICIENT",
  "LEGAL_SOURCE_PARSE_TOO_COMPLEX",
] as const;

export type LegalSourceParserErrorCode =
  (typeof LEGAL_SOURCE_PARSER_ERROR_CODES)[number];

export class LegalSourceParserError extends Error {
  constructor(readonly code: LegalSourceParserErrorCode) {
    super(code);
    this.name = "LegalSourceParserError";
  }
}

const normalizedBlockSchema = z.object({
  index: z.number().int().nonnegative(),
  kind: z.enum([
    "heading",
    "paragraph",
    "list_item",
    "quote",
    "definition",
    "table_cell",
    "preformatted",
  ]),
  headingLevel: z.number().int().min(1).max(6).optional(),
  text: z.string().min(1).max(100_000),
}).strict();

export const normalizedLegalSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  parser: z.object({
    name: z.literal("parse5"),
    version: z.literal("8.0.1"),
    profile: z.literal("juro-legal-blocks-v1"),
  }).strict(),
  source: z.object({
    sourceKind: z.enum(["lex", "advice"]),
    locale: z.enum(["ru", "uz"]),
    canonicalId: z.string().min(1),
    canonicalUrl: z.url(),
    rawContentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  primarySelector: z.enum(["main", "article", "role-main"]),
  documentTitle: z.string().min(1).max(2_000),
  blocks: z.array(normalizedBlockSchema).min(1).max(5_000),
  plainText: z.string().min(200).max(1_000_000),
}).strict();

export type NormalizedLegalSourceSnapshot = z.infer<
  typeof normalizedLegalSourceSnapshotSchema
>;

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

type MutableBlock = z.infer<typeof normalizedBlockSchema>;

const SKIPPED_TAGS = new Set([
  "aside",
  "button",
  "canvas",
  "dialog",
  "footer",
  "form",
  "header",
  "iframe",
  "nav",
  "noscript",
  "script",
  "style",
  "svg",
  "template",
]);
const NESTED_LIST_TAGS = new Set(["ol", "ul"]);
const MAX_NODES = 50_000;
const MAX_BLOCKS = 5_000;
const MAX_PLAIN_TEXT = 1_000_000;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function isTextNode(node: Node): node is DefaultTreeAdapterTypes.TextNode {
  return !isElement(node) && node.nodeName === "#text" && "value" in node;
}

function attribute(element: Element, name: string): string | null {
  return element.attrs.find((item) => item.name.toLowerCase() === name)
    ?.value ?? null;
}

function isHidden(element: Element): boolean {
  if (attribute(element, "hidden") !== null) return true;
  if (attribute(element, "aria-hidden")?.toLowerCase() === "true") return true;
  const style = attribute(element, "style")?.toLowerCase() ?? "";
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/
    .test(style);
}

function normalizeText(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectText(
  node: Node,
  options: { excludeNestedLists?: boolean } = {},
): string {
  if (isTextNode(node)) return node.value;
  if (!isElement(node) && !("childNodes" in node)) return "";
  if (isElement(node)) {
    if (SKIPPED_TAGS.has(node.tagName) || isHidden(node)) return "";
    if (options.excludeNestedLists && NESTED_LIST_TAGS.has(node.tagName)) {
      return "";
    }
    if (node.tagName === "br") return "\n";
  }
  return node.childNodes.map((child) => collectText(child, options)).join("");
}

function walkElements(
  root: ParentNode,
  visitor: (element: Element) => void,
  counter: { value: number },
): void {
  for (const child of root.childNodes) {
    counter.value += 1;
    if (counter.value > MAX_NODES) {
      throw new LegalSourceParserError("LEGAL_SOURCE_PARSE_TOO_COMPLEX");
    }
    if (!isElement(child)) continue;
    visitor(child);
    if (!SKIPPED_TAGS.has(child.tagName) && !isHidden(child)) {
      walkElements(child, visitor, counter);
    }
  }
}

function candidates(
  document: DefaultTreeAdapterTypes.Document,
): { selector: "main" | "article" | "role-main"; elements: Element[] } {
  const mains: Element[] = [];
  const articles: Element[] = [];
  const roleMains: Element[] = [];
  walkElements(document, (element) => {
    if (element.tagName === "main") mains.push(element);
    if (element.tagName === "article") articles.push(element);
    if (attribute(element, "role")?.toLowerCase() === "main") {
      roleMains.push(element);
    }
  }, { value: 0 });
  if (mains.length > 0) return { selector: "main", elements: mains };
  if (articles.length > 0) return { selector: "article", elements: articles };
  return { selector: "role-main", elements: roleMains };
}

function pickPrimary(elements: Element[]): Element | null {
  let selected: Element | null = null;
  let selectedLength = -1;
  for (const element of elements) {
    const length = normalizeText(collectText(element)).length;
    if (length > selectedLength) {
      selected = element;
      selectedLength = length;
    }
  }
  return selected;
}

function pushBlock(
  blocks: MutableBlock[],
  kind: MutableBlock["kind"],
  text: string,
  headingLevel?: number,
): void {
  const normalized = normalizeText(text);
  if (!normalized) return;
  if (normalized.length > 100_000 || blocks.length >= MAX_BLOCKS) {
    throw new LegalSourceParserError("LEGAL_SOURCE_PARSE_TOO_COMPLEX");
  }
  blocks.push({
    index: blocks.length,
    kind,
    ...(headingLevel ? { headingLevel } : {}),
    text: normalized,
  });
}

function collectBlocks(root: Element): MutableBlock[] {
  const blocks: MutableBlock[] = [];
  const visit = (element: Element): void => {
    if (SKIPPED_TAGS.has(element.tagName) || isHidden(element)) return;
    const heading = /^h([1-6])$/.exec(element.tagName);
    if (heading) {
      pushBlock(blocks, "heading", collectText(element), Number(heading[1]));
      return;
    }
    if (element.tagName === "p") {
      pushBlock(blocks, "paragraph", collectText(element));
      return;
    }
    if (element.tagName === "li") {
      pushBlock(
        blocks,
        "list_item",
        collectText(element, { excludeNestedLists: true }),
      );
      for (const child of element.childNodes) {
        if (isElement(child) && NESTED_LIST_TAGS.has(child.tagName)) {
          for (const nested of child.childNodes) {
            if (isElement(nested)) visit(nested);
          }
        }
      }
      return;
    }
    if (element.tagName === "blockquote") {
      pushBlock(blocks, "quote", collectText(element));
      return;
    }
    if (element.tagName === "dt" || element.tagName === "dd") {
      pushBlock(blocks, "definition", collectText(element));
      return;
    }
    if (element.tagName === "th" || element.tagName === "td") {
      pushBlock(blocks, "table_cell", collectText(element));
      return;
    }
    if (element.tagName === "pre") {
      pushBlock(blocks, "preformatted", collectText(element));
      return;
    }
    for (const child of element.childNodes) {
      if (isElement(child)) visit(child);
    }
  };
  visit(root);
  return blocks;
}

function documentTitle(
  document: DefaultTreeAdapterTypes.Document,
  blocks: MutableBlock[],
): string {
  const heading = blocks.find((block) => block.kind === "heading")?.text;
  if (heading) return heading.slice(0, 2_000);
  let title = "";
  walkElements(document, (element) => {
    if (!title && element.tagName === "title") {
      title = normalizeText(collectText(element));
    }
  }, { value: 0 });
  if (!title) {
    throw new LegalSourceParserError("LEGAL_SOURCE_CONTENT_INSUFFICIENT");
  }
  return title.slice(0, 2_000);
}

export function normalizeLegalSourceHtml(input: {
  html: string;
  reference: Pick<
    LegalSourceReference,
    "sourceKind" | "locale" | "canonicalId" | "canonicalUrl"
  >;
  rawContentSha256: string;
}): NormalizedLegalSourceSnapshot {
  const document = parse(input.html);
  const primaryCandidates = candidates(document);
  const primary = pickPrimary(primaryCandidates.elements);
  if (!primary) {
    throw new LegalSourceParserError(
      "LEGAL_SOURCE_PRIMARY_CONTENT_MISSING",
    );
  }
  const blocks = collectBlocks(primary);
  const plainText = blocks.map((block) => block.text).join("\n\n");
  if (blocks.length === 0 || plainText.length < 200) {
    throw new LegalSourceParserError("LEGAL_SOURCE_CONTENT_INSUFFICIENT");
  }
  if (plainText.length > MAX_PLAIN_TEXT) {
    throw new LegalSourceParserError("LEGAL_SOURCE_PARSE_TOO_COMPLEX");
  }
  return normalizedLegalSourceSnapshotSchema.parse({
    schemaVersion: 1,
    parser: {
      name: "parse5",
      version: "8.0.1",
      profile: "juro-legal-blocks-v1",
    },
    source: {
      sourceKind: input.reference.sourceKind as LegalSourceKind,
      locale: input.reference.locale as LegalSourceLocale,
      canonicalId: input.reference.canonicalId,
      canonicalUrl: input.reference.canonicalUrl,
      rawContentSha256: input.rawContentSha256,
    },
    primarySelector: primaryCandidates.selector,
    documentTitle: documentTitle(document, blocks),
    blocks,
    plainText,
  });
}
