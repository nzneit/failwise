// Measures the skill's prose and ratchets it against a baseline (spec §7.6).
// It reads SKILL.md and each references/*.md.
// It counts, per heading, the untagged items, the sentences over 25 words and the filler words.
// Every file is measured on one basis.
// The baseline is a ratchet, not a cap: a count may fall and may never rise.
// A commit that lowers a count lowers the baseline in the same commit.
// The checker fails closed: input it cannot read or judge is never a pass.
//
//   node tools/check-prose.ts                    # measure and compare with dev/prose-baseline.json
//   node tools/check-prose.ts --write-baseline   # write the measured counts as the baseline
//   bun tools/check-prose.ts                     # a shell where only Bun is on PATH
//
// It measures the current directory, so run it from the repository root.
// A run from anywhere else ends in `error IO_READ:` lines.
// After the arguments parse, it prints the counts per heading and per file for every file it read.
// It prints them on every run.
// Exit status 0 when the counts hold.
// Exit status 1 on a count above its baseline or a write that would raise a count.
// It also exits 1 on a file in scope that the baseline lacks, or a baseline entry outside the scope.
// It also exits 1 on a bad argument.
// Exit status 3 on a missing or unreadable baseline, or a baseline that is not a JSON object.
// It also exits 3 on an unreadable file, or a file that measures nothing.
// It also exits 3 on a references folder that cannot be listed, or a baseline write that fails.
// The coded lines are PROSE, USAGE, IO_READ and IO_WRITE.
// The baseline is { "<repo-relative path>": { "filler": n, "long": n, "untagged": n } }.
// The keys are sorted at both levels.

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
const REFERENCES_PREFIX = `${SKILL_DIR}/references/`;
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
  return isObject(value) && COUNT_NAMES.every((name) => Number.isInteger(value[name]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NOT_OBJECT = `error IO_READ: ${BASELINE_PATH} is not a JSON object`;

interface Rise {
  path: string;
  name: (typeof COUNT_NAMES)[number];
  measured: number;
  baseline: number;
}

/** Each count that is above its baseline entry; a file without a whole entry has none. */
function countsAbove(measured: FileMeasure[], baseline: Record<string, unknown>): Rise[] {
  const rises: Rise[] = [];
  for (const file of measured) {
    const entry = baseline[file.path];
    if (!isCounts(entry)) continue;
    for (const name of COUNT_NAMES) {
      if (file.total[name] > entry[name]) rises.push({ path: file.path, name, measured: file.total[name], baseline: entry[name] });
    }
  }
  return rises;
}

export function compareToBaseline(measured: FileMeasure[], baseline: unknown): string[] {
  if (!isObject(baseline)) return [NOT_OBJECT];
  const errors: string[] = [];
  for (const file of measured) {
    if (!isCounts(baseline[file.path])) errors.push(`error PROSE: ${BASELINE_PATH} lacks ${file.path}`);
  }
  for (const rise of countsAbove(measured, baseline)) {
    errors.push(`error PROSE: ${rise.path}: ${rise.name} is ${rise.measured}, above its baseline ${rise.baseline}`);
  }
  const inScope = new Set(measured.map((file) => file.path));
  for (const key of Object.keys(baseline).sort()) {
    if (!inScope.has(key)) errors.push(`error PROSE: ${BASELINE_PATH} names ${key}, which is not in scope`);
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
    const value: unknown = JSON.parse(host.readFile(path));
    return isObject(value) ? { value } : { error: NOT_OBJECT };
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

function withoutKeys(baseline: Record<string, unknown>, drop: (key: string) => boolean): Record<string, unknown> {
  return Object.fromEntries(Object.entries(baseline).filter(([key]) => !drop(key)));
}

/** The PROSE and IO_WRITE lines of a run whose inputs were all read: a comparison, or a write that refuses to raise a count. */
function judge(
  root: string,
  baseline: { value?: unknown },
  run: { measured: FileMeasure[]; failed: string[]; unlisted: boolean },
  writeMode: boolean,
  write: (line: string) => void,
): string[] {
  const existing = isObject(baseline.value) ? baseline.value : {};
  if (!writeMode) {
    const drop = (key: string): boolean => run.failed.includes(key) || (run.unlisted && key.startsWith(REFERENCES_PREFIX));
    return compareToBaseline(run.measured, withoutKeys(existing, drop));
  }
  const rising = countsAbove(run.measured, existing).map(
    (rise) => `error PROSE: ${rise.path}: ${rise.name} would rise from ${rise.baseline} to ${rise.measured}`,
  );
  if (rising.length > 0) return rising;
  try {
    writeBaseline(root, run.measured);
  } catch (error) {
    return [`error IO_WRITE: ${BASELINE_PATH}: ${message(error)}`];
  }
  write(`wrote ${BASELINE_PATH}`);
  return [];
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
  let files: string[] = [`${SKILL_DIR}/SKILL.md`];
  let unlisted = false;
  try {
    files = proseFiles(root, host);
  } catch (error) {
    unlisted = true;
    fail(`error IO_READ: ${SKILL_DIR}/references: ${message(error)}`);
  }
  const run = { ...measureAll(root, host, files), unlisted };
  const baseline = readBaseline(root, host, options.writeBaseline);
  for (const file of run.measured) printCounts(file, write);
  for (const line of run.errors) fail(line);
  if (baseline.error) fail(baseline.error);
  const unreadable = lines.length > 0;
  if (!(unreadable && options.writeBaseline) && !baseline.error) {
    for (const line of judge(root, baseline, run, options.writeBaseline, write)) fail(line);
  }
  if (lines.some((line) => /^error IO_(?:READ|WRITE):/.test(line))) return 3;
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
