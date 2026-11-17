// Generates each shipped skill file from its tagged source. Authors keep a tag
// on every line; the file Claude Code loads keeps only the sourced tags. It
// knows Markdown only as frontmatter, backtick fences and pipe tables.
// One line `error <CODE>: <message>` on failure: exit 1 usage, 3 I/O.
import { join, resolve } from "node:path";
import { fail, readText, report, writeText } from "./lib/coded-error.ts";
import { isEntry } from "./lib/entry.ts";

const ROOT = join(import.meta.dirname, "..");
const USAGE = "usage: node tools/gen-skill.ts";
const EXIT: Record<string, number> = { USAGE: 1, IO_READ: 3, IO_WRITE: 3 };

const SOURCED = String.raw`\[(?:sourced|paraphrased|adapted-from|cites):C\d+\]`;
// One space and the tag, unless a sourced tag sits directly before it or after it across one space.
const OWN_TAG = new RegExp(String.raw`(?<!${SOURCED}) \[skill-authored\](?! ${SOURCED})`, "g");

/** The generated files and their tagged sources, as repository-relative paths.
 *  One entry: dev/skill-source/SKILL.md generates skills/fmea-software/SKILL.md. */
export const PAIRS: readonly { source: string; output: string }[] = [
  { source: "dev/skill-source/SKILL.md", output: "skills/fmea-software/SKILL.md" },
];

/** One line of the text: its content without the "\r" of a CRLF ending, that ending, and whether
 *  it is frontmatter, a fence line or inside a fence, which strip copies unchanged. */
interface Line {
  text: string;
  cr: string;
  fixed: boolean;
}

function splitLines(text: string): Line[] {
  const lines = text.split("\n").map((raw) => (raw.endsWith("\r") ? { text: raw.slice(0, -1), cr: "\r", fixed: false } : { text: raw, cr: "", fixed: false }));
  const close = lines[0].text === "---" ? lines.findIndex((line, i) => i > 0 && line.text === "---") : -1;
  let fenced = false;
  lines.forEach((line, i) => {
    const marker = line.text.startsWith("```");
    line.fixed = i <= close || fenced || marker;
    if (marker && i > close) fenced = !fenced;
  });
  return lines;
}

/** The last cell of a table line that ends in an unescaped "|": its text, and the index of the
 *  unescaped "|" that opens it. */
function lastCell(text: string): { text: string; start: number } | undefined {
  const trimmed = text.trimEnd();
  const pipes = [...trimmed.matchAll(/(?<!\\)\|/g)].map((match) => match.index);
  if (pipes.length < 2 || pipes[pipes.length - 1] !== trimmed.length - 1) return undefined;
  const start = pipes[pipes.length - 2];
  return { text: trimmed.slice(start + 1, -1), start };
}

/** Removes the last cell from every line of a table whose lines all end in a pipe, whose header's
 *  last cell is Provenance and whose body rows' last cells are all empty. A table with a line
 *  that does not end in a pipe keeps every column; the suite's success-criterion test fails on it. */
function dropOwnColumn(table: Line[]): void {
  const rows = table.map((line) => ({ line, cell: lastCell(line.text) }));
  const own = rows.length >= 2 && rows[0].cell?.text.trim() === "Provenance" && rows.every(({ cell }, i) => cell !== undefined && (i < 2 || cell.text.trim() === ""));
  if (!own) return;
  for (const { line, cell } of rows) if (cell) line.text = line.text.trimEnd().slice(0, cell.start + 1);
}

/** Each run of consecutive unfixed lines starting with "|", in order. */
function tables(lines: Line[]): Line[][] {
  const runs: Line[][] = [];
  let run: Line[] = [];
  for (const line of lines) {
    if (!line.fixed && line.text.startsWith("|")) {
      run.push(line);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The shipped form of a tagged Markdown text. Each `[skill-authored]` that
 *  does not touch a sourced tag is removed with the space before it. A last
 *  table column headed `Provenance` that is then left with only empty cells is
 *  removed when every line of its table ends in a pipe. Frontmatter and fenced
 *  blocks pass unchanged. Pure, never throws, idempotent. */
export function strip(text: string): string {
  const lines = splitLines(text);
  for (const line of lines) if (!line.fixed) line.text = line.text.replace(OWN_TAG, "");
  for (const table of tables(lines)) dropOwnColumn(table);
  return lines.map((line) => line.text + line.cr).join("\n");
}

/** With no argument, it reads every pair's source first, then writes strip() of
 *  each to its output and returns 0. A pair's paths are repository-relative or
 *  absolute. An error prints one `error <CODE>: <message>` line: USAGE (1) on any
 *  argument and IO_READ (3) on an unreadable source, both writing nothing;
 *  IO_WRITE (3) on an output it cannot write. */
export function main(argv: string[], pairs = PAIRS): number {
  try {
    if (argv.length !== 0) fail("USAGE", USAGE);
    const texts = pairs.map(({ source }) => readText(resolve(ROOT, source)));
    pairs.forEach(({ output }, i) => writeText(resolve(ROOT, output), strip(texts[i])));
    return 0;
  } catch (err) {
    return report(err, EXIT);
  }
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
