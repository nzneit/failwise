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

test("peak_context_tokens is the largest input plus cache_read plus cache_creation over top-level assistant lines, and a subagent line never counts", () => {
  const text = [
    assistantLine(SMALL),
    assistantLine({ input: 1000, cacheRead: 200000, cacheCreation: 37429 }),
    assistantLine({ input: 900000, cacheRead: 0, cacheCreation: 0 }, "toolu_1"),
  ].join("\n");
  const facts = extractContext(text, OPTIONS);
  assert.equal(facts.peak_context_tokens, 238429);
  assert.equal(facts.assistant_lines, 2);
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
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

    const missing = runCli([empty, "--config-dir", "/tmp/cfg"]);
    assert.equal(missing.status, 3);
    assert.match(missing.stderr, /^error IO_READ: cannot read .*transcript\.jsonl/);
    assert.ok(!existsSync(join(empty, "context.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});
