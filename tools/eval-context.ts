// tools/eval-context.ts
//
// The context one unattended eval run ran in, recorded as context.json beside its
// transcript (prose design 2026-10-14 §5.3). The window and the compactions are
// the verification basis of a run: the CLI gives a gateway model it does not know
// a 200k window, and 13 of the capped round's 16 runs compacted near 167k on
// 2026-10-13. So the record keeps the two window settings the run was given, the
// probe's window line verbatim, the count of compact_boundary lines, and the peak
// context over the top-level assistant lines (input plus cache read plus cache
// creation; a subagent's lines carry its own context and are left out). Beside
// the count of top-level assistant lines it keeps assistant_lines_without_usage,
// those of them whose message.usage is not an object or lacks one of the three
// figures as a number: the compaction count and the peak are inferred from what
// the stream carries, so a stream whose lines lost their usage would read as
// uncompacted with a low peak, and the judging's context gate reads this count
// and closes on any line without usage, as it does on no assistant line. The init
// line's isolation facts follow (the CLI version, every plugin with its source,
// the namespaced and the unnamespaced skills, and whether the auto memory lies
// under the run's CLAUDE_CONFIG_DIR, in resolved form or under its real path),
// with two counts, the transcript lines naming CLAUDE.md and those naming
// ~/.claude, a secondary leak check that is reported, never gated.
//
// From invocations.json (tools/eval-invocations.ts) come the denied calls, split
// on whether the command holds the word bun, and, for each lint id asked for,
// the number of validate.ts calls whose full result carries the rule: that shows
// whether a warning fired during the run, while validate.json, which says whether
// the final document still carries it, shows the end state only. validate.ts
// prints its lints on exit 2 as well, so a call that errored counts beside one
// that ran; the 400-character result_head of invocations.json is too short, so
// the results are read from the transcript. A missing invocations.json leaves
// each lint's fired count null rather than 0, while the denials read 0 beside
// invocations "missing", which every reader prints as missing; a missing
// validate.json leaves each lint's final state null.
//
// Last comes final_message, whether the run's final message is complete (prose
// design §8.1, amended 2026-10-15 at the stage-1 gate): p5/high/run2 of the
// stage-1 round ended mid-word with stop reason end_turn and no error, and no
// usage figure could show it, so the message itself is read. It is the result
// string of transcript.json, the file the judge reads it from; a missing or
// unreadable transcript.json, or one with no result string, records complete
// null with the reason and never refuses the record. The judging gate holds a
// run unverified unless complete is true, an absent field included.
//
// A line that is not JSON refuses the whole stream, and so do a missing
// transcript, a missing autocompact.txt and a probe reply with no window line: a
// run whose context cannot be read is unverified at judging, never scored.
//
// Usage: node tools/eval-context.ts <run-dir> --config-dir <path> [--lint <id>]...
// Writes <run-dir>/context.json and prints nothing; exits 0 on success, 1 on a
// usage error, 3 when the transcript or the probe reply cannot be read, the
// transcript holds a line that is not JSON, or the reply has no window line.
//
// tools/ imports nothing from skills/fmea-software/scripts/ (the skill stays
// self-contained); the transcript reader is tools/lib/transcript.ts.

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { blocksOf, parseLine, refuse, resultText, type Message } from "./lib/transcript.ts";

export interface EvalContext {
  config_dir: string;
  cli_version: string | null;
  settings: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: string | null; CLAUDE_CODE_MAX_CONTEXT_TOKENS: string | null };
  window_line: string;
  compactions: number;
  peak_context_tokens: number;
  assistant_lines: number;
  assistant_lines_without_usage: number;
  init: {
    present: boolean;
    plugins: { name: string; source: string }[];
    skills_namespaced: string[];
    skills_unnamespaced: string[];
    memory_auto: string | null;
    memory_under_config_dir: boolean;
  };
  leak_grep: { "CLAUDE.md": number; "~/.claude": number };
  invocations: "present" | "missing";
  denied: { bun: number; other: number };
  lints: { id: string; fired: number | null; final: boolean | null }[];
  /**
   * Whether the final message is complete (§8.1). `reason` names the first clause that fails, null when it is
   * complete; `length` is the message's length with trailing whitespace trimmed. `complete` and `length` are null when
   * transcript.json cannot give the message, and `reason` then says why.
   */
  final_message: { complete: boolean | null; reason: string | null; length: number | null };
}

