// Measures the skill's prose and ratchets it against a baseline (spec §7.6). For SKILL.md and each
// references/*.md it counts, per heading, the untagged items, the sentences over 25 words and the
// filler words, on one basis for every file. The baseline is a ratchet, not a cap: a count may fall
// and may never rise, and a commit that lowers a count lowers the baseline in the same commit.
//
//   node tools/check-prose.ts                    # measure and compare with dev/prose-baseline.json
//   node tools/check-prose.ts --write-baseline   # write the measured counts as the baseline
//   bun tools/check-prose.ts                     # a shell where only Bun is on PATH
//
// It measures the current directory, so run it from the repository root; a run from anywhere else
// ends in `error IO_READ:` lines. It prints the counts per heading and per file on every run.
// Exit status 0 when the counts hold, 1 on a count above its baseline, a write that would raise a
// count, or a bad argument, and 3 on any unreadable input: a missing or non-JSON baseline, a file
// that cannot be read, or a file that measures 0 items. The coded lines are PROSE, USAGE and IO_READ.
// The baseline is { "<repo-relative path>": { "untagged": n, "long": n, "filler": n } }, keys sorted.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, type Host } from "./lib/host.ts";

export interface Counts {
  untagged: number;
  long: number;
  filler: number;
}
export interface HeadingCounts {
  heading: string;
  counts: Counts;
  items: number;
}
export interface FileMeasure {
  path: string;
  headings: HeadingCounts[];
  total: Counts;
  items: number;
}
export type ProseHost = Host & { readFile: (path: string) => string };

export const LONG_WORDS = 25;
export const MIN_WORDS = 3;
export const FILLER = ["basically", "essentially", "simply", "actually", "in order to"];
export const BASELINE_PATH = "dev/prose-baseline.json";

const SKILL_DIR = "skills/fmea-software";
const USAGE = "usage: node tools/check-prose.ts [--write-baseline]";
const COUNT_NAMES = ["untagged", "long", "filler"] as const;
const TAG = "\\[(?:skill-authored|(?:paraphrased|adapted-from|cites|sourced):C\\d+)\\]";
const SPLIT = new RegExp("(?<=[.!?]|" + TAG + ")\\s+(?=[A-Z`\"'(]|\\[(?!" + TAG.slice(2) + "))");
const FILLER_RE = new RegExp("\\b(?:" + FILLER.join("|") + ")\\b", "gi");

type LineKind = "fence" | "heading" | "skip" | "row" | "bullet" | "text";

export function defaultProseHost(): ProseHost {
  return { ...defaultHost(), readFile: (path) => readFileSync(path, "utf8") };
}

export function proseFiles(root: string, host: ProseHost): string[] {
  const references = host
    .listDir(join(root, SKILL_DIR, "references"))
    .filter((name) => name.endsWith(".md"))
    .sort();
  return [`${SKILL_DIR}/SKILL.md`, ...references.map((name) => `${SKILL_DIR}/references/${name}`)];
}

function emptyCounts(): Counts {
  return { untagged: 0, long: 0, filler: 0 };
}

function stripFrontmatter(lines: string[]): string[] {
  if (lines[0] !== "---") return lines;
  const end = lines.indexOf("---", 1);
  return end === -1 ? lines : lines.slice(end + 1);
}

/** The inclusive line ranges that are exempt, by path and marker. A start without its end exempts nothing. */
function exemptRanges(path: string, lines: string[]): Array<[number, number]> {
  if (path === `${SKILL_DIR}/references/structure-elements.md`) {
    const start = lines.indexOf("<!-- vocabulary:start -->");
    const end = lines.indexOf("<!-- vocabulary:end -->");
    return start !== -1 && end > start ? [[start, end]] : [];
  }
  if (path === `${SKILL_DIR}/references/provenance.md`) {
    const start = lines.indexOf("## The source register");
    if (start === -1) return [];
    const next = lines.findIndex((line, index) => index > start && line.startsWith("#"));
    return [[start, next === -1 ? lines.length - 1 : next - 1]];
  }
  return [];
}

function classifyLine(line: string): LineKind {
  if (line.startsWith("```")) return "fence";
  if (line.startsWith("#")) return "heading";
  if (line.trim() === "" || /^\s*<!--.*-->\s*$/.test(line)) return "skip";
  if (line.startsWith("|")) return "row";
  return /^\s*(?:[-*]|\d+\.)\s+/.test(line) ? "bullet" : "text";
}

function rowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^[-:]+$/.test(cell));
}

function hasTag(text: string): boolean {
  return new RegExp(TAG).test(text);
}

