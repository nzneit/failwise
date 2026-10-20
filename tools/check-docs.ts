// Enforces the public documentation surface and the caps that keep it small (design sections S1,
// S12 and 8.1).
//
//   node tools/check-docs.ts                    # check the tracked tree
//   node tools/check-docs.ts --write-baseline   # lower caps to the measurements
//
// In scope is every tracked `*.md` outside `skills/`, plus every tracked file under `docs/`
// whatever its extension. `.github/pull_request_template.md` is the only exclusion.
// Seven paths are allowlisted; any other in-scope tracked path fails whatever its size.
// `dev/docs-baseline.json` stores the caps, not the measurements, and is seeded by hand.
// `--write-baseline` may only lower a cap, never raise one, and never creates or reshapes the file.
// Exit 1 on a violation, 3 when the baseline or the tracked list cannot be read.
// The coded lines are DOCS, IO_READ, IO_WRITE and USAGE.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, type Host } from "./lib/host.ts";
import { countLines, countWords } from "./lib/measure.ts";

export const BASELINE_PATH = "dev/docs-baseline.json";
export const ALLOWLIST = [
  ".claude/CLAUDE.md",
  "CONTRIBUTING.md",
  "README.md",
  "docs/design.md",
  "docs/scripts.md",
  "docs/style.md",
  "docs/tracking.md",
] as const;
const DOCS_PATHS = ALLOWLIST.filter((path) => path.startsWith("docs/"));
const TEMPLATE = ".github/pull_request_template.md";
const BANNED_WORDS = ["plan", "acceptance", "result", "eval"] as const;
const DATE = /\d{4}-\d{2}-\d{2}/u;
const SUBDIRECTORY = /^docs\/[^/]+\/[^/]+$/u;
const USAGE = "usage: node tools/check-docs.ts [--write-baseline]";

export interface DocsHost extends Host {
  readFile: (path: string) => string | null;
  writeFile: (path: string, text: string) => boolean;
}

interface FileCap {
  words: number;
  lines?: number;
}

interface Baseline {
  files: Record<string, FileCap>;
  totalWords: number;
  totalLines: number;
}

interface Measured {
  path: string;
  words: number;
  lines: number;
}

interface Totals {
  words: number;
  lines: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCap(value: unknown): value is FileCap {
  if (!isObject(value)) return false;
  if (!Number.isInteger(value.words)) return false;
  return value.lines === undefined || Number.isInteger(value.lines);
}

function parseBaseline(text: string | null): Baseline | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.files)) return null;
  const files: Record<string, FileCap> = {};
  for (const [path, cap] of Object.entries(parsed.files)) {
    if (!isCap(cap)) return null;
    files[path] = cap;
  }
  if (!Number.isInteger(parsed.totalWords) || !Number.isInteger(parsed.totalLines)) return null;
  return { files, totalWords: parsed.totalWords as number, totalLines: parsed.totalLines as number };
}

function inScope(path: string): boolean {
  if (path === TEMPLATE) return false;
  if (path.startsWith("docs/")) return true;
  if (path.startsWith("skills/")) return false;
  return path.endsWith(".md");
}

/** The one reason a tracked path outside the allowlist fails, if it has one. */
function outsideReason(path: string): string {
  if (path.startsWith("docs/")) {
    if (SUBDIRECTORY.test(path)) return `${path} is under a subdirectory of docs/`;
    if (DATE.test(path.slice(path.lastIndexOf("/") + 1))) return `${path} carries a date`;
    const lower = path.toLowerCase();
    for (const word of BANNED_WORDS) {
      if (lower.includes(word)) return `${path} carries the word "${word}"`;
    }
  }
  return `${path} is tracked and not on the allowlist`;
}

/** Whether every allowlisted path is tracked, and no other in-scope path is. */
function surfaceErrors(tracked: string[]): string[] {
  const errors: string[] = [];
  for (const path of ALLOWLIST) {
    if (!tracked.includes(path)) errors.push(`error DOCS: ${path} is on the allowlist and is not tracked`);
  }
  for (const path of tracked) {
    if (!inScope(path) || (ALLOWLIST as readonly string[]).includes(path)) continue;
    errors.push(`error DOCS: ${outsideReason(path)}`);
  }
  return errors;
}

function measure(host: DocsHost, root: string, path: string): Measured | null {
  const text = host.readFile(join(root, path));
  if (text === null) return null;
  return { path, words: countWords(text), lines: countLines(text) };
}

function totalsOf(measured: Measured[]): Totals {
  const words = measured.reduce((sum, file) => sum + file.words, 0);
  const lines = DOCS_PATHS.reduce(
    (sum, path) => sum + (measured.find((file) => file.path === path)?.lines ?? 0),
    0,
  );
  return { words, lines };
}

/** The cap and budget lines of a check run. */
function capErrors(measured: Measured[], baseline: Baseline, totals: Totals): string[] {
  const errors: string[] = [];
  for (const file of measured) {
    const cap = baseline.files[file.path];
    if (!cap) continue;
    if (file.words > cap.words) errors.push(`error DOCS: ${file.path} is ${file.words} words, above its cap of ${cap.words}`);
    if (cap.lines !== undefined && file.lines > cap.lines) {
      errors.push(`error DOCS: ${file.path} is ${file.lines} lines, above its cap of ${cap.lines}`);
    }
  }
  if (totals.words > baseline.totalWords) {
    errors.push(`error DOCS: total words ${totals.words}, above the budget of ${baseline.totalWords}`);
  }
  if (totals.lines > baseline.totalLines) {
    errors.push(`error DOCS: total lines ${totals.lines}, above the budget of ${baseline.totalLines}`);
  }
  return errors;
}

