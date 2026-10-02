// tools/run-eval.test.ts
//
// The isolation tools/run-eval.sh gives an eval run is not covered by anything
// else in either suite: a later edit that points --plugin-dir back at $ROOT, or
// that drops the filtering, would leave every test green while handing the run
// the answer keys again. So the script is run end to end with `claude` replaced
// by a stub placed first on PATH — no model call is made — and the stub records
// the argv it was given, its working directory, and a listing of the
// --plugin-dir tree, which the assertions below read.
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
// exits.

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
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

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
  const stub = [
    "#!/usr/bin/env bash",
    `printf '%s\\n' "$@" > '${argvFile}'`,
    `pwd > '${cwdFile}'`,
    'plugin=""',
    'prev=""',
    'for a in "$@"; do',
    '  if [ "$prev" = "--plugin-dir" ]; then plugin="$a"; fi',
    '  prev="$a"',
    "done",
    `: > '${treeFile}'`,
    `if [ -n "$plugin" ]; then (cd "$plugin" && find .) > '${treeFile}'; fi`,
    `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"result":"stub"}'`,
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
  return { dir, tmp, publish, argvFile, cwdFile, treeFile, env };
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
    assert.match(r.stdout, /^p1 medium run1: model=sonnet basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+$/m);
    assert.ok(existsSync(join(s.publish, "p1", "medium", "run1", "transcript.json")), "the run was not published under $FMEA_EVAL_PUBLISH_ROOT");

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

test("the default model table keeps the provider's names while every record stays keyed on the capability", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^p1 high run1: model=opus basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+$/m);
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
    assert.match(r.stdout, /^p5 medium run2: model=glm-5\.3-flash basis=FMEA_EVAL_MODELS effort=high analysis=missing report=missing validate_exit=\d+$/m);
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
    assert.match(r.stdout, /^p1 high run1: model=opus basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+$/m);

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
    assert.match(r.stdout, /^p1 medium run1: model=sonnet basis=default \(anthropic\) effort=high analysis=missing report=missing validate_exit=\d+$/m);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});
