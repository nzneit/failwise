// tools/run-eval.test.ts
//
// The isolation tools/run-eval.sh gives an eval run is not covered by anything
// else in either suite: a later edit that points --plugin-dir back at $ROOT, or
// that drops the filtering, would leave every test green while handing the run
// the answer keys again. So the script is run end to end with `claude` replaced
// by a stub placed first on PATH — no model call is made — and the stub records
// the argv it was given, its working directory, a listing of the --plugin-dir
// tree, the CLAUDE_CONFIG_DIR it was given with a listing of that directory, and
// the two context-window settings and DISABLE_AUTOUPDATER it was given, which
// the assertions below read. The stub answers the harness's /autocompact probe
// with a window line a case can replace (FMEA_STUB_AUTOCOMPACT, on stderr when
// FMEA_STUB_AUTOCOMPACT_STREAM is stderr) and records nothing for the probe.
// FMEA_STUB_BAD_LINE=1 puts a line that is not JSON into the run's stream.
// FMEA_STUB_RESULT replaces the JSON value of the result line's result, the
// run's final message, which is "stub." by default. FMEA_STUB_HANG, a file
// path, makes the run's call (not the probe's) create that file and then wait
// on a thirty-second sleep it becomes, so a case can signal the script while
// its claude session runs; with FMEA_STUB_LINGER as well, the stub catches
// SIGTERM, SIGINT and SIGHUP and, 0.3 s later, writes a file into its
// CLAUDE_CONFIG_DIR, creates FMEA_STUB_HANG's path with .done appended and
// exits 0, as a session that saves its state on the way out would.
//
// The fail-closed guard needs two cases of its own. The clean copy the first
// test inspects is the very condition the guard checks, so a guard edited into a
// vacuous expression would leave this file green with the net dead: one case
// therefore plants an answer key that neither the evals/ removal nor the
// *.test.ts strip touches — in a throwaway plugin root under the OS temp folder,
// never in this repository — and requires the run to refuse before the stub is
// reached. The other hands the real script a $TMPDIR whose own name holds
// "expected" and requires the run to proceed, which pins the guard's "expected"
// clause to the copy rather than to the whole absolute path.
//
// The model table (amended 2026-09-12) needs three cases: the default table
// resolves the capability to the provider scheme it has always named while the
// run directory and records stay keyed on the capability; FMEA_EVAL_MODELS
// replaces the whole table and its names reach --model and models.json; and a
// malformed table — an unknown capability, an empty value, or a table with no
// model for the capability this run is at — refuses before any model call.
//
// The effort level needs one case of its own (amended 2026-09-12 by the user's
// ruling at the eval re-run): the run pins --effort high rather than inheriting
// whatever effort the invoking session's settings carry, and both models.json
// and the summary line carry the pin.
//
// The run publishes into a temporary directory rather than build/evals/ (the
// script reads $FMEA_EVAL_PUBLISH_ROOT), and $TMPDIR is a temporary directory
// too, so the scratch directories the script makes can be checked for after it
// exits, a signal's exit included: the case that signals the script starts it
// as the leader of its own process group, as tools/run-round.ts does, and
// signals the group.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const SCRIPT = join(import.meta.dirname, "run-eval.sh");
const ROOT = resolve(import.meta.dirname, "..");
const SKILL = join(ROOT, "skills", "fmea-software");
const SKIP = spawnSync("bash", ["-c", "exit 0"]).status === 0 ? false : "bash is not on PATH";
const USAGE = /^usage: tools\/run-eval\.sh <prompt-id: 1\|5\|6\|7> <model-capability: high\|medium> <run-n: positive integer>$/m;

interface Sandbox {
  dir: string;
  tmp: string;
  publish: string;
  argvFile: string;
  cwdFile: string;
  treeFile: string;
  configFile: string;
  configListFile: string;
  envFile: string;
  env: Record<string, string>;
}

