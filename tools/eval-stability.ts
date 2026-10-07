// tools/eval-stability.ts
//
// Run-to-run stability between two unattended eval runs of the same prompt on
// the same model (spec §10). AI-generated FMEAs are known to drift between runs
// (the WS8 guardrails), so the evals require two runs to agree on the set of
// element ids and on the distribution of priority values.
//
// The set is `elements[].id`, not `elements[].name`: the name is free text and
// two runs of one prompt word it differently ("Payment gateway" against
// "Payment Gateway (Stripe)") while analysing the same element, whereas the id
// is the element's structural identity — the schema calls it stable across
// versions and compares it byte-for-byte in update mode. Measured on names,
// five of the eight (prompt, model) pairs failed the 0.8 floor on wording
// alone; measured on ids, every pair cleared it.
//
// Usage: node tools/eval-stability.ts <run1.json> <run2.json> [--table-file path]
// Prints the Stability JSON to stdout and exits 0 whenever both files load.
//
// tools/ imports nothing from skills/fmea-software/scripts/ (the skill stays
// self-contained), so the document type below is a structural subset of the
// skill's FmeaDocument: only the fields this check reads.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";

export interface FmeaDocument {
  elements: { id: string; kind?: string; boundary?: string }[];
  chains: { priority: { value: string } }[];
}

/** How far two runs typed their shared elements alike: same kind and same boundary. */
export interface Typing {
  shared: number;
  agreeing: number;
  pass: boolean;
}

export interface Stability {
  jaccard: number;
  maxRows: number;
  countDiffs: Record<string, number>;
  bound: number;
  pass: boolean;
  typing: Typing;
}

/** Minimum Jaccard similarity of the two runs' element id sets (§10). */
export const JACCARD_MIN = 0.8;
/** Per-value count difference bound is COUNT_BOUND_FRACTION × max(chain rows) (§10). */
export const COUNT_BOUND_FRACTION = 0.2;

export const SHIPPED_TABLE_PATH = join(
  import.meta.dirname,
  "..",
  "skills",
  "fmea-software",
  "data",
  "priority-fmea-software-v1.json",
);

/**
 * elements[].id after trimming and case-folding, as a set. The schema's grammar
 * already makes an id lowercase kebab-case, but these documents are unvalidated
 * run output, so the normalisation is applied rather than assumed.
 */
export function elementIdSet(doc: FmeaDocument): Set<string> {
  return new Set(doc.elements.map((e) => e.id.trim().toLowerCase()));
}

/** |a ∩ b| / |a ∪ b|; 1 when both sets are empty (two empty runs agree). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

/** How many chains carry each vocabulary value as priority.value; other values are ignored. */
export function priorityCounts(doc: FmeaDocument, vocabulary: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of vocabulary) counts[v] = 0;
  for (const chain of doc.chains) {
    const v = chain.priority?.value;
    if (typeof v === "string" && Object.hasOwn(counts, v)) counts[v]++;
  }
  return counts;
}

/** elements[] keyed by trimmed, lower-cased id, as elementIdSet matches them. */
function elementsById(doc: FmeaDocument): Map<string, FmeaDocument["elements"][number]> {
  return new Map(doc.elements.map((e) => [e.id.trim().toLowerCase(), e]));
}

/**
 * Of the ids both runs carry, how many have the same kind and boundary in both.
 * An element lacking either field in either run does not agree. With nothing
 * shared the runs have agreed on nothing, so pass fails closed (s9).
 */
export function typing(run1: FmeaDocument, run2: FmeaDocument): Typing {
  const second = elementsById(run2);
  let shared = 0;
  let agreeing = 0;
  for (const [id, a] of elementsById(run1)) {
    const b = second.get(id);
    if (b === undefined) continue;
    shared++;
    if (a.kind !== undefined && a.boundary !== undefined && a.kind === b.kind && a.boundary === b.boundary) agreeing++;
  }
  return { shared, agreeing, pass: shared > 0 && agreeing === shared };
}