/** The text a sentence is measured on: no tags, a code span one token, a link its label, no markers. */
function measuredText(sentence: string): string {
  return sentence
    .replace(new RegExp(TAG, "g"), " ")
    .replace(/`[^`]*`/g, "CODE")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_]/g, "");
}

function wordCount(sentence: string): number {
  return measuredText(sentence)
    .split(/\s+/)
    .filter((word) => word !== "").length;
}

function sentencesOf(text: string): string[] {
  return text
    .trim()
    .split(SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function fillerCount(sentence: string): number {
  return measuredText(sentence).match(FILLER_RE)?.length ?? 0;
}

/** The sentences of a text that are long enough to be measured. */
function measuredSentences(text: string): string[] {
  return sentencesOf(text).filter((sentence) => wordCount(sentence) >= MIN_WORDS);
}

function addSentences(target: HeadingCounts, text: string): void {
  for (const sentence of measuredSentences(text)) {
    if (wordCount(sentence) > LONG_WORDS) target.counts.long += 1;
    target.counts.filler += fillerCount(sentence);
  }
}

function addText(target: HeadingCounts, line: string): void {
  for (const sentence of measuredSentences(line)) {
    target.items += 1;
    if (!hasTag(sentence)) target.counts.untagged += 1;
    addSentences(target, sentence);
  }
}

function addBullet(target: HeadingCounts, line: string): void {
  const text = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
  target.items += 1;
  if (!hasTag(text)) target.counts.untagged += 1;
  addSentences(target, text);
}

function addRow(target: HeadingCounts, cells: string[]): void {
  target.items += 1;
  if (!hasTag(cells[cells.length - 1])) target.counts.untagged += 1;
  for (const cell of cells.slice(0, -1)) addSentences(target, cell);
}

function newHeading(heading: string): HeadingCounts {
  return { heading, counts: emptyCounts(), items: 0 };
}

export function measureText(path: string, text: string): FileMeasure {
  const lines = stripFrontmatter(text.split("\n"));
  const exempt = exemptRanges(path, lines);
  const headings: HeadingCounts[] = [newHeading("(preamble)")];
  let fence = false;
  let table = false;
  lines.forEach((line, index) => {
    if (exempt.some(([from, to]) => index >= from && index <= to)) return;
    const kind = classifyLine(line);
    const current = headings[headings.length - 1];
    if (kind === "fence") fence = !fence;
    if (fence || kind === "fence") return;
    if (kind === "heading") headings.push(newHeading(line.replace(/^#+/, "").trim()));
    const cells = kind === "row" ? rowCells(line) : [];
    if (kind === "row" && table && !isSeparatorRow(cells)) addRow(current, cells);
    else if (kind === "bullet") addBullet(current, line);
    else if (kind === "text") addText(current, line);
    table = kind === "row";
  });
  const total = emptyCounts();
  for (const heading of headings) {
    for (const name of COUNT_NAMES) total[name] += heading.counts[name];
  }
  return { path, headings, total, items: headings.reduce((sum, heading) => sum + heading.items, 0) };
}

function isCounts(value: unknown): value is Counts {
  const entry = value as Record<string, unknown> | null;
  return typeof entry === "object" && entry !== null && COUNT_NAMES.every((name) => Number.isInteger(entry[name]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compareToBaseline(measured: FileMeasure[], baseline: unknown): string[] {
  if (!isObject(baseline)) return [`error PROSE: ${BASELINE_PATH} is not a JSON object`];
  const errors: string[] = [];
  for (const file of measured) {
    const entry = baseline[file.path];
    if (!isCounts(entry)) {
      errors.push(`error PROSE: ${BASELINE_PATH} lacks ${file.path}`);
      continue;
    }
    for (const name of COUNT_NAMES) {
      if (file.total[name] > entry[name]) {
        errors.push(`error PROSE: ${file.path}: ${name} is ${file.total[name]}, above its baseline ${entry[name]}`);
      }
    }
  }
  const inScope = new Set(measured.map((file) => file.path));
  for (const key of Object.keys(baseline).sort()) {
    if (!inScope.has(key)) errors.push(`error PROSE: ${BASELINE_PATH} names ${key}, which is not in scope`);
  }
  return errors;
}

/** The lines for a write that would raise a count above an existing entry. */
function risingCounts(measured: FileMeasure[], baseline: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const file of measured) {
    const entry = baseline[file.path];
    if (!isCounts(entry)) continue;
    for (const name of COUNT_NAMES) {
      if (file.total[name] > entry[name]) {
        errors.push(`error PROSE: ${file.path}: ${name} would rise from ${entry[name]} to ${file.total[name]}`);
      }
    }
  }
  return errors;
}

function formatCounts(counts: Counts): string {
  return `${counts.untagged} untagged, ${counts.long} over ${LONG_WORDS} words, ${counts.filler} filler`;
}

function printCounts(file: FileMeasure, write: (line: string) => void): void {
  write(`## ${file.path}`);
  for (const heading of file.headings) write(`- ${heading.heading}: ${formatCounts(heading.counts)}`);
  write(`total: ${formatCounts(file.total)}`);
}