/**
 * A temp directory holding the stub `claude`, the run's $TMPDIR, and its publish
 * root. `tmpName` names the $TMPDIR directory, so a case can give the script a
 * temp path whose own name contains a word the guard searches for. `models`, when
 * given, is exported as FMEA_EVAL_MODELS for the run.
 */
function sandbox(tmpName = "tmp", models?: string): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "run-eval-test-"));
  const bin = join(dir, "bin");
  const tmp = join(dir, tmpName);
  const publish = join(dir, "publish");
  for (const d of [bin, tmp, publish]) mkdirSync(d);
  const argvFile = join(dir, "argv.txt");
  const cwdFile = join(dir, "cwd.txt");
  const treeFile = join(dir, "tree.txt");
  const configFile = join(dir, "config.txt");
  const configListFile = join(dir, "config-list.txt");
  const envFile = join(dir, "env.txt");
  const stub = [
    "#!/usr/bin/env bash",
    'if [ "$2" = "/autocompact" ]; then',
    "  reply=\"${FMEA_STUB_AUTOCOMPACT-Auto-compact window for stub: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)}\"",
    '  if [ -z "$reply" ]; then exit 0; fi',
    "  if [ \"${FMEA_STUB_AUTOCOMPACT_STREAM:-}\" = stderr ]; then printf '%s\\n' \"$reply\" >&2; else printf '%s\\n' \"$reply\"; fi",
    "  exit 0",
    "fi",
    `printf '%s\\n' "$@" > '${argvFile}'`,
    `pwd > '${cwdFile}'`,
    "printf '%s\\n' \"${CLAUDE_CONFIG_DIR:-}\" > '" + configFile + "'",
    "if [ -n \"${CLAUDE_CONFIG_DIR:-}\" ]; then ls -A \"$CLAUDE_CONFIG_DIR\" > '" + configListFile + "'; fi",
    "printf '%s\\n' \"CLAUDE_CODE_AUTO_COMPACT_WINDOW=${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-}\" \"CLAUDE_CODE_MAX_CONTEXT_TOKENS=${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-}\" \"DISABLE_AUTOUPDATER=${DISABLE_AUTOUPDATER:-}\" > '" + envFile + "'",
    'plugin=""',
    'prev=""',
    'for a in "$@"; do',
    '  if [ "$prev" = "--plugin-dir" ]; then plugin="$a"; fi',
    '  prev="$a"',
    "done",
    `: > '${treeFile}'`,
    `if [ -n "$plugin" ]; then (cd "$plugin" && find .) > '${treeFile}'; fi`,
    'if [ -n "${FMEA_STUB_HANG:-}" ] && [ -n "${FMEA_STUB_LINGER:-}" ]; then',
    '  sleep 30 & sleeper=$!',
    '  trap \'kill "$sleeper" 2> /dev/null; sleep 0.3; mkdir -p "$CLAUDE_CONFIG_DIR"; echo "{}" > "$CLAUDE_CONFIG_DIR/state.json"; : > "$FMEA_STUB_HANG.done"; exit 0\' TERM INT HUP',
    '  : > "$FMEA_STUB_HANG"; wait "$sleeper"',
    'fi',
    'if [ -n "${FMEA_STUB_HANG:-}" ]; then : > "$FMEA_STUB_HANG"; exec sleep 30; fi',
    'if [ "${FMEA_STUB_BAD_LINE:-}" = 1 ]; then printf \'%s\\n\' "not json"; fi',
    'printf \'{"type":"result","subtype":"success","is_error":false,"result":%s}\\n\' "${FMEA_STUB_RESULT:-\\"stub.\\"}"',
    "",
  ].join("\n");
  const claude = join(bin, "claude");
  writeFileSync(claude, stub);
  chmodSync(claude, 0o755);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    // The stub first, then the node running this test: run-eval.sh needs both.
    PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    TMPDIR: tmp,
    FMEA_EVAL_PUBLISH_ROOT: publish,
  };
  if (models !== undefined) env.FMEA_EVAL_MODELS = models;
  return { dir, tmp, publish, argvFile, cwdFile, treeFile, configFile, configListFile, envFile, env };
}