export interface TranscriptFacts {
  cli_version: string | null;
  compactions: number;
  peak_context_tokens: number;
  assistant_lines: number;
  assistant_lines_without_usage: number;
  init: EvalContext["init"];
  leak_grep: EvalContext["leak_grep"];
  lint_fired: Record<string, number>;
}

const WINDOW_TEXT = "auto-compact window for";
const USAGE = "usage: node tools/eval-context.ts <run-dir> --config-dir <path> [--lint <id>]...";

/** value[key] when value is an object, else undefined. */
function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** What one pass over the stream collects. */
interface Scan {
  init: Message | null;
  compactions: number;
  peak: number;
  assistantLines: number;
  assistantLinesWithoutUsage: number;
  leaks: EvalContext["leak_grep"];
  /** The first result text of each wanted tool_use id. */
  results: Map<string, string>;
}

/** The three usage figures whose sum is a line's context. */
const USAGE_FIELDS = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];

/** The sum of the three usage figures; a figure that is missing or not a number counts 0. */
function contextTokens(usage: unknown): number {
  return USAGE_FIELDS.reduce((sum, key) => {
    const n = fieldOf(usage, key);
    return sum + (typeof n === "number" ? n : 0);
  }, 0);
}

/** Whether a usage is an object carrying all three figures as numbers. */
function hasUsage(usage: unknown): boolean {
  return typeof usage === "object" && usage !== null && USAGE_FIELDS.every((key) => typeof fieldOf(usage, key) === "number");
}

function recordSystem(scan: Scan, m: Message): void {
  if (m.subtype === "init" && scan.init === null) scan.init = m;
  if (m.subtype === "compact_boundary") scan.compactions++;
}

/** A top-level assistant line counts toward the peak, and apart when it lacks its usage; a subagent's line names the tool call it serves. */
function recordAssistant(scan: Scan, m: Message): void {
  if (m.parent_tool_use_id !== null && m.parent_tool_use_id !== undefined) return;
  const usage = m.message?.usage;
  scan.assistantLines++;
  if (!hasUsage(usage)) scan.assistantLinesWithoutUsage++;
  scan.peak = Math.max(scan.peak, contextTokens(usage));
}

function recordResults(scan: Scan, m: Message, wanted: Set<string>): void {
  for (const b of blocksOf(m)) {
    const id = b.tool_use_id;
    if (b.type === "tool_result" && typeof id === "string" && wanted.has(id) && !scan.results.has(id)) scan.results.set(id, resultText(b.content));
  }
}

function scanLine(scan: Scan, line: string, n: number, wanted: Set<string>): void {
  const m = parseLine(line, n);
  if (line.includes("CLAUDE.md")) scan.leaks["CLAUDE.md"]++;
  if (line.includes("~/.claude")) scan.leaks["~/.claude"]++;
  if (m?.type === "system") recordSystem(scan, m);
  if (m?.type === "assistant") recordAssistant(scan, m);
  if (m?.type === "user") recordResults(scan, m, wanted);
}

function versionOf(init: Message | null): string | null {
  const version = init?.claude_code_version;
  return typeof version === "string" ? version : null;
}

function pluginOf(p: unknown): { name: string; source: string } {
  return { name: textOf(fieldOf(p, "name")), source: textOf(fieldOf(p, "source")) };
}

/** The forms the config dir may take in the memory path: resolved, and its real path when it exists on disk. */
function configRootsOf(configDir: string): string[] {
  const roots = [resolve(configDir)];
  try {
    roots.push(realpathSync(configDir));
  } catch {
    // A config dir that is not on disk has no real path; the resolved form stands alone.
  }
  return roots;
}

/** Whether a path lies under one of the roots, compared in resolved form, so a trailing slash or a // reads the same. */
function isUnder(path: string, roots: string[]): boolean {
  const resolved = resolve(path);
  return roots.some((root) => resolved.startsWith(root.endsWith(sep) ? root : root + sep));
}

function initOf(m: Message | null, configDir: string): EvalContext["init"] {
  if (m === null) return { present: false, plugins: [], skills_namespaced: [], skills_unnamespaced: [], memory_auto: null, memory_under_config_dir: false };
  const skills = Array.isArray(m.skills) ? m.skills.filter((s): s is string => typeof s === "string") : [];
  const auto = fieldOf(m.memory_paths, "auto");
  const memoryAuto = typeof auto === "string" ? auto : null;
  return {
    present: true,
    plugins: Array.isArray(m.plugins) ? m.plugins.map(pluginOf) : [],
    skills_namespaced: skills.filter((s) => s.includes(":")),
    skills_unnamespaced: skills.filter((s) => !s.includes(":")).sort(),
    memory_auto: memoryAuto,
    memory_under_config_dir: memoryAuto !== null && isUnder(memoryAuto, configRootsOf(configDir)),
  };
}

