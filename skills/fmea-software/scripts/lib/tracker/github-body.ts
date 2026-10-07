// An item rendered as a GitHub issue title and Markdown body, and the marker read back from a body.
// Pure text: no process, no network.

import { splitKey } from "./items.ts";
import { CLOSING_LINE } from "./provider.ts";
import { plain } from "./text.ts";
import type { ItemContent, Marker, TrackedItem } from "./provider.ts";

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

function originLine(content: ItemContent): string {
  const { analysis, chain, action, url } = content.origin;
  const line = `From the FMEA "${literal(analysis)}", row ${literal(chain)}, action ${literal(action)}.`;
  return url === undefined ? line : `${line} [Open the row in the report](${url})`;
}

/** The body: the action, the facts as a table, the origin, the closing line and the marker. */
export function renderBody(item: TrackedItem): string {
  const { content } = item;
  const rows = content.facts.map((fact) => `| ${fact.label} | ${literal(fact.value)} |`);
  return [
    literal(content.action),
    ["| | |", "|---|---|", ...rows].join("\n"),
    originLine(content),
    CLOSING_LINE,
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