/**
 * A throwaway plugin root under the OS temp folder, so the guard can be made to
 * fire without touching this repository: a copy of run-eval.sh at
 * tools/run-eval.sh (the script takes its $ROOT from its own location), a copy
 * of .claude-plugin/, the smallest skills/fmea-software/ tree prompt 1 needs —
 * the real evals/prompts.json and the fixtures it names — and one planted answer
 * key, scripts/leaked.expected.json, which neither the evals/ removal nor the
 * *.test.ts strip removes from the copy.
 */
function plantedRoot(): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), "run-eval-planted-"));
  mkdirSync(join(root, "tools"));
  copyFileSync(SCRIPT, join(root, "tools", "run-eval.sh"));
  cpSync(join(ROOT, ".claude-plugin"), join(root, ".claude-plugin"), { recursive: true });
  const skill = join(root, "skills", "fmea-software");
  mkdirSync(join(skill, "evals"), { recursive: true });
  mkdirSync(join(skill, "scripts"), { recursive: true });
  copyFileSync(join(SKILL, "evals", "prompts.json"), join(skill, "evals", "prompts.json"));
  const prompts = JSON.parse(readFileSync(join(SKILL, "evals", "prompts.json"), "utf8")) as {
    prompts: { id: number; inputs: string[] }[];
  };
  const inputs = prompts.prompts.find((p) => p.id === 1)?.inputs ?? [];
  assert.ok(inputs.length > 0, "prompts.json names no inputs for prompt 1");
  for (const rel of inputs) {
    const dest = join(skill, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(SKILL, rel), dest);
  }
  writeFileSync(join(skill, "scripts", "leaked.expected.json"), "{}\n");
  return { root, script: join(root, "tools", "run-eval.sh") };
}

