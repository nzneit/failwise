// An item rendered as a GitHub issue title and Markdown body, and the marker read back from a body.
// Pure text: no process, no network.

import { splitKey } from "./items.ts";
import { plain } from "./text.ts";
import type { Block, ItemContent, Marker, Section, TrackedItem } from "./provider.ts";

const WORD_JOINER = "\u2060";
const HEX_RUN = /[0-9a-fA-F]{7,}/g;
const MARKER_LINE = /^<!-- failwise:key=(\S+) text=([0-9a-f]{12}) -->$/;

function breakHexRun(run: string): string {
  return run.match(/.{1,6}/g)?.join(WORD_JOINER) ?? run;
}

function escapeCharacter(ch: string): string {
  if (ch === "&") return `&amp;${WORD_JOINER}`;
  if (ch === "<") return `&lt;${WORD_JOINER}`;
  if (ch === ">") return `&gt;${WORD_JOINER}`;
  return /[!-/:-@[-`{-~]/.test(ch) ? `\\${ch}${WORD_JOINER}` : ch;
}

/**
 * Text from the analysis, made literal on GitHub (§8.3, §19.1): every line break and every other
 * control character becomes one space and the ends are trimmed, so no text leaves its table cell or
 * opens a code block; long hexadecimal runs are broken so no commit reference forms; and every
 * ASCII punctuation character is escaped, with a word joiner after it so no autolink forms across the gap.
 */
export function literal(text: string): string {
  return Array.from(plain(text).replace(HEX_RUN, breakHexRun), escapeCharacter).join("");
}

/** A title is not interpreted by GitHub (the probe of §19.1), so it is written as it is. */
export function renderTitle(content: ItemContent): string {
  return content.title;
}

/** A fact or a list as bullet lines: the label in bold, the analysis text made literal. */
function bulletLines(block: Exclude<Block, { kind: "text" }>): string[] {
  if (block.kind === "fact") return [`- **${block.label}:** ${literal(block.value)}`];
  return [`- **${block.label}:**`, ...block.items.map((item) => `  - ${literal(item)}`)];
}

/** A section as Markdown parts: the heading, then each run of facts and lists as one bullet list,
 *  and each text block as its own paragraph, written as it is. */
function sectionParts(section: Section): string[] {
  const parts = [`### ${section.heading}`];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 0) parts.push(run.join("\n"));
    run = [];
  };
  for (const block of section.blocks) {
    if (block.kind === "text") {
      flush();
      parts.push(block.text);
    } else {
      run.push(...bulletLines(block));
    }
  }
  flush();
  return parts;
}

function originLine(content: ItemContent): string {
  const { analysis, version, chain, action, url } = content.origin;
  const line = `From the FMEA "${literal(analysis)}", version ${version}, chain ${literal(chain)}, action ${literal(action)}.`;
  return url === undefined ? line : `${line} [Open the chain in the report](${url})`;
}

/** The key in a code span, and its three ids in words. The key is three plain ids, so it holds no backtick. */
function keyLine(key: string): string {
  const [metaId, chainId, actionId] = splitKey(key) ?? [key, "", ""];
  return `Key: \`${key}\`. In the analysis whose \`meta.id\` is ${literal(metaId)}, the chain is ${literal(chainId)} and the action is its action ${literal(actionId)}.`;
}

/** The body: the action, the sections, the reference and the marker. */
export function renderBody(item: TrackedItem): string {
  const { content } = item;
  return [
    literal(content.action),
    ...content.sections.flatMap(sectionParts),
    "### Reference",
    originLine(content),
    keyLine(item.key),
    `<!-- failwise:key=${item.key} text=${item.text} -->`,
  ].join("\n\n");
}

/** The marker on the last non-empty line of a body, whatever spaces or tabs end that line, or null
 *  when there is none or a line follows it. */
export function readMarker(body: string | null): Marker | null {
  if (body === null) return null;
  const lines = body.replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).filter((line) => line !== "");
  const match = MARKER_LINE.exec(lines.at(-1) ?? "");
  if (match === null || splitKey(match[1]) === null) return null;
  return { key: match[1], text: match[2] };
}