/** How many of the collected results carry the rule, as validate.ts prints a lint. */
function firedCount(results: Map<string, string>, id: string): number {
  const needle = `"rule": "${id}"`;
  return [...results.values()].filter((text) => text.includes(needle)).length;
}

/** The facts the transcript alone gives, in one pass. Throws on a line that is not JSON. */
export function extractContext(text: string, options: { configDir: string; lintIds: string[]; validateCallIds: string[] }): TranscriptFacts {
  const scan: Scan = { init: null, compactions: 0, peak: 0, assistantLines: 0, assistantLinesWithoutUsage: 0, leaks: { "CLAUDE.md": 0, "~/.claude": 0 }, results: new Map() };
  const wanted = new Set(options.validateCallIds);
  text.split("\n").forEach((line, i) => scanLine(scan, line, i + 1, wanted));
  return {
    cli_version: versionOf(scan.init),
    compactions: scan.compactions,
    peak_context_tokens: scan.peak,
    assistant_lines: scan.assistantLines,
    assistant_lines_without_usage: scan.assistantLinesWithoutUsage,
    init: initOf(scan.init, options.configDir),
    leak_grep: scan.leaks,
    lint_fired: Object.fromEntries(options.lintIds.map((id) => [id, firedCount(scan.results, id)])),
  };
}

/** A file the record cannot do without. */
function readRequired(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${path}: ${String(err)}`);
  }
}

/** An optional file's JSON value, or undefined when it is missing or does not parse. */
function readOptionalJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** The first line of the probe's reply naming the auto-compact window, verbatim. */
function windowLineOf(path: string): string {
  const line = readRequired(path)
    .split("\n")
    .find((l) => l.toLowerCase().includes(WINDOW_TEXT));
  if (line === undefined) throw new Error(`${path} holds no line containing "${WINDOW_TEXT}"`);
  return line;
}

interface CallRecord {
  tool_use_id?: unknown;
  scripts?: unknown;
  command?: unknown;
  outcome?: unknown;
}

/** The calls invocations.json lists, or null when it is missing, does not parse, or holds no calls array. */
function callsOf(path: string): CallRecord[] | null {
  const calls = fieldOf(readOptionalJson(path), "calls");
  return Array.isArray(calls) ? calls.filter((c): c is CallRecord => typeof c === "object" && c !== null) : null;
}

/** The validate.ts calls whose result says what the validator found: those that ran or errored. */
function validateCallIdsOf(calls: CallRecord[]): string[] {
  return calls
    .filter((c) => Array.isArray(c.scripts) && c.scripts.includes("validate.ts") && (c.outcome === "ran" || c.outcome === "error"))
    .map((c) => c.tool_use_id)
    .filter((id): id is string => typeof id === "string");
}

function deniedOf(calls: CallRecord[]): EvalContext["denied"] {
  const denied = calls.filter((c) => c.outcome === "denied");
  const bun = denied.filter((c) => typeof c.command === "string" && /\bbun\b/.test(c.command)).length;
  return { bun, other: denied.length - bun };
}

/** The lints validate.json lists, or null when it is missing, does not parse, or holds no lints array. */
function finalLintsOf(path: string): unknown[] | null {
  const lints = fieldOf(readOptionalJson(path), "lints");
  return Array.isArray(lints) ? lints : null;
}

/** Each lint id's count over the run, null without invocations.json, and its end state, null without validate.json. */
function lintsOf(lintIds: string[], fired: Record<string, number>, calls: CallRecord[] | null, finals: unknown[] | null): EvalContext["lints"] {
  return lintIds.map((id) => ({
    id,
    fired: calls === null ? null : fired[id],
    final: finals === null ? null : finals.some((l) => fieldOf(l, "rule") === id),
  }));
}

type FinalMessage = EvalContext["final_message"];

/** The characters a complete final message may end with (§8.1). */
const FINAL_ENDINGS = new Set([".", "!", "?", ":", "|", ")", "]", '"', "'", "`", "*"]);

/**
 * The final message's completeness by the predicate of prose design §8.1, dated 2026-10-15: "the message in
 * `transcript.json`'s `result`, trailing whitespace trimmed, is complete when it is non-empty, ends with one of `.`,
 * `!`, `?`, `:`, `|`, `)`, `]`, `"`, `'`, `` ` `` or `*`, or with a line that is a closing code fence, and opens no
 * code fence it does not close." A closing fence line is three or more backticks and nothing else, so it ends in a
 * backtick and the set covers that clause. A fence line is one that starts with three or more backticks, and an odd
 * count of them leaves one open. The reason names the first clause that fails, in words a note can print.
 */
function finalMessageOf(result: string): FinalMessage {
  const text = result.trimEnd();
  const length = text.length;
  if (text === "") return { complete: false, reason: "empty", length };
  // The last character, whole when it lies outside the Basic Multilingual Plane.
  const last = Array.from(text.slice(-2)).pop() ?? "";
  if (!FINAL_ENDINGS.has(last)) return { complete: false, reason: `ends with ${JSON.stringify(last)}`, length };
  const fences = text.split("\n").filter((line) => line.startsWith("```")).length;
  if (fences % 2 !== 0) return { complete: false, reason: "unclosed code fence", length };
  return { complete: true, reason: null, length };
}

/** A final message transcript.json could not give, with why. */
function unchecked(reason: string): FinalMessage {
  return { complete: null, reason, length: null };
}

/** The completeness of the result string transcript.json holds; complete null with the reason when the file cannot give one. */
function finalMessageIn(path: string): FinalMessage {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return unchecked(fieldOf(err, "code") === "ENOENT" ? "transcript.json missing" : "transcript.json unreadable");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return unchecked("transcript.json is not JSON");
  }
  const result = fieldOf(value, "result");
  return typeof result === "string" ? finalMessageOf(result) : unchecked("transcript.json result is not a string");
}