test("the run gets a filtered plugin copy outside the repository, and the trap clears it", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p1 medium run1: model=sonnet basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+ invocations=present context=present final=complete$/m);
    assert.ok(existsSync(join(s.publish, "p1", "medium", "run1", "transcript.json")), "the run was not published under $FMEA_EVAL_PUBLISH_ROOT");
    // The stub's stream holds one result line and no tool call, so the extracted
    // record is published and lists no call.
    const invocations = JSON.parse(readFileSync(join(s.publish, "p1", "medium", "run1", "invocations.json"), "utf8")) as { scripts: string[]; calls: unknown[] };
    assert.ok(invocations.scripts.includes("priority.ts"), "invocations.json searched for no priority.ts");
    assert.deepEqual(invocations.calls, []);
    // The context record is published beside it; the stub's stream holds no init
    // line and no compaction.
    const context = JSON.parse(readFileSync(join(s.publish, "p1", "medium", "run1", "context.json"), "utf8")) as { init: { present: boolean }; compactions: number; final_message: unknown; message_counts: unknown };
    assert.equal(context.init.present, false);
    assert.equal(context.compactions, 0);
    // The stub's final message, "stub.", is complete (prose design §8.1).
    assert.deepEqual(context.final_message, { complete: true, reason: null, length: 5 });
    // The stub writes no analysis.json, so the counts the message states are not checked.
    assert.deepEqual(context.message_counts, { checked: false, reason: "analysis.json missing", document: {}, stated: [] });

    const argv = readFileSync(s.argvFile, "utf8").split("\n").filter((l) => l !== "");
    const pluginDir = argv[argv.indexOf("--plugin-dir") + 1];
    assert.ok(argv.includes("--plugin-dir") && pluginDir !== undefined, `no --plugin-dir in ${argv.join(" ")}`);
    assert.notEqual(pluginDir, ROOT, "--plugin-dir is the repository root");
    assert.ok(!pluginDir.startsWith(ROOT + sep), `--plugin-dir is inside the repository: ${pluginDir}`);
    assert.equal(argv[argv.indexOf("--add-dir") + 1], pluginDir, "--add-dir is not the plugin copy");

    const tree = readFileSync(s.treeFile, "utf8").split("\n").filter((l) => l !== "");
    for (const want of ["./.claude-plugin/plugin.json", "./skills/fmea-software/SKILL.md", "./skills/fmea-software/scripts/validate.ts"]) {
      assert.ok(tree.includes(want), `the plugin copy is missing ${want}`);
    }
    for (const entry of tree) {
      const why = `the plugin copy holds ${entry}`;
      assert.ok(!entry.includes("/evals/") && !entry.endsWith("/evals"), why);
      assert.ok(!entry.endsWith("/rubric.md"), why);
      assert.ok(!entry.includes("expected"), why);
      assert.ok(!entry.endsWith("/checkout-service.fmea.json"), why);
      assert.ok(!entry.endsWith(".test.ts"), why);
    }

    // Both scratch directories are gone: the work directory the stub ran in, the
    // plugin copy it was handed, and nothing of either left under $TMPDIR.
    const work = readFileSync(s.cwdFile, "utf8").trim();
    assert.ok(!existsSync(work), `the work directory survived the run: ${work}`);
    assert.ok(!existsSync(pluginDir), `the plugin copy survived the run: ${pluginDir}`);
    assert.deepEqual(readdirSync(s.tmp).filter((n) => n.startsWith("fmea-")), []);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the run gets a fresh, empty CLAUDE_CONFIG_DIR under its own TMPDIR, never ~/.claude, and the trap clears it", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: { ...s.env, CLAUDE_CONFIG_DIR: join(homedir(), ".claude") }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const configDir = readFileSync(s.configFile, "utf8").trim();
    assert.ok(configDir.startsWith(s.tmp + sep), `CLAUDE_CONFIG_DIR is not under the run's TMPDIR: ${configDir}`);
    assert.ok(!configDir.startsWith(join(homedir(), ".claude")), `CLAUDE_CONFIG_DIR is the user's own: ${configDir}`);
    assert.ok(!configDir.startsWith(ROOT + sep), `CLAUDE_CONFIG_DIR is inside the repository: ${configDir}`);
    assert.equal(readFileSync(s.configListFile, "utf8"), "", "the harness put files into CLAUDE_CONFIG_DIR before the launch: it copies nothing in (what the CLI itself leaves there after a probe is the preflight's record)");
    assert.ok(!existsSync(configDir), `the config directory survived the run: ${configDir}`);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("a model with no table row runs with neither window setting, whatever the launcher carries, and the probe's reply is published", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1", CLAUDE_CODE_MAX_CONTEXT_TOKENS: "2" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readFileSync(s.envFile, "utf8").split("\n").filter((l) => l !== ""), ["CLAUDE_CODE_AUTO_COMPACT_WINDOW=", "CLAUDE_CODE_MAX_CONTEXT_TOKENS=", "DISABLE_AUTOUPDATER=1"]);
    assert.equal(readFileSync(join(s.publish, "p1", "high", "run1", "autocompact.txt"), "utf8"), "Auto-compact window for stub: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)\n");
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("deepseek-flash gets the 786.4k window settings and runs only when the probe reports that window", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=deepseek-flash,medium=deepseek-flash");
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readFileSync(s.envFile, "utf8").split("\n").filter((l) => l !== ""), ["CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432", "CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000", "DISABLE_AUTOUPDATER=1"]);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the probe gate refuses before any model call, printing the reply: no window line, a capped window, or another window than the row's", { skip: SKIP }, () => {
  const cases: [string, string | undefined, RegExp, string | null][] = [
    ["", "high=deepseek-flash", /^error: the CLI reported no auto-compact window line; its reply follows$/m, null],
    ["API Error: 401 authentication failed", "high=deepseek-flash", /^error: the CLI reported no auto-compact window line; its reply follows$/m, "API Error: 401 authentication failed"],
    ["Auto-compact window for deepseek-flash: 200k tokens (capped at the model's window)", "high=deepseek-flash", /^error: the CLI caps the auto-compact window: Auto-compact window for deepseek-flash: 200k tokens \(capped at the model's window\)$/m, null],
    ["Auto-compact window for deepseek-flash: 160k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)", "high=deepseek-flash", /^error: the CLI did not report the window the table expects for deepseek-flash, 786\.4k tokens \(from CLAUDE_CODE_AUTO_COMPACT_WINDOW\): Auto-compact window for deepseek-flash: 160k tokens \(from CLAUDE_CODE_AUTO_COMPACT_WINDOW\)$/m, null],
    ["", undefined, /^error: the CLI reported no auto-compact window line; its reply follows$/m, null],
  ];
  for (const [line, models, want, reply] of cases) {
    const s = sandbox(undefined, models);
    try {
      const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_AUTOCOMPACT: line }, encoding: "utf8" });
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, want);
      if (reply !== null) assert.ok(r.stderr.includes(reply), `the probe's reply was not printed: ${r.stderr}`);
      assert.ok(!existsSync(s.argvFile), "the run was launched although the probe gate refused");
      assert.deepEqual(readdirSync(s.tmp).filter((n) => n.startsWith("fmea-")), []);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  }
});

