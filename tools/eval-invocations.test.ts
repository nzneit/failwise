import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { entryScripts, extractInvocations, RESULT_HEAD_CHARS, SKILL_SCRIPTS_DIR, type Invocations } from "./eval-invocations.ts";

const SCRIPTS = ["priority.ts", "render.ts", "update-check.ts", "validate.ts"];

// One stream-json line per content block, as `claude -p --output-format
// stream-json --verbose` writes them.
function toolUse(id: string, command: string, name = "Bash"): string {
  const input = name === "Bash" ? { command, description: "d" } : { file_path: command };
  return JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } });
}

function toolResult(id: string, content: unknown, isError = false): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } });
}

function denied(id: string): string {
  return JSON.stringify({ type: "system", subtype: "permission_denied", tool_name: "Bash", tool_use_id: id, decision_reason_type: "mode" });
}

function assistantBlock(block: unknown): string {
  return JSON.stringify({ type: "assistant", message: { role: "assistant", content: [block] } });
}

const DENIAL_TEXT = "Permission to use Bash has been denied because Claude Code is running in don't ask mode.";

test("a call that ran is listed with its line, command, scripts and the head of its result", () => {
  const text = [
    JSON.stringify({ type: "system", subtype: "init" }),
    toolUse("t1", "node /tmp/p/skills/fmea-software/scripts/priority.ts analysis.json --write"),
    toolResult("t1", '{"table":"priority-fmea-software-v1","rows":16}'),
  ].join("\n");
  assert.deepEqual(extractInvocations(text, SCRIPTS), {
    scripts: SCRIPTS,
    calls: [
      {
        line: 2,
        tool_use_id: "t1",
        scripts: ["priority.ts"],
        command: "node /tmp/p/skills/fmea-software/scripts/priority.ts analysis.json --write",
        outcome: "ran",
        result_head: '{"table":"priority-fmea-software-v1","rows":16}',
      },
    ],
  });
});

test("a call the permission check denied is denied, not ran and not error", () => {
  const text = [toolUse("t1", "node scripts/priority.ts analysis.json --write; echo $status"), denied("t1"), toolResult("t1", DENIAL_TEXT, true)].join("\n");
  const calls = extractInvocations(text, SCRIPTS).calls;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome, "denied");
  assert.equal(calls[0].result_head, DENIAL_TEXT);
});

test("a call whose result is an error without a denial is error", () => {
  const text = [toolUse("t1", "node scripts/validate.ts analysis.json"), toolResult("t1", "Exit code 2", true)].join("\n");
  assert.equal(extractInvocations(text, SCRIPTS).calls[0].outcome, "error");
});

test("a call with no result in the stream is no_result, with an empty head", () => {
  const calls = extractInvocations(toolUse("t1", "node scripts/render.ts analysis.json --out report.html"), SCRIPTS).calls;
  assert.equal(calls[0].outcome, "no_result");
  assert.equal(calls[0].result_head, "");
});

test("a script named only in a thought, a text block, a file read or a tool result is not a call", () => {
  const text = [
    assistantBlock({ type: "thinking", thinking: "then I run priority.ts --write and render.ts" }),
    assistantBlock({ type: "text", text: "Running validate.ts next." }),
    toolUse("r1", "/tmp/p/skills/fmea-software/scripts/priority.ts", "Read"),
    toolResult("r1", "1\timport { PLUGIN_VERSION } from './lib/version.ts'; // validate.ts priority.ts"),
    toolUse("b1", "ls -la /tmp/p"),
    toolResult("b1", "priority.ts render.ts validate.ts"),
  ].join("\n");
  assert.deepEqual(extractInvocations(text, SCRIPTS).calls, []);
});

test("a script name matches only as a whole file name, and a call naming several lists each in order", () => {
  const text = [
    toolUse("a", "node my-priority.ts && node priority.test.ts && cat priority.tsx"),
    toolUse("b", 'S=/tmp/p/scripts; node $S/validate.ts analysis.json --write && node "$S/priority.ts" analysis.json --write'),
    toolUse("c", "cd /tmp/p/scripts && node update-check.ts before.json analysis.json;node render.ts analysis.json --out report.html"),
  ].join("\n");
  const calls = extractInvocations(text, SCRIPTS).calls;
  assert.deepEqual(
    calls.map((c) => [c.tool_use_id, c.scripts]),
    [
      ["b", ["priority.ts", "validate.ts"]],
      ["c", ["render.ts", "update-check.ts"]],
    ],
  );
});

