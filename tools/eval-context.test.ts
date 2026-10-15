import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { contextFor, extractContext, type EvalContext } from "./eval-context.ts";

const LINTS = ["edge-reliability-unstated", "conversion-substitution-unrecorded"];
const OPTIONS = { configDir: "/tmp/cfg", lintIds: LINTS, validateCallIds: [] as string[] };
const SMALL = { input: 22361, cacheRead: 0, cacheCreation: 0 };
const WINDOW_LINE = "Auto-compact window for x: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)";

// Stream-json lines with the fields the 0.7.0 transcripts carry, as `claude -p
// --output-format stream-json --verbose` writes them: the init line, an
// assistant turn with its usage, a compaction, and a user line holding one
// tool result.
function initLine(plugins: { name: string; source: string }[], skills: string[], memoryAuto: string, version = "2.1.296"): string {
  const listed = plugins.map((p) => ({ ...p, path: p.source.endsWith("@builtin") ? "builtin" : `/plugins/${p.name}` }));
  return JSON.stringify({ type: "system", subtype: "init", cwd: "/tmp/w", skills, plugins: listed, claude_code_version: version, memory_paths: { auto: memoryAuto } });
}

function assistantLine(usage: { input: number; cacheRead: number; cacheCreation: number }, parentToolUseId?: string, block?: unknown): string {
  const counted = { input_tokens: usage.input, cache_creation_input_tokens: usage.cacheCreation, cache_read_input_tokens: usage.cacheRead, output_tokens: 0 };
  const message = { role: "assistant", content: block === undefined ? [] : [block], usage: counted };
  return JSON.stringify({ type: "assistant", message, parent_tool_use_id: parentToolUseId ?? null });
}

function compactLine(): string {
  return JSON.stringify({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 170039, post_tokens: 22340 } });
}

function toolResultLine(id: string, text: string, isError = false): string {
  const content = [{ tool_use_id: id, type: "tool_result", content: text, is_error: isError }];
  return JSON.stringify({ type: "user", message: { role: "user", content }, parent_tool_use_id: null });
}

/** A temporary run directory holding the given files; the caller removes it. */
function runDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-context-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

/** What validate.ts prints and writes to validate.json: its report, indented by two spaces. */
function validateReport(ok: boolean, rules: string[]): string {
  const lints = rules.map((rule, i) => ({ rule, severity: "warning", pointer: `/chains/${i}/ratings/S`, message: "The rating is still provisional and needs re-scoring" }));
  return JSON.stringify({ ok, errors: ok ? [] : [{ rule: "schema", pointer: "/chains/0" }], lints, quality_score: 100 }, null, 2);
}

test("compactions counts compact_boundary system lines: 0 without, 2 with", () => {
  const init = initLine([], [], "/tmp/cfg/projects/x/memory/");
  const turn = assistantLine(SMALL);
  assert.equal(extractContext([init, turn].join("\n"), OPTIONS).compactions, 0);
  assert.equal(extractContext([init, turn, compactLine(), turn, compactLine(), turn].join("\n"), OPTIONS).compactions, 2);
});

/** A top-level assistant line whose message carries the given usage, or none when it is undefined. */
function assistantLineWithUsage(usage: unknown): string {
  const message = { role: "assistant", content: [], ...(usage === undefined ? {} : { usage }) };
  return JSON.stringify({ type: "assistant", message, parent_tool_use_id: null });
}

test("peak_context_tokens is the largest input plus cache_read plus cache_creation over top-level assistant lines, a subagent line never counts, and a top-level line without the three usage figures is counted apart", () => {
  const text = [
    assistantLine(SMALL),
    assistantLine({ input: 1000, cacheRead: 200000, cacheCreation: 37429 }),
    assistantLine({ input: 900000, cacheRead: 0, cacheCreation: 0 }, "toolu_1"),
    assistantLineWithUsage(undefined),
    assistantLineWithUsage({ input_tokens: 5000, cache_read_input_tokens: 0, output_tokens: 0 }),
  ].join("\n");
  const facts = extractContext(text, OPTIONS);
  assert.equal(facts.peak_context_tokens, 238429);
  assert.equal(facts.assistant_lines, 4);
  assert.equal(facts.assistant_lines_without_usage, 2);
});