test("a stream line that is not JSON still publishes the run, with no context.json and one coded IO_READ line in context.stderr", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_BAD_LINE: "1" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    // eval-invocations.ts refuses the same stream, so invocations.json is missing too.
    assert.match(r.stdout, /^p1 medium run1: model=sonnet basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+ invocations=missing context=missing final=missing$/m);
    assert.match(r.stderr, /^p1 medium run1: tools\/eval-invocations\.ts exited 3 \(see invocations\.stderr\)$/m);
    assert.match(r.stderr, /^p1 medium run1: tools\/eval-context\.ts exited 3 \(see context\.stderr\)$/m);
    const published = join(s.publish, "p1", "medium", "run1");
    assert.ok(existsSync(join(published, "transcript.json")), "the run was not published");
    assert.ok(!existsSync(join(published, "context.json")), "context.json was written from a stream holding a line that is not JSON");
    assert.match(readFileSync(join(published, "context.stderr"), "utf8"), /^error IO_READ: [^\n]*transcript\.jsonl line 1 is not JSON\n$/);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the summary line's final field reads final_message.complete from the context.json the run wrote: cut for a final message that ends mid-word, missing for a result that is not a string", { skip: SKIP }, () => {
  const cut = "**Priorities: H for ch-1 and M, each resting on provisional ratings** *(the sh";
  const cases: [string, string, unknown][] = [
    [JSON.stringify(cut), "cut", { complete: false, reason: 'ends with "h"', length: cut.length }],
    ["null", "missing", { complete: null, reason: "transcript.json result is not a string", length: null }],
  ];
  for (const [result, final, record] of cases) {
    const s = sandbox();
    try {
      const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_RESULT: result }, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`^p1 medium run1: model=sonnet basis=default \\(anthropic\\) effort=high analysis=missing report=missing validate_exit=\\d+ invocations=present context=present final=${final}$`, "m"));
      const context = JSON.parse(readFileSync(join(s.publish, "p1", "medium", "run1", "context.json"), "utf8")) as { final_message: unknown };
      assert.deepEqual(context.final_message, record, final);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  }
});

