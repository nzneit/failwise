// tools/eval-invocations.ts
//
// The skill's script calls in one unattended eval run, extracted from the run's
// message stream for the judge (spec §10). The rubric scores c6 and c8 on
// whether the run invoked priority.ts and render.ts, and the only record of that
// is the Bash tool_use blocks in transcript.jsonl. That file is large (3 to 18 MB
// in the flow-model round), and a grep for the script names returned 0.29 to
// 0.44 MB per run in the multi-codebase round and 0.56 to 1.45 MB in the
// flow-model round, almost all of it file reads and thinking that merely mention
// a script, on lines up to 220k characters long. The calls themselves are a few KB.
//
// Each Bash call whose command names one of the skill's entry scripts is listed
// with its line in transcript.jsonl, its command, and its outcome: `ran`,
// `error` (the result is an error the permission check did not cause),
// `denied` (a permission_denied event names the call, so it never ran), or
// `no_result` (the stream holds no result for it). The judge decides whether a
// command runs a script or only reads it (cat, sed); the outcome says whether it
// ran at all, so a denied call is never taken for an invocation.
//
// A line that is not JSON refuses the whole stream: a damaged record is
// unverified, never read as "no calls". An empty list of script names refuses
// the same way, so a moved scripts folder cannot make every run look as though
// it invoked nothing.
//
// Usage: node tools/eval-invocations.ts <run-dir>
// Writes <run-dir>/invocations.json and prints nothing; exits 0 on success, 1 on
// a usage error, 3 when the transcript or the scripts folder cannot be read.
//
// tools/ imports nothing from skills/fmea-software/scripts/ (the skill stays
// self-contained); the script names are read from that folder's listing.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { blocksOf, parseLine, refuse, resultText, type Block, type Message } from "./lib/transcript.ts";

export type Outcome = "ran" | "error" | "denied" | "no_result";

export interface Invocation {
  /** 1-based line of the tool_use block in transcript.jsonl, for citing. */
  line: number;
  tool_use_id: string;
  /** The entry scripts the command names, in the order of Invocations.scripts. */
  scripts: string[];
  command: string;
  outcome: Outcome;
  /** The first RESULT_HEAD_CHARS characters of the call's result text; empty for no_result. */
  result_head: string;
}

export interface Invocations {
  /** The script names searched for. */
  scripts: string[];
  calls: Invocation[];
}

export const RESULT_HEAD_CHARS = 400;

export const SKILL_SCRIPTS_DIR = join(import.meta.dirname, "..", "skills", "fmea-software", "scripts");

/** The folder's top-level .ts files, tests left out, sorted: the skill's entry scripts and helpers. */
export function entryScripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
    .map((e) => e.name)
    .sort();
}

/** A pattern matching the file name as a whole token: `$S/priority.ts` matches, `my-priority.ts` does not. */
function namePattern(name: string): RegExp {
  return new RegExp(`(?<![\\w.-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`);
}

interface Pending {
  line: number;
  tool_use_id: string;
  scripts: string[];
  command: string;
}

interface Pattern {
  name: string;
  re: RegExp;
}

/** What one pass over the stream collects: the calls, their results, and the ids the permission check denied. */
interface Scan {
  calls: Map<string, Pending>;
  results: Map<string, { id: string; isError: boolean; text: string }>;
  denied: Set<string>;
}

/** The call a block makes when it is a Bash tool_use whose command names one of the scripts, or null. */
function callOf(b: Block, line: number, patterns: Pattern[]): Pending | null {
  if (b.type !== "tool_use" || b.name !== "Bash" || typeof b.id !== "string") return null;
  const command = (b.input as { command?: unknown } | undefined)?.command;
  if (typeof command !== "string") return null;
  const named = patterns.filter((p) => p.re.test(command)).map((p) => p.name);
  return named.length > 0 ? { line, tool_use_id: b.id, scripts: named, command } : null;
}

/** The result a block carries when it is a tool_result, or null. */
function resultOf(b: Block): { id: string; isError: boolean; text: string } | null {
  if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") return null;
  return { id: b.tool_use_id, isError: b.is_error === true, text: resultText(b.content) };
}

/** Records the first call and the first result seen for each tool_use id, and every denial. */
function record(scan: Scan, m: Message, line: number, patterns: Pattern[]): void {
  if (m.type === "system" && m.subtype === "permission_denied" && typeof m.tool_use_id === "string") scan.denied.add(m.tool_use_id);
  for (const b of blocksOf(m)) {
    const call = m.type === "assistant" ? callOf(b, line, patterns) : null;
    if (call !== null && !scan.calls.has(call.tool_use_id)) scan.calls.set(call.tool_use_id, call);
    const result = m.type === "user" ? resultOf(b) : null;
    if (result !== null && !scan.results.has(result.id)) scan.results.set(result.id, result);
  }
}

function outcomeOf(scan: Scan, id: string): Outcome {
  if (scan.denied.has(id)) return "denied";
  const r = scan.results.get(id);
  if (r === undefined) return "no_result";
  return r.isError ? "error" : "ran";
}

/** The Bash calls in the stream that name one of the scripts, each with its outcome. Throws on a line that is not JSON. */
export function extractInvocations(text: string, scripts: string[]): Invocations {
  if (scripts.length === 0) throw new Error("no script names to look for");
  const patterns = scripts.map((name) => ({ name, re: namePattern(name) }));
  const scan: Scan = { calls: new Map(), results: new Map(), denied: new Set() };
  text.split("\n").forEach((line, i) => {
    const m = parseLine(line, i + 1);
    if (m !== null) record(scan, m, i + 1, patterns);
  });
  const calls = [...scan.calls.values()].map((c) => ({
    ...c,
    outcome: outcomeOf(scan, c.tool_use_id),
    result_head: (scan.results.get(c.tool_use_id)?.text ?? "").slice(0, RESULT_HEAD_CHARS),
  }));
  return { scripts, calls };
}

/** The run's invocations, or the reason they cannot be extracted. Never writes. */
function invocationsFor(runDir: string): Invocations {
  const transcript = join(runDir, "transcript.jsonl");
  let text: string;
  try {
    text = readFileSync(transcript, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${transcript}: ${String(err)}`);
  }
  let scripts: string[];
  try {
    scripts = entryScripts(SKILL_SCRIPTS_DIR);
  } catch (err) {
    throw new Error(`cannot list ${SKILL_SCRIPTS_DIR}: ${String(err)}`);
  }
  if (scripts.length === 0) throw new Error(`${SKILL_SCRIPTS_DIR} holds no entry script`);
  try {
    return extractInvocations(text, scripts);
  } catch (err) {
    throw new Error(`${transcript} ${(err as Error).message}`);
  }
}

function main(argv: string[]): number {
  if (argv.length !== 1 || argv[0].startsWith("--")) return refuse("USAGE", "usage: node tools/eval-invocations.ts <run-dir>");
  let invocations: Invocations;
  try {
    invocations = invocationsFor(argv[0]);
  } catch (err) {
    return refuse("IO_READ", (err as Error).message);
  }
  writeFileSync(join(argv[0], "invocations.json"), JSON.stringify(invocations, null, 2) + "\n");
  return 0;
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