function writeBaseline(root: string, measured: FileMeasure[]): void {
  const baseline: Record<string, Counts> = {};
  for (const file of [...measured].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    baseline[file.path] = { filler: file.total.filler, long: file.total.long, untagged: file.total.untagged };
  }
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(baseline, null, 2) + "\n");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads the baseline: no value when it is absent and `allowMissing`, an IO_READ line when it
 *  cannot be read or is not JSON. */
function readBaseline(root: string, host: ProseHost, allowMissing: boolean): { value?: unknown; error?: string } {
  const path = join(root, BASELINE_PATH);
  if (allowMissing && !host.exists(path)) return {};
  try {
    return { value: JSON.parse(host.readFile(path)) };
  } catch (error) {
    return { error: `error IO_READ: ${BASELINE_PATH}: ${message(error)}` };
  }
}

/** Measures every file in scope; the files that cannot be read or measure nothing are `failed`. */
function measureAll(
  root: string,
  host: ProseHost,
  files: string[],
): { measured: FileMeasure[]; failed: string[]; errors: string[] } {
  const measured: FileMeasure[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  for (const path of files) {
    try {
      const file = measureText(path, host.readFile(join(root, path)));
      if (file.items === 0) throw new Error("measures 0 items");
      measured.push(file);
    } catch (error) {
      failed.push(path);
      errors.push(`error IO_READ: ${path}: ${message(error)}`);
    }
  }
  return { measured, failed, errors };
}

function withoutKeys(baseline: unknown, keys: string[]): unknown {
  if (!isObject(baseline)) return baseline;
  return Object.fromEntries(Object.entries(baseline).filter(([key]) => !keys.includes(key)));
}

/** The PROSE lines of a run whose inputs were all read: a comparison, or a write that refuses to raise a count. */
function judge(
  root: string,
  baseline: { value?: unknown },
  run: { measured: FileMeasure[]; failed: string[] },
  writeMode: boolean,
  write: (line: string) => void,
): string[] {
  if (!writeMode) return compareToBaseline(run.measured, withoutKeys(baseline.value, run.failed));
  const existing = baseline.value;
  if (existing !== undefined && !isObject(existing)) return [`error PROSE: ${BASELINE_PATH} is not a JSON object`];
  const rising = risingCounts(run.measured, existing ?? {});
  if (rising.length === 0) {
    writeBaseline(root, run.measured);
    write(`wrote ${BASELINE_PATH}`);
  }
  return rising;
}

export function checkProse(
  root: string,
  host: ProseHost,
  options: { writeBaseline: boolean },
  write: (line: string) => void,
  writeError: (line: string) => void,
): number {
  const lines: string[] = [];
  const fail = (line: string): void => {
    lines.push(line);
    writeError(line);
  };
  let files: string[] = [];
  try {
    files = proseFiles(root, host);
  } catch (error) {
    fail(`error IO_READ: ${SKILL_DIR}/references: ${message(error)}`);
  }
  const run = measureAll(root, host, files);
  const baseline = readBaseline(root, host, options.writeBaseline);
  for (const file of run.measured) printCounts(file, write);
  for (const line of run.errors) fail(line);
  if (baseline.error) fail(baseline.error);
  const unreadable = lines.length > 0;
  if (!(unreadable && options.writeBaseline) && !baseline.error) {
    for (const line of judge(root, baseline, run, options.writeBaseline, write)) fail(line);
  }
  if (lines.some((line) => line.startsWith("error IO_READ:"))) return 3;
  return lines.length > 0 ? 1 : 0;
}

function main(args: string[]): number {
  const printLine = (line: string): void => void process.stdout.write(line + "\n");
  const printError = (line: string): void => void process.stderr.write(line + "\n");
  if (args.some((arg) => arg !== "--write-baseline")) {
    printError(`error USAGE: ${USAGE}`);
    return 1;
  }
  return checkProse(process.cwd(), defaultProseHost(), { writeBaseline: args.length > 0 }, printLine, printError);
}

if (isEntry(import.meta)) {
  process.exit(main(process.argv.slice(2)));
}