/** Sends SIGKILL to a process group; a group with no member left (ESRCH) is not an error. */
function killGroup(group: number): void {
  try {
    process.kill(-group, "SIGKILL");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

/** Whether the check holds within twenty seconds, polled every fifty milliseconds. */
async function until(check: () => boolean): Promise<boolean> {
  const deadline = Date.now() + 20_000;
  while (!check() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50));
  return check();
}

test("SIGTERM, SIGINT or SIGHUP to the run's process group exits with 128 plus the signal's number, publishes nothing, and removes the three scratch directories once the session has ended, a session that writes on its way out included", { skip: SKIP }, async () => {
  const scratch = (s: Sandbox) => readdirSync(s.tmp).filter((n) => n.startsWith("fmea-"));
  const cases = [false, true].flatMap((linger) => ([["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]] as const).map(([signal, status]) => ({ linger, signal, status })));
  for (const { linger, signal, status } of cases) {
    const s = sandbox();
    const started = join(s.dir, "started");
    const env = { ...s.env, FMEA_STUB_HANG: started, ...(linger ? { FMEA_STUB_LINGER: "1" } : {}) };
    const child = spawn("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env, detached: true, stdio: "ignore" });
    let ended = false;
    const closed = new Promise<number | null>((done) => child.on("close", (code) => {
      ended = true;
      done(code);
    }));
    try {
      const label = linger ? `${signal}, a session that writes on its way out` : signal;
      assert.ok(child.pid !== undefined, `${label}: the script did not start`);
      assert.ok(await until(() => existsSync(started)), `${label}: the run never reached its claude call`);
      assert.deepEqual(scratch(s).map((n) => n.replace(/-[^-]+$/, "")).sort(), ["fmea-config-p1-medium-run1", "fmea-eval-p1-medium-run1", "fmea-plugin-p1-medium-run1"], label);
      process.kill(-child.pid, signal);
      assert.equal(await closed, status, label);
      // A script that cleaned up at once, under the session, would find its config directory written again here.
      if (linger) assert.ok(await until(() => existsSync(`${started}.done`)), `${label}: the session never finished writing`);
      assert.deepEqual(scratch(s), [], `${label}: a scratch directory survived`);
      assert.ok(!existsSync(join(s.publish, "p1")), `${label}: the stopped run was published`);
    } finally {
      // An assertion that failed before the script ended leaves nothing of its process group running.
      if (!ended && child.pid !== undefined) killGroup(child.pid);
      rmSync(s.dir, { recursive: true, force: true });
    }
  }
});

test("the probe line is read from stderr as well as stdout, and case-insensitively", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=deepseek-flash");
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_AUTOCOMPACT: "AUTO-COMPACT WINDOW FOR deepseek-flash: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)", FMEA_STUB_AUTOCOMPACT_STREAM: "stderr" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the default model table keeps the provider's names while every record stays keyed on the capability", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p1 high run1: model=opus basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+ invocations=present context=present final=complete$/m);
    assert.ok(existsSync(join(s.publish, "p1", "high", "run1", "transcript.json")), "the run was not published under the capability");

    const argv = readFileSync(s.argvFile, "utf8").split("\n").filter((l) => l !== "");
    assert.equal(argv[argv.indexOf("--model") + 1], "opus", "the default table did not fill the high capability with the provider's own name");

    const models = JSON.parse(readFileSync(join(s.publish, "p1", "high", "run1", "models.json"), "utf8")) as {
      basis: string;
      models: Record<string, string>;
    };
    assert.equal(models.basis, "default (anthropic)");
    assert.deepEqual(models.models, { high: "opus", medium: "sonnet", low: "haiku" });
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("FMEA_EVAL_MODELS replaces the whole table: its names reach --model and models.json, the path stays the capability", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=glm-5.3,medium=glm-5.3-flash");
  try {
    const r = spawnSync("bash", [SCRIPT, "5", "medium", "2"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p5 medium run2: model=glm-5\.3-flash basis=FMEA_EVAL_MODELS effort=high analysis=missing report=missing validate_exit=\d+ invocations=present context=present final=complete$/m);
    assert.ok(existsSync(join(s.publish, "p5", "medium", "run2", "transcript.json")), "the run was not published under the capability");

    const argv = readFileSync(s.argvFile, "utf8").split("\n").filter((l) => l !== "");
    assert.equal(argv[argv.indexOf("--model") + 1], "glm-5.3-flash", "--model did not carry the injected name");

    const models = JSON.parse(readFileSync(join(s.publish, "p5", "medium", "run2", "models.json"), "utf8")) as {
      basis: string;
      models: Record<string, string>;
    };
    assert.equal(models.basis, "FMEA_EVAL_MODELS");
    // low was not named by the launch, and the record says so rather than
    // silently keeping the default's value for it.
    assert.deepEqual(models.models, { high: "glm-5.3", medium: "glm-5.3-flash", low: "" });
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the run pins effort high: the flag reaches the CLI and the record carries it", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p1 high run1: model=opus basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+ invocations=present context=present final=complete$/m);

    const argv = readFileSync(s.argvFile, "utf8").split("\n").filter((l) => l !== "");
    assert.equal(argv[argv.indexOf("--effort") + 1], "high", "--effort did not carry the pinned effort");

    const models = JSON.parse(readFileSync(join(s.publish, "p1", "high", "run1", "models.json"), "utf8")) as {
      basis: string;
      effort: string;
      models: Record<string, string>;
    };
    assert.deepEqual(models, { basis: "default (anthropic)", effort: "high", models: { high: "opus", medium: "sonnet", low: "haiku" } });
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("a malformed model table is refused before any model call", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=glm-5.3");
  try {
    // An unknown capability key.
    let r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_EVAL_MODELS: "high=glm-5.3,fast=glm-4.6" }, encoding: "utf8" });
    assert.equal(r.status, 1, `an unknown capability was accepted: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^error: FMEA_EVAL_MODELS names an unknown model capability in 'fast=glm-4\.6' \(known: high, medium, low\)$/m);

    // An empty value.
    r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_EVAL_MODELS: "high=" }, encoding: "utf8" });
    assert.equal(r.status, 1, `an empty value was accepted: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^error: FMEA_EVAL_MODELS names no model for the high model capability \(empty value\)$/m);

    // A table with no model for the capability this run is at.
    r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 1, `a table missing the run's capability was accepted: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^error: the model table \(FMEA_EVAL_MODELS\) names no model for the medium model capability$/m);

    assert.ok(!existsSync(s.argvFile), "claude was invoked for a malformed model table");
    assert.deepEqual(readdirSync(s.tmp).filter((n) => n.startsWith("fmea-")), []);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("a bad prompt id, model capability or run number is refused before any model call", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    // 'opus' is a model name, not a capability: the axis and the table are different things now.
    for (const args of [["2", "high", "1"], ["1", "low", "1"], ["1", "opus", "1"], ["1", "high", "0"]]) {
      const r = spawnSync("bash", [SCRIPT, ...args], { cwd: ROOT, env: s.env, encoding: "utf8" });
      assert.equal(r.status, 1, `${args.join(" ")} was accepted: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, USAGE);
    }
    assert.ok(!existsSync(s.argvFile), "claude was invoked for an invalid argument list");
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("an answer key the filtering misses stops the run before any model call", { skip: SKIP }, () => {
  const s = sandbox();
  const p = plantedRoot();
  try {
    const r = spawnSync("bash", [p.script, "1", "medium", "1"], { cwd: p.root, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 1, `the guard did not fire: ${r.stdout}${r.stderr}`);
    assert.equal(r.stderr.trimEnd().split("\n").length, 1, r.stderr);
    assert.match(
      r.stderr,
      /^error: the filtered plugin copy still holds an answer key: .*\/skills\/fmea-software\/scripts\/leaked\.expected\.json; refusing to run$/m,
    );
    assert.ok(!existsSync(s.argvFile), "claude was invoked with an answer key in the plugin copy");
    // The refusal still leaves no scratch directory behind: the EXIT trap runs.
    assert.deepEqual(readdirSync(s.tmp).filter((n) => n.startsWith("fmea-")), []);
  } finally {
    rmSync(p.root, { recursive: true, force: true });
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test('a $TMPDIR whose own name holds "expected" does not trip the guard', { skip: SKIP }, () => {
  // The guard's "expected" clause is matched against the whole absolute path, so
  // an unanchored '*expected*' would refuse every run made under such a $TMPDIR
  // while naming a path that holds no answer key.
  const s = sandbox("tmp-expected");
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p1 medium run1: model=sonnet basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+ invocations=present context=present final=complete$/m);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});