export function stability(run1: FmeaDocument, run2: FmeaDocument, vocabulary: string[]): Stability {
  const j = jaccard(elementIdSet(run1), elementIdSet(run2));
  const maxRows = Math.max(run1.chains.length, run2.chains.length);
  // The bound is the exported constant times the row count, so a change to
  // COUNT_BOUND_FRACTION at the acceptance gate takes effect here rather than
  // leaving a hidden literal. countDiffs are integers, and maxRows * 0.2 is exact
  // at every multiple of 5, the only row counts whose bound an integer difference
  // can equal, so pass/fail never turns on a rounding artefact; for other row
  // counts the reported bound may carry float noise (7 rows gives
  // 1.4000000000000001), which eval-report.ts prints to three decimals.
  const bound = maxRows * COUNT_BOUND_FRACTION;
  const c1 = priorityCounts(run1, vocabulary);
  const c2 = priorityCounts(run2, vocabulary);
  const countDiffs: Record<string, number> = {};
  for (const v of vocabulary) countDiffs[v] = Math.abs(c1[v] - c2[v]);
  const pass = j >= JACCARD_MIN && Object.values(countDiffs).every((d) => d <= bound);
  return { jaccard: j, maxRows, countDiffs, bound, pass, typing: typing(run1, run2) };
}

function fail(code: "USAGE" | "IO_READ", message: string, status: 1 | 3): never {
  // Runs of whitespace collapse to one space, the same transformation formatError
  // applies in skills/fmea-software/scripts/lib/codes.ts, so a failure is one line
  // (§9) even when the message quotes a V8 parse error that embeds the file's text.
  process.stderr.write(`error ${code}: ${message.replace(/\s+/g, " ").trim()}\n`);
  process.exit(status);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return fail("IO_READ", `cannot read ${path}: ${String(err)}`, 3);
  }
}

/** Why elements[i] is unusable (id not a string, kind or boundary present but not a string), or null. */
function elementProblem(e: unknown, i: number): string | null {
  if (typeof e !== "object" || e === null || typeof (e as { id?: unknown }).id !== "string") {
    return `has an elements[${i}] that is not an object with a string id`;
  }
  for (const field of ["kind", "boundary"] as const) {
    const value = (e as Record<string, unknown>)[field];
    if (value !== undefined && typeof value !== "string") return `has an elements[${i}] whose ${field} is not a string`;
  }
  return null;
}

/**
 * Why the parsed value is not a usable document, phrased to finish the sentence
 * `<path> …`, or null when it is one. Both files are unvalidated model output, so
 * every field the check later dereferences — elements[].id, and each chains
 * entry — is proved here: an uncaught TypeError would print a stack trace instead
 * of the one coded line the error contract requires (§9).
 */
function documentProblem(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return "has no elements[] and chains[]";
  const d = v as { elements?: unknown; chains?: unknown };
  if (!Array.isArray(d.elements) || !Array.isArray(d.chains)) return "has no elements[] and chains[]";
  for (let i = 0; i < d.elements.length; i++) {
    const problem = elementProblem(d.elements[i], i);
    if (problem !== null) return problem;
  }
  for (let i = 0; i < d.chains.length; i++) {
    const c = d.chains[i];
    if (typeof c !== "object" || c === null) return `has a chains[${i}] that is not an object`;
  }
  return null;
}

/** The parsed file as a document, or one coded I/O failure naming the malformed entry. */
function asDocument(path: string, v: unknown): FmeaDocument {
  const problem = documentProblem(v);
  if (problem !== null) fail("IO_READ", `${path} ${problem}`, 3);
  return v as FmeaDocument;
}

function main(argv: string[]): number {
  const positional: string[] = [];
  let tableFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--table-file") {
      tableFile = argv[++i];
      if (tableFile === undefined) fail("USAGE", "--table-file needs a path", 1);
    } else if (argv[i].startsWith("--")) {
      fail("USAGE", `unknown flag ${argv[i]}`, 1);
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 2) {
    fail("USAGE", "usage: node tools/eval-stability.ts <run1.json> <run2.json> [--table-file path]", 1);
  }
  const raw1 = readJson(positional[0]);
  const raw2 = readJson(positional[1]);
  const run1 = asDocument(positional[0], raw1);
  const run2 = asDocument(positional[1], raw2);
  const tablePath = tableFile ?? SHIPPED_TABLE_PATH;
  const table = readJson(tablePath);
  // The table file is unvalidated input too: JSON that is null or a scalar has no
  // property to read, so its shape is proved before `vocabulary` is touched.
  const vocabulary =
    typeof table === "object" && table !== null ? (table as { vocabulary?: unknown }).vocabulary : undefined;
  if (!Array.isArray(vocabulary) || vocabulary.some((v) => typeof v !== "string")) {
    fail("IO_READ", `${tablePath} has no vocabulary[] of strings`, 3);
  }
  process.stdout.write(JSON.stringify(stability(run1, run2, vocabulary as string[]), null, 2) + "\n");
  return 0;
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