/** The run's context record, or an Error naming the file that cannot be read. Never writes. */
export function contextFor(runDir: string, options: { configDir: string; lintIds: string[]; env: Record<string, string | undefined> }): EvalContext {
  const transcript = join(runDir, "transcript.jsonl");
  const text = readRequired(transcript);
  const windowLine = windowLineOf(join(runDir, "autocompact.txt"));
  const calls = callsOf(join(runDir, "invocations.json"));
  let facts: TranscriptFacts;
  try {
    facts = extractContext(text, { configDir: options.configDir, lintIds: options.lintIds, validateCallIds: validateCallIdsOf(calls ?? []) });
  } catch (err) {
    throw new Error(`${transcript} ${(err as Error).message}`);
  }
  return {
    config_dir: options.configDir,
    cli_version: facts.cli_version,
    settings: {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: options.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? null,
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: options.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS ?? null,
    },
    window_line: windowLine,
    compactions: facts.compactions,
    peak_context_tokens: facts.peak_context_tokens,
    assistant_lines: facts.assistant_lines,
    assistant_lines_without_usage: facts.assistant_lines_without_usage,
    init: facts.init,
    leak_grep: facts.leak_grep,
    invocations: calls === null ? "missing" : "present",
    denied: deniedOf(calls ?? []),
    lints: lintsOf(options.lintIds, facts.lint_fired, calls, finalLintsOf(join(runDir, "validate.json"))),
    final_message: finalMessageIn(join(runDir, "transcript.json")),
  };
}

interface Args {
  runDir: string;
  configDir: string;
  lintIds: string[];
}

/** The arguments, or null when they do not fit the usage line. */
function parseArgs(argv: string[]): Args | null {
  const positional: string[] = [];
  const values: Record<"--config-dir" | "--lint", string[]> = { "--config-dir": [], "--lint": [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg !== "--config-dir" && arg !== "--lint") {
      if (arg.startsWith("--")) return null;
      positional.push(arg);
      continue;
    }
    if (value === undefined || value === "" || value.startsWith("--")) return null;
    values[arg].push(value);
    i++;
  }
  const [configDir, ...extra] = values["--config-dir"];
  if (positional.length !== 1 || configDir === undefined || extra.length > 0) return null;
  return { runDir: positional[0], configDir, lintIds: values["--lint"] };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return refuse("USAGE", USAGE);
  let context: EvalContext;
  try {
    context = contextFor(args.runDir, { configDir: args.configDir, lintIds: args.lintIds, env: process.env });
  } catch (err) {
    return refuse("IO_READ", (err as Error).message);
  }
  writeFileSync(join(args.runDir, "context.json"), JSON.stringify(context, null, 2) + "\n");
  return 0;
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