test("calls are listed in stream order, and blank lines still count toward line numbers", () => {
  const text = [toolUse("first", "node render.ts a.json --out r.html"), "", toolUse("second", "node priority.ts a.json --write"), ""].join("\n");
  assert.deepEqual(
    extractInvocations(text, SCRIPTS).calls.map((c) => [c.tool_use_id, c.line]),
    [
      ["first", 1],
      ["second", 3],
    ],
  );
});

test("a result given as text blocks is joined, and the head is cut at RESULT_HEAD_CHARS", () => {
  const long = "x".repeat(RESULT_HEAD_CHARS + 50);
  const text = [toolUse("t1", "node validate.ts a.json"), toolResult("t1", [{ type: "text", text: "ok " }, { type: "text", text: long }])].join("\n");
  const head = extractInvocations(text, SCRIPTS).calls[0].result_head;
  assert.equal(head.length, RESULT_HEAD_CHARS);
  assert.ok(head.startsWith("ok x"));
});

test("a line that is not JSON refuses the whole stream, naming the line", () => {
  const text = [toolUse("t1", "node priority.ts a.json --write"), '{"type":"assistant","message":'].join("\n");
  assert.throws(() => extractInvocations(text, SCRIPTS), /line 2 is not JSON/);
});

test("an empty list of script names refuses rather than finding no calls", () => {
  assert.throws(() => extractInvocations(toolUse("t1", "node priority.ts a.json --write"), []), /no script names/);
});

test("the skill's entry scripts are its top-level .ts files without the tests", () => {
  const scripts = entryScripts(SKILL_SCRIPTS_DIR);
  for (const want of ["priority.ts", "render.ts", "track.ts", "update-check.ts", "validate.ts"]) assert.ok(scripts.includes(want), `missing ${want}`);
  assert.ok(scripts.every((s) => s.endsWith(".ts") && !s.endsWith(".test.ts") && !s.includes("/")), scripts.join(" "));
  assert.deepEqual(scripts, [...scripts].sort());
});

const CLI = join(import.meta.dirname, "eval-invocations.ts");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("the CLI writes invocations.json into the run directory and prints nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-invocations-"));
  try {
    writeFileSync(join(dir, "transcript.jsonl"), [toolUse("t1", "node priority.ts analysis.json --write"), toolResult("t1", '{"rows":2}')].join("\n") + "\n");
    const r = runCli([dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    const written = JSON.parse(readFileSync(join(dir, "invocations.json"), "utf8")) as Invocations;
    assert.deepEqual(written.scripts, entryScripts(SKILL_SCRIPTS_DIR));
    assert.deepEqual(
      written.calls.map((c) => [c.tool_use_id, c.scripts, c.outcome]),
      [["t1", ["priority.ts"], "ran"]],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI refuses with one IO_READ line and writes nothing when the transcript is missing or broken", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-invocations-"));
  try {
    const missing = runCli([dir]);
    assert.equal(missing.status, 3);
    assert.match(missing.stderr, /^error IO_READ: cannot read .*transcript\.jsonl: .*\n$/);
    assert.ok(!existsSync(join(dir, "invocations.json")));

    writeFileSync(join(dir, "transcript.jsonl"), "{not json\n");
    const broken = runCli([dir]);
    assert.equal(broken.status, 3);
    assert.match(broken.stderr, /^error IO_READ: .*transcript\.jsonl line 1 is not JSON\n$/);
    assert.ok(!existsSync(join(dir, "invocations.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI takes exactly one run directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-invocations-"));
  try {
    mkdirSync(join(dir, "b"));
    for (const args of [[], [dir, join(dir, "b")], ["--force", dir]]) {
      const r = runCli(args);
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.stderr, /^error USAGE: /);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
