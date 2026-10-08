// An item rendered as a Jira work item's summary and Atlassian Document Format description, and the
// marker read back from a description (§9). Pure data: no process, no network.

import { splitKey } from "./items.ts";
import { plain } from "./text.ts";
import type { Block, ItemContent, Marker, Section, TrackedItem } from "./provider.ts";

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

/** The title on one line: each control character a space (§9), whitespace runs collapsed, cut at 255 code points, then trimmed at the end (UJ11). */
export function renderSummary(content: ItemContent): string {
  return Array.from(plain(content.title).replace(/\s+/g, " ")).slice(0, SUMMARY_LIMIT).join("").trimEnd();
}

function textNode(text: string, marks?: AdfMark[]): AdfNode {
  return marks === undefined ? { type: "text", text } : { type: "text", text, marks };
}

/** A paragraph of the given text nodes; an empty text gives an empty paragraph, since ADF admits no empty text node. */
function paragraph(...nodes: AdfNode[]): AdfNode {
  return { type: "paragraph", content: nodes.filter((node) => node.text !== "") };
}

const STRONG: AdfMark[] = [{ type: "strong" }];
const CODE: AdfMark[] = [{ type: "code" }];

function bulletList(items: AdfNode[]): AdfNode {
  return { type: "bulletList", content: items.map((item) => ({ type: "listItem", content: [item] })) };
}

function factParagraph(block: { label: string; value: string }): AdfNode {
  return paragraph(textNode(block.label, STRONG), textNode(`: ${plain(block.value)}`));
}

/** A section as ADF nodes: the heading as a strong paragraph, each run of facts as one bullet list,
 *  a list block as a strong paragraph then a bullet list, a text block as a paragraph. No list is
 *  nested in a list item, so only the nodes the spike verified appear. */
function sectionNodes(section: Section): AdfNode[] {
  const nodes = [paragraph(textNode(section.heading, STRONG))];
  let facts: AdfNode[] = [];
  const flush = (): void => {
    if (facts.length > 0) nodes.push(bulletList(facts));
    facts = [];
  };
  for (const block of section.blocks) {
    if (block.kind === "fact") {
      facts.push(factParagraph(block));
      continue;
    }
    flush();
    nodes.push(...otherNodes(block));
  }
  flush();
  return nodes;
}

function otherNodes(block: Exclude<Block, { kind: "fact" }>): AdfNode[] {
  if (block.kind === "text") return [paragraph(textNode(block.text))];
  return [paragraph(textNode(block.label, STRONG)), bulletList(block.items.map((item) => paragraph(textNode(plain(item)))))];
}

function originParagraph(content: ItemContent): AdfNode {
  const { analysis, version, chain, action, url } = content.origin;
  const line = textNode(`From the FMEA "${plain(analysis)}", version ${version}, chain ${plain(chain)}, action ${plain(action)}.`);
  if (url === undefined) return paragraph(line);
  return paragraph(line, textNode(" "), textNode("Open the chain in the report", [{ type: "link", attrs: { href: url } }]));
}

/** The key with the code mark, and its three ids in words. */
function keyParagraph(key: string): AdfNode {
  const [metaId, chainId, actionId] = splitKey(key) ?? [key, "", ""];
  return paragraph(
    textNode("Key: "),
    textNode(key, CODE),
    textNode(". In the analysis whose "),
    textNode("meta.id", CODE),
    textNode(` is ${plain(metaId)}, the chain is ${plain(chainId)} and the action is its action ${plain(actionId)}.`),
  );
}

/** The description: the action, the sections, the reference and the marker. */
export function renderDescription(item: TrackedItem): AdfDoc {
  const { content } = item;
  return {
    version: 1,
    type: "doc",
    content: [
      paragraph(textNode(plain(content.action))),
      ...content.sections.flatMap(sectionNodes),
      paragraph(textNode("Reference", STRONG)),
      originParagraph(content),
      keyParagraph(item.key),
      paragraph(textNode(`failwise:key=${item.key} text=${item.text}`, CODE)),
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