/** The lines that refuse a `--write-baseline` which would raise a cap, a budget or the path set. */
function raiseErrors(measured: Measured[], baseline: Baseline, totals: Totals): string[] {
  const baselinePaths = Object.keys(baseline.files).sort();
  const allowlisted = [...ALLOWLIST].sort();
  if (baselinePaths.join("\n") !== allowlisted.join("\n")) {
    return ["error DOCS: --write-baseline refuses to add or remove a path"];
  }
  const errors: string[] = [];
  for (const file of measured) {
    const cap = baseline.files[file.path];
    if (!cap) continue;
    if (file.words > cap.words) {
      errors.push(`error DOCS: --write-baseline would raise ${file.path}'s word cap from ${cap.words} to ${file.words}`);
    }
    if (cap.lines !== undefined && file.lines > cap.lines) {
      errors.push(`error DOCS: --write-baseline would raise ${file.path}'s line cap from ${cap.lines} to ${file.lines}`);
    }
  }
  if (totals.words > baseline.totalWords) {
    errors.push(`error DOCS: --write-baseline would raise the total word budget from ${baseline.totalWords} to ${totals.words}`);
  }
  if (totals.lines > baseline.totalLines) {
    errors.push(`error DOCS: --write-baseline would raise the total line budget from ${baseline.totalLines} to ${totals.lines}`);
  }
  return errors;
}

function serialiseBaseline(measured: Measured[], baseline: Baseline, totals: Totals): string {
  const files: Record<string, FileCap> = {};
  for (const path of [...ALLOWLIST].sort()) {
    const file = measured.find((each) => each.path === path);
    const cap = baseline.files[path];
    if (!file || !cap) continue;
    files[path] = cap.lines === undefined ? { words: file.words } : { lines: file.lines, words: file.words };
  }
  const value = { files, totalLines: totals.lines, totalWords: totals.words };
  return JSON.stringify(value, null, 2) + "\n";
}

function measuredFiles(
  host: DocsHost,
  root: string,
  tracked: string[],
): { measured: Measured[]; missing: string | null } {
  const measured: Measured[] = [];
  for (const path of ALLOWLIST) {
    if (!tracked.includes(path)) continue;
    const file = measure(host, root, path);
    if (file === null) return { measured, missing: path };
    measured.push(file);
  }
  return { measured, missing: null };
}

function refuse(lines: string[], fail: (line: string) => void): number {
  for (const line of lines) fail(line);
  return 1;
}

function stop(line: string, fail: (line: string) => void, status: number): number {
  fail(line);
  return status;
}

function writeLowered(
  root: string,
  host: DocsHost,
  measured: Measured[],
  baseline: Baseline,
  totals: Totals,
  write: (line: string) => void,
  fail: (line: string) => void,
): number {
  const raises = raiseErrors(measured, baseline, totals);
  if (raises.length > 0) return refuse(raises, fail);
  const text = serialiseBaseline(measured, baseline, totals);
  if (!host.writeFile(join(root, BASELINE_PATH), text)) {
    return stop(`error IO_WRITE: ${BASELINE_PATH} could not be written`, fail, 3);
  }
  write(`wrote ${BASELINE_PATH}`);
  return 0;
}

export function checkDocs(
  root: string,
  host: DocsHost,
  write: (line: string) => void = (line) => void process.stdout.write(line + "\n"),
  writeError: (line: string) => void = (line) => void process.stderr.write(line + "\n"),
  writeBaseline = false,
): number {
  const fail = (line: string): void => {
    writeError(line);
  };

  const listed = host.spawn("git", ["ls-files", "-z"], { cwd: root, stdio: "pipe" });
  if (listed.status !== 0 || typeof listed.stdout !== "string") {
    return stop("error IO_READ: git ls-files could not be read", fail, 3);
  }
  const tracked = listed.stdout.split("\0").filter((path) => path !== "");

  const baselineText = host.readFile(join(root, BASELINE_PATH));
  const baseline = parseBaseline(baselineText);
  if (baseline === null) {
    return stop(`error IO_READ: ${BASELINE_PATH} is ${baselineText === null ? "absent" : "not JSON"}`, fail, 3);
  }

  const { measured, missing } = measuredFiles(host, root, tracked);
  if (missing !== null) return stop(`error IO_READ: ${missing} could not be read`, fail, 3);
  const totals = totalsOf(measured);
  if (writeBaseline) {
    const surface = surfaceErrors(tracked);
    if (surface.length > 0) return refuse(surface, fail);
    return writeLowered(root, host, measured, baseline, totals, write, fail);
  }

  const errors = [...surfaceErrors(tracked), ...capErrors(measured, baseline, totals)];
  if (errors.length > 0) return refuse(errors, fail);
  write(`## docs: ${ALLOWLIST.length} files, ${totals.words} words, ${totals.lines} lines in docs/`);
  return 0;
}

function main(args: string[]): number {
  if (args.some((arg) => arg !== "--write-baseline")) {
    process.stderr.write(`error USAGE: ${USAGE}\n`);
    return 1;
  }
  const host: DocsHost = {
    ...defaultHost(),
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    writeFile: (path, text) => {
      try {
        writeFileSync(path, text);
        return true;
      } catch {
        return false;
      }
    },
  };
  return checkDocs(process.cwd(), host, undefined, undefined, args.includes("--write-baseline"));
}

if (isEntry(import.meta)) {
  process.exit(main(process.argv.slice(2)));
}
