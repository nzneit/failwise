// An item rendered as a Jira work item's summary and Atlassian Document Format description, and the
// marker read back from a description (§9). Pure data: no process, no network.

import { splitKey } from "./items.ts";
import { CLOSING_LINE } from "./provider.ts";
import { plain } from "./text.ts";
import type { Fact, ItemContent, Marker, TrackedItem } from "./provider.ts";

export interface AdfMark { type: string; attrs?: Record<string, unknown> }
export interface AdfNode { type: string; text?: string; marks?: AdfMark[]; content?: AdfNode[]; attrs?: Record<string, unknown> }
export interface AdfDoc { version: 1; type: "doc"; content: AdfNode[] }

const SUMMARY_LIMIT = 255;
const MARKER_TEXT = /^failwise:key=(\S+) text=([0-9a-f]{12})$/;

/** An object whose `type` is `"doc"` and whose `content` is an array. */
export function isAdfDocument(value: unknown): value is AdfDoc {
  if (typeof value !== "object" || value === null) return false;
  const { type, content } = value as { type?: unknown; content?: unknown };
  return type === "doc" && Array.isArray(content);
}

/** The title on one line: each control character a space (§9), whitespace runs collapsed, cut at 255 code points (UJ11). */
export function renderSummary(content: ItemContent): string {
  return Array.from(plain(content.title).replace(/\s+/g, " ")).slice(0, SUMMARY_LIMIT).join("");
}

function textNode(text: string, marks?: AdfMark[]): AdfNode {
  return marks === undefined ? { type: "text", text } : { type: "text", text, marks };
}

/** A paragraph of the given text nodes; an empty text gives an empty paragraph, since ADF admits no empty text node. */
function paragraph(...nodes: AdfNode[]): AdfNode {
  return { type: "paragraph", content: nodes.filter((node) => node.text !== "") };
}

function factItem(fact: Fact): AdfNode {
  return { type: "listItem", content: [paragraph(textNode(fact.label, [{ type: "strong" }]), textNode(`: ${plain(fact.value)}`))] };
}

function originParagraph(content: ItemContent): AdfNode {
  const { analysis, chain, action, url } = content.origin;
  const line = textNode(`From the FMEA "${plain(analysis)}", row ${plain(chain)}, action ${plain(action)}.`);
  if (url === undefined) return paragraph(line);
  return paragraph(line, textNode(" "), textNode("Open the row in the report", [{ type: "link", attrs: { href: url } }]));
}

/** The description: the action, the facts as a bullet list, the origin, the closing line and the marker. */
export function renderDescription(item: TrackedItem): AdfDoc {
  const { content } = item;
  return {
    version: 1,
    type: "doc",
    content: [
      paragraph(textNode(plain(content.action))),
      { type: "bulletList", content: content.facts.map(factItem) },
      originParagraph(content),
      paragraph(textNode(CLOSING_LINE)),
      paragraph(textNode(`failwise:key=${item.key} text=${item.text}`, [{ type: "code" }])),
    ],
  };
}

function isNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

function childrenOf(node: AdfNode): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

/** A hard break, or a text node of whitespace alone. */
function isBlankInline(value: unknown): boolean {
  if (!isNode(value)) return false;
  return value.type === "hardBreak" || (value.type === "text" && typeof value.text === "string" && value.text.trim() === "");
}

/** A paragraph that holds nothing but blank inline nodes. */
function isBlankParagraph(value: unknown): boolean {
  return isNode(value) && value.type === "paragraph" && childrenOf(value).every(isBlankInline);
}

function withoutTrailing(values: unknown[], blank: (value: unknown) => boolean): unknown[] {
  let end = values.length;
  while (end > 0 && blank(values[end - 1])) end -= 1;
  return values.slice(0, end);
}

/** The trimmed text of a paragraph that holds one text node and then only blank inline nodes, else null. */
function soleText(value: unknown): string | null {
  if (!isNode(value) || value.type !== "paragraph") return null;
  const inline = withoutTrailing(childrenOf(value), isBlankInline);
  if (inline.length !== 1) return null;
  const [node] = inline;
  return isNode(node) && node.type === "text" && typeof node.text === "string" ? node.text.trim() : null;
}

/** The marker in the last paragraph that is not blank, whatever attrs, code mark or trailing hard
 *  breaks an edit left on it, or null when there is none or another node follows it. */
export function readMarker(description: AdfDoc | null): Marker | null {
  if (description === null) return null;
  const last = withoutTrailing(description.content, isBlankParagraph).at(-1);
  const match = MARKER_TEXT.exec(soleText(last) ?? "");
  if (match === null || splitKey(match[1]) === null) return null;
  return { key: match[1], text: match[2] };
}