test("init records the CLI version, every plugin with its source, the namespaced and the unnamespaced skills, and whether memory_paths.auto lies under the config dir; a stream with no init line is present false", () => {
  const plugins = [
    { name: "failwise", source: "failwise@inline" },
    { name: "cc-plugin-telemetry", source: "cc-plugin-telemetry@builtin" },
  ];
  const text = [initLine(plugins, ["failwise:fmea-software", "deep-research", "design"], "/tmp/cfg/projects/x/memory/"), assistantLine(SMALL)].join("\n");
  const facts = extractContext(text, OPTIONS);
  assert.equal(facts.cli_version, "2.1.296");
  assert.deepEqual(facts.init, {
    present: true,
    plugins,
    skills_namespaced: ["failwise:fmea-software"],
    skills_unnamespaced: ["deep-research", "design"],
    memory_auto: "/tmp/cfg/projects/x/memory/",
    memory_under_config_dir: true,
  });

  // A config dir given with a trailing slash is the same directory; a sibling
  // whose name merely starts with it is not.
  assert.equal(extractContext(text, { ...OPTIONS, configDir: "/tmp/cfg/" }).init.memory_under_config_dir, true);
  assert.equal(extractContext(text, { ...OPTIONS, configDir: "/tmp/cf" }).init.memory_under_config_dir, false);

  const home = extractContext(initLine(plugins, ["design", "failwise:fmea-software", "deep-research"], "/home/u/.claude/projects/x/memory/", "2.1.299"), OPTIONS);
  assert.equal(home.cli_version, "2.1.299");
  assert.equal(home.init.memory_under_config_dir, false);
  assert.deepEqual(home.init.skills_unnamespaced, ["deep-research", "design"]);

  // A plugin entry missing a field keeps its place with an empty string, and
  // only the first init line counts.
  const odd = [JSON.stringify({ type: "system", subtype: "init", plugins: [{ name: "odd" }, "not-an-object"] }), initLine(plugins, [], "/tmp/cfg/m/")].join("\n");
  assert.deepEqual(extractContext(odd, OPTIONS).init.plugins, [
    { name: "odd", source: "" },
    { name: "", source: "" },
  ]);

  const none = extractContext(assistantLine(SMALL), OPTIONS);
  assert.equal(none.cli_version, null);
  assert.deepEqual(none.init, { present: false, plugins: [], skills_namespaced: [], skills_unnamespaced: [], memory_auto: null, memory_under_config_dir: false });
});

