// Writes the definitions region of the skill's references/structure-elements.md from the element
// vocabulary data file, so the reference file and the report's Vocabulary block read one source.
// The region sits between two HTML comment markers; everything outside them is hand-written and
// left as it is. tools/ is independent of skills/fmea-software/scripts/: the data file is read by
// path and its shape checked here, with this tool's own codes, one line `error <CODE>: <message>`,
// exit 1 usage, 2 validation, 3 I/O.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";

export const VOCABULARY_PATH: string = join(import.meta.dirname, "..", "skills", "fmea-software", "data", "element-vocabulary-v1.json");
export const REFERENCE_PATH: string = join(import.meta.dirname, "..", "skills", "fmea-software", "references", "structure-elements.md");
export const START = "<!-- vocabulary:start -->";
export const END = "<!-- vocabulary:end -->";

const USAGE = "usage: node tools/gen-element-vocabulary.ts";
const EXIT: Record<string, number> = { USAGE: 1, VOCABULARY_INVALID: 2, REGION_MISSING: 2, IO_READ: 3, IO_WRITE: 3 };

// A full provenance tag, never a bare record id.
const FULL_TAG = /^(?:(?:sourced|paraphrased|adapted-from|cites):C[0-9]{3}|skill-authored)$/;

type Raw = Record<string, unknown>;

interface CodedError extends Error {
  code: string;
}

/** Throws the one error main reports as `error <code>: <message>`. */
function fail(code: string, message: string): never {
  const err = new Error(message) as CodedError;
  err.code = code;
  throw err;
}

function asObject(raw: unknown, where: string): Raw {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw as Raw;
  return fail("VOCABULARY_INVALID", `${where} is not an object`);
}

function asList(raw: unknown, where: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  return fail("VOCABULARY_INVALID", `${where} is not an array`);
}

/** A string field, made safe for a table cell; an absent optional field is the empty cell. */
function cell(o: Raw, key: string, where: string, optional = false): string {
  const value = o[key];
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.length === 0) fail("VOCABULARY_INVALID", `${where}.${key} is not a non-empty string`);
  return value.replace(/\|/g, "\\|");
}

/** The entry's tags, each in square brackets, space-separated. */
function bracketed(o: Raw, where: string): string {
  const tags = asList(o.tags, `${where}.tags`);
  if (tags.length === 0) fail("VOCABULARY_INVALID", `${where}.tags is empty`);
  for (const tag of tags) {
    if (typeof tag !== "string" || !FULL_TAG.test(tag)) fail("VOCABULARY_INVALID", `${where}.tags holds ${JSON.stringify(tag)}, not a full provenance tag`);
  }
  return tags.map((tag) => `[${tag as string}]`).join(" ");
}

/** One table row: the first column, then the test, the basis and the provenance. */
function row(raw: unknown, where: string, withId: boolean): string {
  const o = asObject(raw, where);
  const name = withId ? `${cell(o, "label", where)} (\`${cell(o, "id", where)}\`)` : cell(o, "label", where);
  return `| ${name} | ${cell(o, "test", where)} | ${cell(o, "basis", where, true)} | ${bracketed(o, where)} |`;
}

function table(heading: string, columns: string, rows: string[]): string {
  return `### ${heading}\n\n| ${columns} | Basis | Provenance |\n|---|---|---|---|\n${rows.join("\n")}\n`;
}

function entries(v: Raw, key: string): string[] {
  return asList(v[key], key).map((raw, i) => row(raw, `${key}[${i}]`, true));
}

function tieBreaks(v: Raw): string {
  const bullets = asList(v.tie_breaks, "tie_breaks").map((raw, i) => {
    const where = `tie_breaks[${i}]`;
    const o = asObject(raw, where);
    return `- ${cell(o, "text", where)} ${bracketed(o, where)}`;
  });
  return `### Tie-breaks\n\n${bullets.join("\n")}\n`;
}

/** The definitions region, markers included, from a parsed vocabulary; throws VOCABULARY_INVALID
 *  on a shape it cannot render. */
export function renderRegion(v: unknown): string {
  const vocabulary = asObject(v, "the vocabulary");
  if (vocabulary.version !== 1) fail("VOCABULARY_INVALID", `version is ${JSON.stringify(vocabulary.version)}, not 1`);
  const sections = [
    table("Role", "Role | Test", entries(vocabulary, "roles")),
    table("Boundary", "Boundary | Criterion", entries(vocabulary, "boundaries")),
    table("Security relevance", "Flag | Test", [row(vocabulary.security, "security", false)]),
    tieBreaks(vocabulary),
  ];
  return `${START}\n\n${sections.join("\n")}\n${END}`;
}

function markerAt(text: string, marker: string): number {
  const at = text.indexOf(marker);
  if (at === -1 || text.indexOf(marker, at + 1) !== -1) fail("REGION_MISSING", `the text must hold ${marker} exactly once`);
  return at;
}

/** The text with everything from the start marker to the end marker replaced by `region`; throws
 *  REGION_MISSING unless each marker occurs once, the start before the end. */
export function replaceRegion(text: string, region: string): string {
  const start = markerAt(text, START);
  const end = markerAt(text, END);
  if (end < start) fail("REGION_MISSING", `${END} comes before ${START}`);
  return text.slice(0, start) + region + text.slice(end + END.length);
}

/** One line whatever the cause says: V8's JSON.parse message can carry a newline. */
function reason(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").trim();
}

function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    return fail("IO_READ", `cannot read ${path}: ${reason(err)}`);
  }
}

function parse(path: string): unknown {
  try {
    return JSON.parse(read(path));
  } catch (err) {
    if ((err as Partial<CodedError>).code !== undefined) throw err;
    return fail("IO_READ", `cannot parse ${path}: ${reason(err)}`);
  }
}

function regenerate(paths: { vocabulary: string; reference: string }): void {
  const region = renderRegion(parse(paths.vocabulary));
  const text = replaceRegion(read(paths.reference), region);
  try {
    writeFileSync(paths.reference, text);
  } catch (err) {
    fail("IO_WRITE", `cannot write ${paths.reference}: ${reason(err)}`);
  }
}

/** With no arguments, rewrites the region of `paths.reference` from `paths.vocabulary`; any
 *  argument is USAGE. Returns the exit status. */
export function main(argv: string[], paths = { vocabulary: VOCABULARY_PATH, reference: REFERENCE_PATH }): number {
  try {
    if (argv.length !== 0) fail("USAGE", USAGE);
    regenerate(paths);
    return 0;
  } catch (err) {
    const code = (err as Partial<CodedError>).code;
    if (code === undefined || EXIT[code] === undefined) throw err;
    process.stderr.write(`error ${code}: ${reason(err)}\n`);
    return EXIT[code];
  }
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