test("memory_under_config_dir compares resolved paths, and the config dir's real path when it exists, so a trailing slash, a // or a symlinked TMPDIR is still under it", () => {
  const text = initLine([], [], "/tmp/cfg/projects/x/memory/");
  for (const configDir of ["/tmp/cfg/", "/tmp//cfg", "/tmp/cfg//"]) {
    assert.equal(extractContext(text, { ...OPTIONS, configDir }).init.memory_under_config_dir, true, configDir);
  }

  // The CLI names the memory under the real path while the harness passes the
  // symlink it was handed as TMPDIR.
  const base = mkdtempSync(join(tmpdir(), "eval-context-link-"));
  const real = join(base, "real");
  const link = join(base, "link");
  mkdirSync(real);
  symlinkSync(real, link);
  const dir = runDir({ "transcript.jsonl": initLine([], [], `${realpathSync(real)}/projects/x/memory/`) + "\n", "autocompact.txt": `${WINDOW_LINE}\n` });
  try {
    const r = runCli([dir, "--config-dir", link]);
    assert.equal(r.status, 0, r.stderr);
    const written = JSON.parse(readFileSync(join(dir, "context.json"), "utf8")) as EvalContext;
    assert.equal(written.init.memory_under_config_dir, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("leak_grep counts the transcript lines holding CLAUDE.md and ~/.claude", () => {
  const text = [
    assistantLine(SMALL, undefined, { type: "text", text: "The user's rules in ~/.claude/CLAUDE.md apply here." }),
    assistantLine(SMALL, undefined, { type: "thinking", thinking: "CLAUDE.md says one thing, the project's CLAUDE.md another." }),
    assistantLine(SMALL, undefined, { type: "text", text: "Reading inputs/checkout-service.md next." }),
  ].join("\n");
  assert.deepEqual(extractContext(text, OPTIONS).leak_grep, { "CLAUDE.md": 2, "~/.claude": 1 });
  assert.deepEqual(extractContext(text.split("\n")[2], OPTIONS).leak_grep, { "CLAUDE.md": 0, "~/.claude": 0 });
});

test("lints fired counts the validate.ts calls whose full tool result carries the rule id, past the 400-character head", () => {
  const report = validateReport(true, ["rating-provisional", "rating-provisional", "rating-provisional", "edge-reliability-unstated"]);
  assert.ok(report.indexOf('"rule": "edge-reliability-unstated"') > 400, "the rule id lies inside the head");
  const text = [toolResultLine("toolu_a", report), toolResultLine("toolu_b", '{"ok":true,"lints":[]}'), toolResultLine("toolu_x", report)].join("\n");
  const facts = extractContext(text, { ...OPTIONS, validateCallIds: ["toolu_a", "toolu_b"] });
  assert.deepEqual(facts.lint_fired, { "edge-reliability-unstated": 1, "conversion-substitution-unrecorded": 0 });
});

test("a line that is not JSON refuses the whole stream, naming the line", () => {
  assert.throws(() => extractContext("{}\nnot json\n", OPTIONS), /line 2 is not JSON/);
  const dir = runDir({ "transcript.jsonl": "{}\nnot json\n", "autocompact.txt": `${WINDOW_LINE}\n` });
  try {
    assert.throws(() => contextFor(dir, { configDir: "/tmp/cfg", lintIds: LINTS, env: {} }), /transcript\.jsonl line 2 is not JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("contextFor assembles the file from the run directory: settings from the environment, the probe line from autocompact.txt, denials and lint counts from invocations.json over the validate.ts calls that ran or errored, final from validate.json", () => {
  const plugins = [{ name: "failwise", source: "failwise@inline" }];
  const call = (tool_use_id: string, outcome: string, command: string, scripts = ["validate.ts"]) => ({ line: 2, tool_use_id, scripts, command, outcome, result_head: "" });
  const dir = runDir({
    "transcript.jsonl":
      [
        initLine(plugins, ["failwise:fmea-software"], "/tmp/cfg/projects/x/memory/"),
        toolResultLine("toolu_a", validateReport(true, ["edge-reliability-unstated"])),
        toolResultLine("toolu_c", `Exit code 2\n${validateReport(false, ["edge-reliability-unstated"])}`, true),
        toolResultLine("toolu_p", validateReport(true, ["edge-reliability-unstated"])),
      ].join("\n") + "\n",
    "autocompact.txt": `something\n${WINDOW_LINE}\n`,
    "invocations.json": JSON.stringify({
      scripts: ["priority.ts", "validate.ts"],
      calls: [
        call("toolu_a", "ran", "node /p/validate.ts a.json"),
        call("toolu_c", "error", "node /p/validate.ts a.json"),
        call("toolu_d", "denied", "bun /p/validate.ts a.json"),
        call("toolu_e", "denied", "node /p/validate.ts a.json"),
        call("toolu_p", "ran", "node /p/priority.ts a.json --write", ["priority.ts"]),
      ],
    }),
    "validate.json": validateReport(true, ["edge-reliability-unstated"]) + "\n",
  });
  try {
    const context: EvalContext = contextFor(dir, { configDir: "/tmp/cfg", lintIds: LINTS, env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "786432" } });
    assert.deepEqual(context, {
      config_dir: "/tmp/cfg",
      cli_version: "2.1.296",
      settings: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "786432", CLAUDE_CODE_MAX_CONTEXT_TOKENS: null },
      window_line: WINDOW_LINE,
      compactions: 0,
      peak_context_tokens: 0,
      assistant_lines: 0,
      assistant_lines_without_usage: 0,
      init: {
        present: true,
        plugins,
        skills_namespaced: ["failwise:fmea-software"],
        skills_unnamespaced: [],
        memory_auto: "/tmp/cfg/projects/x/memory/",
        memory_under_config_dir: true,
      },
      leak_grep: { "CLAUDE.md": 0, "~/.claude": 0 },
      invocations: "present",
      denied: { bun: 1, other: 1 },
      lints: [
        { id: "edge-reliability-unstated", fired: 2, final: true },
        { id: "conversion-substitution-unrecorded", fired: 0, final: false },
      ],
      final_message: { complete: null, reason: "transcript.json missing", length: null },
      message_counts: { checked: false, reason: "analysis.json missing", document: {}, stated: [] },
    });
    // The fields the stage-1 gates added come last, in the order they were added, so a reader of the earlier fields is unaffected.
    assert.deepEqual(Object.keys(context).slice(-2), ["final_message", "message_counts"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** transcript.json as tools/run-eval.sh writes it: the stream's last result line, whose result is the run's final message. */
function resultFile(result: unknown): string {
  return JSON.stringify({ type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", result }, null, 2) + "\n";
}

/** The record contextFor writes for a run directory holding a stream and a probe reply beside the given files; a null file is left out. */
function recordFor(files: Record<string, string | null>): EvalContext {
  const present = Object.entries(files).filter((e): e is [string, string] => e[1] !== null);
  const dir = runDir({ "transcript.jsonl": initLine([], [], "/tmp/cfg/m/") + "\n", "autocompact.txt": `${WINDOW_LINE}\n`, ...Object.fromEntries(present) });
  try {
    return contextFor(dir, { configDir: "/tmp/cfg", lintIds: [], env: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The final_message contextFor records for a run directory holding the given transcript.json text, or none for null. */
function finalMessageFor(transcriptJson: string | null): EvalContext["final_message"] {
  return recordFor({ "transcript.json": transcriptJson }).final_message;
}

test("final_message records a final message that ends mid-word as cut, naming its last character, as p5/high/run2 of the stage-1 round ended", () => {
  const cut = "**Priorities: H for ch-1 and M, each resting on provisional ratings** *(the sh";
  assert.deepEqual(finalMessageFor(resultFile(cut)), { complete: false, reason: 'ends with "h"', length: cut.length });
  // Trailing whitespace is trimmed before the last character is read, and the
  // length is the trimmed message's.
  assert.deepEqual(finalMessageFor(resultFile("A named person re-scores each rating,\n\n  ")), { complete: false, reason: 'ends with ","', length: 37 });
  for (const end of ["-", "}", ">", "a", "9", "…"]) {
    assert.deepEqual(finalMessageFor(resultFile(`The next step${end}`)), { complete: false, reason: `ends with "${end}"`, length: 13 + end.length }, end);
  }
});

test("final_message is complete for a message ending in a full stop, a table row, a closed code fence, or any other ending §8.1 lists, trailing whitespace trimmed", () => {
  const complete = (text: string) => assert.deepEqual(finalMessageFor(resultFile(text)), { complete: true, reason: null, length: text.trimEnd().length }, text);
  complete("Every rating this run wrote is provisional.");
  complete("| Chain | Priority |\n|---|---|\n| ch-1 | H |\n| ch-2 | M |\n");
  complete("Run the validator again:\n\n```bash\nnode scripts/validate.ts analysis.json\n```\n");
  complete("Done.  \n\t\n");
  for (const end of [".", "!", "?", ":", "|", ")", "]", '"', "'", "`", "*"]) complete(`The next step${end}`);
});

test("final_message is cut for an empty message and for one that opens a code fence it does not close, the reason naming the first clause that fails", () => {
  assert.deepEqual(finalMessageFor(resultFile("")), { complete: false, reason: "empty", length: 0 });
  assert.deepEqual(finalMessageFor(resultFile(" \n\t\n")), { complete: false, reason: "empty", length: 0 });
  const open = "Run the validator again:\n\n```bash\nnode scripts/validate.ts analysis.json.";
  assert.deepEqual(finalMessageFor(resultFile(open)), { complete: false, reason: "unclosed code fence", length: open.length });
  // A last line that is a fence does not close the count: three fence lines leave one open.
  const third = "```json\n{}\n```\n\nThen:\n\n```";
  assert.deepEqual(finalMessageFor(resultFile(third)), { complete: false, reason: "unclosed code fence", length: third.length });
  // A message that both ends mid-word and leaves a fence open fails on its ending first.
  const both = "```bash\nnode scripts/validate.ts analysis.js";
  assert.deepEqual(finalMessageFor(resultFile(both)), { complete: false, reason: 'ends with "s"', length: both.length });
});

test("final_message is null with the reason when transcript.json is missing, unreadable, not JSON or holds no result string, and the record is still written", () => {
  const unchecked = (reason: string) => ({ complete: null, reason, length: null });
  assert.deepEqual(finalMessageFor(null), unchecked("transcript.json missing"));
  assert.deepEqual(finalMessageFor("{not json"), unchecked("transcript.json is not JSON"));
  assert.deepEqual(finalMessageFor("null\n"), unchecked("transcript.json result is not a string"));
  for (const result of [null, 42, ["Done."], undefined]) {
    assert.deepEqual(finalMessageFor(resultFile(result)), unchecked("transcript.json result is not a string"), String(result));
  }

  // A transcript.json that cannot be read as a file: here a directory of that name.
  const dir = runDir({ "transcript.jsonl": initLine([], [], "/tmp/cfg/m/") + "\n", "autocompact.txt": `${WINDOW_LINE}\n` });
  try {
    mkdirSync(join(dir, "transcript.json"));
    const r = runCli([dir, "--config-dir", "/tmp/cfg"]);
    assert.equal(r.status, 0, r.stderr);
    const written = JSON.parse(readFileSync(join(dir, "context.json"), "utf8")) as EvalContext;
    assert.deepEqual(written.final_message, unchecked("transcript.json unreadable"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("final_message reads the last character by code point, so an ending outside the Basic Multilingual Plane is named whole, and counts a line as a fence only when it starts with three backticks, never a fence written mid-line or indented", () => {
  const emoji = "Every rating this run wrote is provisional 🎉";
  assert.deepEqual(finalMessageFor(resultFile(emoji)), { complete: false, reason: 'ends with "🎉"', length: emoji.length });
  const afterEmoji = "Every rating this run wrote is provisional 🎉.";
  assert.deepEqual(finalMessageFor(resultFile(afterEmoji)), { complete: true, reason: null, length: afterEmoji.length });
  // Neither a fence written inside a line nor an indented one is a fence line, so this message opens no fence.
  const inline = "Run ```node scripts/validate.ts analysis.json``` again, then:\n\n    ```bash\n    node scripts/render.ts analysis.json\n\nDone.";
  assert.deepEqual(finalMessageFor(resultFile(inline)), { complete: true, reason: null, length: inline.length });
  // An indented line of backticks does not close the fence the first line opens.
  const indented = "```bash\nnode scripts/validate.ts analysis.json\n  ```\nDone.";
  assert.deepEqual(finalMessageFor(resultFile(indented)), { complete: false, reason: "unclosed code fence", length: indented.length });
});

/** A priority as priority.ts writes it, with the given value. */
function priorityOf(value: string): { value: string; table: string; rpn: number } {
  return { value, table: "priority-fmea-software-v1", rpn: 100 };
}

/** analysis.json with one chain per entry: the entry's first value is the chain's priority, its second, when given, its post_priority. */
function analysisFile(rows: string[][]): string {
  const chains = rows.map(([before, after], i) => ({ id: `ch-${i + 1}`, priority: priorityOf(before), ...(after === undefined ? {} : { post_priority: priorityOf(after) }) }));
  return JSON.stringify({ chains }, null, 2);
}

/** n chains with the same values. */
function chains(n: number, ...values: string[]): string[][] {
  return Array.from({ length: n }, () => values);
}

/** The message_counts contextFor records for a final message and a document of the given chains. */
function countsFor(message: string, rows: string[][]): EvalContext["message_counts"] {
  return recordFor({ "transcript.json": resultFile(message), "analysis.json": analysisFile(rows) }).message_counts;
}

/** A stated pair as message_counts records it. */
function pair(count: number, value: string, matches: boolean): EvalContext["message_counts"]["stated"][number] {
  return { count, value, matches };
}

// Excerpts of four final messages of round 1b (build/evals/prose-1b/, 2026-10-15), each with its count line and
// the table or list lines around it, copied here so the tests never read the round.
const P1_MEDIUM_RUN1 = `| ch-gateway-unavailable | payment-gateway / authorize | 9·8·7 | 504 | H — rests on provisional ratings |
| ch-api-submit-timeout | checkout.api / submit | 3·3·4 (S=7) | 84 | M — provisional |

The count by priority is **8 H and 6 M**, and both counts rest on provisional ratings. **8** was a typo above — to be exact: S·O·D for \`ch-api-submit-timeout\` is 7·3·4. Every priority in that table, and every RPN in it, rests on provisional ratings.`;
const P1_HIGH_RUN2 = `| \`chk-gateway-availability\` — gateway misses its SLA / rps limit | 9/5/7 | 315 | **H** (rests on provisional ratings) |

Counts by priority, all resting on provisional ratings: **5 H, 7 M, 0 L**. No priority resting on a provisional rating is final until that rating is re-scored.

Every rating this run wrote is provisional — **36 of 36, all written by this run**.`;
const P5_HIGH_RUN1 = `| chain-retry-storm | **H** — rests on provisional ratings | 400 | **H** — rests on provisional ratings (288) |
| chain-stale-price | M — rests on provisional ratings | 315 | M — rests on provisional ratings (225) |

That is 2 rows at H and 4 at M before action, and 1 H and 1 M after action — every one of those counts and values rests on provisional ratings.`;
const P5_MEDIUM_RUN1 = `- By priority: 7 **H** (rests on provisional ratings) and 4 **M** (rests on provisional ratings).
- Highest RPN is CH-09 at 567 (rests on provisional ratings); then CH-02 at 560, CH-05 at 450 and CH-01 at 441 (each rests on provisional ratings). RPN never ranks — the table's cell map does.
- Ranked by the table: CH-09 H (provisional), CH-02 H (provisional), CH-05 H (provisional), CH-01 H (provisional), CH-06 H (provisional), CH-11 H (provisional), CH-10 H (provisional), then CH-07 M, CH-08 M, CH-03 M, CH-04 M (each provisional).`;

test("message_counts compares each count by priority the final message states with the document's: p1/medium/run1's 8 H and 6 M against 9 H and 5 M do not match", () => {
  assert.deepEqual(countsFor(P1_MEDIUM_RUN1, [...chains(9, "H"), ...chains(5, "M")]), {
    checked: true,
    reason: null,
    document: { H: { before: 9, after: 0 }, M: { before: 5, after: 0 } },
    stated: [pair(8, "H", false), pair(6, "M", false)],
  });
});

test("message_counts searches the document's values only: p1/high/run2's 5 H, 7 M, 0 L states three pairs where L is a value, and two where no chain carries L", () => {
  // One M chain is L after action, so L is a value whose count before action is 0.
  assert.deepEqual(countsFor(P1_HIGH_RUN2, [...chains(5, "H"), ["M", "L"], ...chains(6, "M")]), {
    checked: true,
    reason: null,
    document: { H: { before: 5, after: 0 }, M: { before: 7, after: 0 }, L: { before: 0, after: 1 } },
    stated: [pair(5, "H", true), pair(7, "M", true), pair(0, "L", true)],
  });
  assert.deepEqual(countsFor(P1_HIGH_RUN2, [...chains(5, "H"), ...chains(7, "M")]).stated, [pair(5, "H", true), pair(7, "M", true)]);
});

test("message_counts matches a stated count against the document's count before action or after it, in message order: p5/high/run1's 2 H and 4 M before and 1 H and 1 M after", () => {
  const rows = [["H"], ["H", "H"], ["M"], ["M", "M"], ["M"], ["M"]];
  assert.deepEqual(countsFor(P5_HIGH_RUN1, rows), {
    checked: true,
    reason: null,
    document: { H: { before: 2, after: 1 }, M: { before: 4, after: 1 } },
    stated: [pair(2, "H", true), pair(4, "M", true), pair(1, "H", true), pair(1, "M", true)],
  });
  // With no H after action and two M, the two counts after action match neither of their value's counts.
  const moved = [["H"], ["H"], ["M", "M"], ["M", "M"], ["M"], ["M"]];
  assert.deepEqual(countsFor(P5_HIGH_RUN1, moved).stated, [pair(2, "H", true), pair(4, "M", true), pair(1, "H", false), pair(1, "M", false)]);
});

test("message_counts records no count stated when no pair matches the patterns: p5/medium/run1's CH-09 H, whose digits follow a hyphen, and its 7 **H**, whose markup parts the count from the value", () => {
  const rows = [...chains(2, "H", "H"), ...chains(5, "H"), ["M", "M"], ...chains(3, "M")];
  assert.deepEqual(countsFor(P5_MEDIUM_RUN1, rows), {
    checked: false,
    reason: "no count stated",
    document: { H: { before: 7, after: 2 }, M: { before: 4, after: 1 } },
    stated: [],
  });
});

test("message_counts escapes a value's regular-expression characters, matches it as a whole token, and reads a value followed by a colon or an equals sign and the count", () => {
  const rows = [...chains(3, "(H)"), ["B.C"]];
  // Unescaped, (H) would match a bare H and B.C would match BxC; 3 (H)x is not the whole token.
  assert.deepEqual(countsFor("B.C: 1 row, then 3 (H) rows; 4 BxC is no value, and neither is 3 (H)x or 4 H.", rows).stated, [pair(1, "B.C", true), pair(3, "(H)", true)]);
  assert.deepEqual(countsFor("Counts: H=2, and later H : 3; the H-2 row and 2 HH are not counts.", chains(2, "H")).stated, [pair(2, "H", true), pair(3, "H", false)]);
});

test("message_counts is not checked when the document or the message cannot give the counts, and says why, keeping what it could read", () => {
  const message = resultFile("8 H and 6 M.");
  const unchecked = (reason: string, document: EvalContext["message_counts"]["document"] = {}) => ({ checked: false, reason, document, stated: [] });
  assert.deepEqual(recordFor({ "transcript.json": message }).message_counts, unchecked("analysis.json missing"));
  assert.deepEqual(recordFor({ "transcript.json": message, "analysis.json": "{not json" }).message_counts, unchecked("analysis.json unreadable"));
  for (const doc of [{}, { chains: [] }, { chains: "x" }, { chains: [{ priority: { value: "" } }, { priority: {} }, { post_priority: { value: 3 } }, "x"] }]) {
    assert.deepEqual(recordFor({ "transcript.json": message, "analysis.json": JSON.stringify(doc) }).message_counts, unchecked("no priority values in the document"), JSON.stringify(doc));
  }
  const document = { H: { before: 8, after: 0 } };
  const analysis = analysisFile(chains(8, "H"));
  assert.deepEqual(recordFor({ "analysis.json": analysis }).message_counts, unchecked("transcript.json missing", document));
  assert.deepEqual(recordFor({ "analysis.json": analysis, "transcript.json": "{not json" }).message_counts, unchecked("transcript.json is not JSON", document));
  assert.deepEqual(recordFor({ "analysis.json": analysis, "transcript.json": resultFile(null) }).message_counts, unchecked("transcript.json result is not a string", document));
  assert.deepEqual(recordFor({ "analysis.json": analysis, "transcript.json": resultFile("") }).message_counts, unchecked("no count stated", document));
});

test("a missing invocations.json gives invocations missing, denied zeros and fired null; a missing or unparsable validate.json gives final null", () => {
  const base = { "transcript.jsonl": initLine([], [], "/tmp/cfg/m/") + "\n", "autocompact.txt": `${WINDOW_LINE}\n` };
  const cases: [string, Record<string, string>, "present" | "missing", number | null][] = [
    ["neither file", {}, "missing", null],
    ["neither file parses", { "invocations.json": "{not json", "validate.json": "{not json" }, "missing", null],
    ["no calls and no lints", { "invocations.json": JSON.stringify({ scripts: [] }), "validate.json": JSON.stringify({ ok: false }) }, "missing", null],
    ["invocations without validate.json", { "invocations.json": JSON.stringify({ scripts: ["validate.ts"], calls: [] }) }, "present", 0],
  ];
  for (const [name, files, invocations, fired] of cases) {
    const dir = runDir({ ...base, ...files });
    try {
      const context = contextFor(dir, { configDir: "/tmp/cfg", lintIds: LINTS, env: {} });
      assert.equal(context.invocations, invocations, name);
      assert.deepEqual(context.denied, { bun: 0, other: 0 }, name);
      assert.deepEqual(
        context.lints,
        LINTS.map((id) => ({ id, fired, final: null })),
        name,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const CLI = join(import.meta.dirname, "eval-context.ts");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("a missing transcript.jsonl or autocompact.txt, or a probe reply with no window line, is one coded IO_READ line and no context.json", () => {
  const transcript = initLine([], [], "/tmp/cfg/m/") + "\n";
  const cases: [Record<string, string>, RegExp][] = [
    [{ "autocompact.txt": `${WINDOW_LINE}\n` }, /cannot read .*transcript\.jsonl/],
    [{ "transcript.jsonl": transcript }, /cannot read .*autocompact\.txt/],
    [{ "transcript.jsonl": transcript, "autocompact.txt": "API Error: 401 authentication failed\n" }, /autocompact\.txt holds no line containing "auto-compact window for"/],
  ];
  for (const [files, want] of cases) {
    const dir = runDir(files);
    try {
      assert.throws(() => contextFor(dir, { configDir: "/tmp/cfg", lintIds: LINTS, env: {} }), want);
      const r = runCli([dir, "--config-dir", "/tmp/cfg"]);
      assert.equal(r.status, 3, r.stderr);
      assert.match(r.stderr, /^error IO_READ: [^\n]*\n$/);
      assert.match(r.stderr, want);
      assert.ok(!existsSync(join(dir, "context.json")), "context.json was written on a refusal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("the CLI writes context.json into the run directory and prints nothing; it refuses USAGE without --config-dir and IO_READ on a missing transcript, writing nothing", () => {
  const dir = runDir({ "transcript.jsonl": initLine([], [], "/tmp/cfg/m/") + "\n" + assistantLine(SMALL) + "\n", "autocompact.txt": `${WINDOW_LINE}\n` });
  const empty = runDir({});
  try {
    for (const args of [[dir], [dir, "--config-dir"], [dir, "--config-dir", "/tmp/cfg", "--lint"], [dir, "--config-dir", "/tmp/cfg", "--force"], [dir, dir, "--config-dir", "/tmp/cfg"], ["--config-dir", "/tmp/cfg"]]) {
      const usage = runCli(args);
      assert.equal(usage.status, 1, args.join(" "));
      assert.match(usage.stderr, /^error USAGE: usage: node tools\/eval-context\.ts <run-dir> --config-dir <path> \[--lint <id>\]\.\.\.$/m);
      assert.ok(!existsSync(join(dir, "context.json")), `context.json was written on a USAGE refusal: ${args.join(" ")}`);
    }

    const r = runCli([dir, "--config-dir", "/tmp/cfg", "--lint", "edge-reliability-unstated"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
    const written = JSON.parse(readFileSync(join(dir, "context.json"), "utf8")) as EvalContext;
    assert.equal(written.compactions, 0);
    assert.equal(written.lints.length, 1);
    assert.equal(written.assistant_lines, 1);
    assert.equal(written.assistant_lines_without_usage, 0);

    const missing = runCli([empty, "--config-dir", "/tmp/cfg"]);
    assert.equal(missing.status, 3);
    assert.match(missing.stderr, /^error IO_READ: cannot read .*transcript\.jsonl/);
    assert.ok(!existsSync(join(empty, "context.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});
