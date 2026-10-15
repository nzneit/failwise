// tools/run-round.test.ts
//
// tools/run-round.ts launches a sixteen-run eval round in parallel, and every
// part of it that could cost a round is pinned here with stubs only: no model
// call is made, no real round is run, and the login keyring is never read.
// Four stubs stand in for what the launcher reaches:
//
// - the one-cell runner, through FMEA_RUN_EVAL: it records when each cell
//   starts and ends (date +%s%N), its pid, the environment it was given, and
//   prints the summary line tools/run-eval.sh prints. FMEA_STUB_FAIL,
//   FMEA_STUB_MISSING, FMEA_STUB_INVALID and FMEA_STUB_CUT name the cells
//   (p<p>:<cap>:<n>, comma-separated) that refuse, leave analysis.json missing,
//   end with validate_exit=2, or end with a cut-off final message. A run 1
//   sleeps FMEA_STUB_SLOW seconds (0.6) and a run 2 FMEA_STUB_FAST (0.2), so
//   cells end in another order than they start. FMEA_STUB_HANG makes every
//   cell but the canary wait on a thirty-second `sleep` it starts in the
//   background, whose pid it records, so a case can tell whether the stub's
//   whole process group was stopped or the stub alone;
// - the keyring, through FMEA_SECRET_TOOL: it prints a `secret = ` line holding
//   FMEA_STUB_SECRET and records that it was called. A `secret-tool` that fails
//   loudly is also first on PATH, so a launcher that ignored the variable would
//   fail rather than read the real keyring;
// - `claude`, first on PATH: it answers --version, and answers the smoke test
//   with FMEA_STUB_SMOKE and FMEA_STUB_SMOKE_EXIT, recording the
//   CLAUDE_CONFIG_DIR it was given;
// - nvm, through NVM_DIR: an empty folder unless a case plants node versions.
//
// PATH is the stubs, the Node running this file, /usr/bin and /bin, so the real
// `claude` in ~/.local/bin is never on it. Every launch passes --publish-root
// into a temporary folder and the stage 9z, so nothing is written under
// build/evals.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isOkReply, redact } from "./run-round.ts";

const LAUNCHER = join(import.meta.dirname, "run-round.ts");
const ROOT = resolve(import.meta.dirname, "..");
const SKIP = spawnSync("bash", ["-c", "exit 0"]).status === 0 ? false : "bash is not on PATH";
const KEY = "sk-stub-0123456789abcdef-QzXv";
const TAIL = "QzXv";
const ROSTER = [1, 5, 6, 7].flatMap((p) => ["high", "medium"].flatMap((cap) => [1, 2].map((n) => `p${p}:${cap}:${n}`)));
const SUMMARY = /^p(\d) (high|medium) run(\d+): /;

const RUN_EVAL_STUB = `#!/usr/bin/env bash
cell="p$1:$2:$3"
has() { case ",$1," in *",$cell,"*) return 0 ;; esac; return 1; }
echo "start $cell $(date +%s%N) $$" >> "$FMEA_STUB_DIR/events.txt"
printf '%s\\n' "ANTHROPIC_BASE_URL=\${ANTHROPIC_BASE_URL:-}" "FMEA_EVAL_MODELS=\${FMEA_EVAL_MODELS:-}" "DISABLE_AUTOUPDATER=\${DISABLE_AUTOUPDATER:-}" \\
  "FMEA_EVAL_PUBLISH_ROOT=\${FMEA_EVAL_PUBLISH_ROOT:-}" "token=$([ "\${ANTHROPIC_AUTH_TOKEN:-}" = "$FMEA_STUB_KEY" ] && echo match || echo differs)" \\
  "path0=\${PATH%%:*}" "cwd=$(pwd)" "stdin=$(readlink /proc/$$/fd/0)" "own_group=$([ "$(ps -o pgid= -p $$ | tr -d ' ')" = "$$" ] && echo yes || echo no)" \\
  > "$FMEA_STUB_DIR/env-$cell.txt"
echo "stub stderr for $cell" >&2
if [ -n "\${FMEA_STUB_HANG:-}" ] && [ "$cell" != "p1:high:1" ]; then sleep 30 & echo "$!" > "$FMEA_STUB_DIR/sleep-$cell.txt"; wait "$!"; fi
case "$3" in 1) sleep "\${FMEA_STUB_SLOW:-0.6}" ;; *) sleep "\${FMEA_STUB_FAST:-0.2}" ;; esac
if has "\${FMEA_STUB_FAIL:-}"; then
  echo "end $cell $(date +%s%N) $$" >> "$FMEA_STUB_DIR/events.txt"
  echo "error: stub refusal for $cell" >&2
  exit 1
fi
mkdir -p "$FMEA_EVAL_PUBLISH_ROOT/p$1/$2/run$3" && echo '{}' > "$FMEA_EVAL_PUBLISH_ROOT/p$1/$2/run$3/transcript.json"
analysis=present; has "\${FMEA_STUB_MISSING:-}" && analysis=missing
vexit=0; has "\${FMEA_STUB_INVALID:-}" && vexit=2
final=complete; has "\${FMEA_STUB_CUT:-}" && final=cut
echo "end $cell $(date +%s%N) $$" >> "$FMEA_STUB_DIR/events.txt"
echo "p$1 $2 run$3: model=deepseek-flash basis=FMEA_EVAL_MODELS effort=high analysis=$analysis report=present validate_exit=$vexit invocations=present context=present final=$final"
`;

const KEYRING_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FMEA_STUB_DIR/keyring-calls.txt"
echo "[/org/freedesktop/secrets/collection/login/7]"
echo "label = goose"
if [ -n "\${FMEA_STUB_SECRET:-}" ]; then echo "secret = $FMEA_STUB_SECRET"; fi
echo "attribute.service = goose"
exit "\${FMEA_STUB_KEYRING_EXIT:-0}"
`;

const CLAUDE_STUB = `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
printf '%s\\n' "\${CLAUDE_CONFIG_DIR:-}" >> "$FMEA_STUB_DIR/smoke-config.txt"
printf '%s\\n' "$*" >> "$FMEA_STUB_DIR/claude-calls.txt"
printf '%s\\n' "\${FMEA_STUB_SMOKE-ok}"
exit "\${FMEA_STUB_SMOKE_EXIT:-0}"
`;

const REAL_KEYRING_GUARD = `#!/usr/bin/env bash
echo "the real keyring would have been read" >&2
exit 99
`;

interface Sandbox { dir: string; root: string; tmp: string; nvm: string; env: Record<string, string> }

function writeExecutable(path: string, text: string): void {
  writeFileSync(path, text);
  chmodSync(path, 0o755);
}

/** A temp folder with the four stubs, an empty nvm folder, a $TMPDIR and a publish root; `env` replaces or adds variables. */
function sandbox(env: Record<string, string> = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "run-round-test-"));
  const [bin, stubs, root, tmp, nvm] = ["bin", "stubs", "publish", "tmp", "nvm"].map((name) => join(dir, name));
  for (const d of [bin, stubs, tmp, nvm]) mkdirSync(d);
  writeExecutable(join(stubs, "run-eval"), RUN_EVAL_STUB);
  writeExecutable(join(stubs, "keyring"), KEYRING_STUB);
  writeExecutable(join(bin, "claude"), CLAUDE_STUB);
  writeExecutable(join(bin, "secret-tool"), REAL_KEYRING_GUARD);
  return {
    dir, root, tmp, nvm,
    env: {
      HOME: process.env.HOME ?? dir,
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      TMPDIR: tmp,
      NVM_DIR: nvm,
      FMEA_RUN_EVAL: join(stubs, "run-eval"),
      FMEA_SECRET_TOOL: join(stubs, "keyring"),
      FMEA_STUB_DIR: dir,
      FMEA_STUB_KEY: KEY,
      FMEA_STUB_SECRET: JSON.stringify({ DEEPSEEK_API_KEY: KEY }),
      ...env,
    },
  };
}

function launch(s: Sandbox, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [LAUNCHER, "9z", "--publish-root", s.root, ...args], { cwd: ROOT, env: s.env, encoding: "utf8", timeout: 60_000 });
}

interface StubEvent { kind: "start" | "end"; cell: string; at: bigint; pid: number }

function events(s: Sandbox): StubEvent[] {
  const file = join(s.dir, "events.txt");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l !== "").map((l) => {
    const [kind, cell, at, pid] = l.split(" ");
    return { kind: kind as StubEvent["kind"], cell, at: BigInt(at), pid: Number(pid) };
  });
}

function startsOf(s: Sandbox): string[] {
  return events(s).filter((e) => e.kind === "start").map((e) => e.cell);
}

/** The most stubs alive at once, from the recorded start and end times; an end sorts before a start at the same instant. */
function maxAlive(list: StubEvent[]): number {
  const sorted = [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === "end" ? -1 : 1));
  let alive = 0;
  let max = 0;
  for (const e of sorted) {
    alive += e.kind === "start" ? 1 : -1;
    max = Math.max(max, alive);
  }
  return max;
}

/** The cells of the summary lines, in printed order. */
function printedCells(stdout: string): string[] {
  return stdout.split("\n").flatMap((l) => {
    const m = SUMMARY.exec(l);
    return m ? [`p${m[1]}:${m[2]}:${m[3]}`] : [];
  });
}

interface RoundFile {
  method: string; concurrency: number; canary: string | null; started: string; ended: string; cli_version: string;
  cells: { cell: string; started: string; ended: string; exit: number | null; summary: string | null }[];
}

function readRound(s: Sandbox): RoundFile {
  return JSON.parse(readFileSync(join(s.root, "round.json"), "utf8")) as RoundFile;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether the process has gone within three seconds; a zombie still answers signal 0 until its new parent reaps it. */
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((done) => setTimeout(done, 50));
  }
}

const sandboxes: Sandbox[] = [];
after(() => {
  for (const s of sandboxes) rmSync(s.dir, { recursive: true, force: true });
});

function tracked(env: Record<string, string> = {}): Sandbox {
  const s = sandbox(env);
  sandboxes.push(s);
  return s;
}

let full: { s: Sandbox; r: SpawnSyncReturns<string> } | undefined;
/** One whole round at --parallel 3, shared by the tests that read it. */
function fullRound(): { s: Sandbox; r: SpawnSyncReturns<string> } {
  if (full === undefined) {
    const s = tracked();
    full = { s, r: launch(s, ["--parallel", "3"]) };
  }
  return full;
}

test("the summary lines print in roster order when all are in, not in the order they arrive, then the round-finished line and the run folders", { skip: SKIP }, () => {
  const { s, r } = fullRound();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(printedCells(r.stdout), ROSTER);
  // A run 1 sleeps longer than a run 2 (FMEA_STUB_SLOW, FMEA_STUB_FAST), so the cells end in another order than the roster's.
  const ended = events(s).filter((e) => e.kind === "end").sort((a, b) => (a.at < b.at ? -1 : 1)).map((e) => e.cell);
  assert.notDeepEqual(ended, ROSTER, "the stubs ended in roster order, so the order check proves nothing");
  for (const line of r.stdout.split("\n").filter((l) => SUMMARY.test(l))) {
    assert.match(line, /^p\d (high|medium) run\d: model=deepseek-flash basis=FMEA_EVAL_MODELS effort=high analysis=present report=present validate_exit=0 invocations=present context=present final=complete$/);
  }
  assert.match(r.stdout, /^round finished: (\d+h )?\d+m \d\ds, concurrency 3, canary p1:high:1; runs under .*\/publish:$/m);
  const listed = r.stdout.slice(r.stdout.indexOf("round finished:")).split("\n").slice(1).filter((l) => l !== "");
  assert.deepEqual(listed, ROSTER.map((c) => {
    const [p, cap, n] = c.split(":");
    return join(s.root, p, cap, `run${n}`);
  }).sort());
  assert.ok(!r.stdout.includes("re-run"), r.stdout);
});

test("the preflight prints node, claude and the CLI version, and smoke-tests the gateway under a fresh config folder it removes", { skip: SKIP }, () => {
  const { s, r } = fullRound();
  assert.match(r.stdout, new RegExp(`^node=${escaped(join(dirname(process.execPath), "node"))} \\(v[\\d.]+\\)$`, "m"));
  assert.match(r.stdout, new RegExp(`^claude=${escaped(join(s.dir, "bin", "claude"))}$`, "m"));
  assert.match(r.stdout, /^claude_version=9\.9\.9 \(Claude Code\)$/m);
  assert.match(r.stdout, /^smoke testing the gateway\.\.\.\ngateway answered$/m);
  assert.deepEqual(readFileSync(join(s.dir, "claude-calls.txt"), "utf8").split("\n").filter((l) => l !== ""), ["-p Reply with the single word ok. --model deepseek-flash --max-turns 1 --no-session-persistence"]);
  const config = readFileSync(join(s.dir, "smoke-config.txt"), "utf8").trim();
  assert.ok(config.startsWith(s.tmp + "/"), `the smoke config folder is not under TMPDIR: ${config}`);
  assert.ok(!existsSync(config), "the smoke config folder survived");
  assert.equal(readFileSync(join(s.dir, "keyring-calls.txt"), "utf8"), "search --all service goose\n");
});

test("the canary runs alone to the end before any other cell starts, and never more than --parallel stubs are alive at once", { skip: SKIP }, () => {
  const { s } = fullRound();
  const list = events(s);
  assert.equal(list.filter((e) => e.kind === "start").length, 16);
  const canaryEnd = list.find((e) => e.kind === "end" && e.cell === "p1:high:1");
  assert.ok(canaryEnd !== undefined);
  assert.equal(list[0].cell, "p1:high:1", "the first stub to start was not the canary");
  for (const e of list.filter((x) => x.kind === "start" && x.cell !== "p1:high:1")) {
    assert.ok(e.at > canaryEnd.at, `${e.cell} started before the canary ended`);
  }
  assert.equal(maxAlive(list), 3);
});

test("each cell runs with the preflight's environment, its own log, no stdin and its own process group, from the repository root", { skip: SKIP }, () => {
  const { s } = fullRound();
  for (const cell of ROSTER) {
    const [p, cap, n] = cell.split(":");
    const log = readFileSync(join(s.root, "logs", `${p}-${cap}-run${n}.log`), "utf8");
    assert.ok(log.includes(`stub stderr for ${cell}\n`), `the log of ${cell} lacks the runner's stderr`);
    assert.match(log, new RegExp(`^${p} ${cap} run${n}: model=deepseek-flash `, "m"));
    assert.deepEqual(readFileSync(join(s.dir, `env-${cell}.txt`), "utf8").split("\n").filter((l) => l !== ""), [
      "ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic",
      "FMEA_EVAL_MODELS=high=deepseek-flash,medium=deepseek-flash",
      "DISABLE_AUTOUPDATER=1",
      `FMEA_EVAL_PUBLISH_ROOT=${s.root}`,
      "token=match",
      `path0=${s.dir}/bin`,
      `cwd=${ROOT}`,
      "stdin=/dev/null",
      "own_group=yes",
    ]);
  }
});

test("round.json records the method, the concurrency, the canary, the times, the CLI version and each cell", { skip: SKIP }, () => {
  const { s, r } = fullRound();
  const round = readRound(s);
  assert.deepEqual(Object.keys(round), ["method", "concurrency", "canary", "started", "ended", "cli_version", "cells"]);
  assert.equal(round.method, "parallel");
  assert.equal(round.concurrency, 3);
  assert.equal(round.canary, "p1:high:1");
  assert.equal(round.cli_version, "9.9.9");
  assert.ok(Date.parse(round.started) <= Date.parse(round.ended), `${round.started} after ${round.ended}`);
  assert.deepEqual(round.cells.map((c) => c.cell), ROSTER);
  const lines = r.stdout.split("\n").filter((l) => SUMMARY.test(l));
  round.cells.forEach((c, i) => {
    assert.deepEqual(Object.keys(c), ["cell", "started", "ended", "exit", "summary"]);
    assert.equal(c.exit, 0);
    assert.equal(c.summary, lines[i]);
    assert.ok(Date.parse(round.started) <= Date.parse(c.started) && Date.parse(c.started) <= Date.parse(c.ended) && Date.parse(c.ended) <= Date.parse(round.ended), c.cell);
  });
});

test("a cell that refuses, leaves an artefact missing, fails validation or is cut off is reported, the round runs to the end and exits 1 with the --cells line", { skip: SKIP }, () => {
  const s = tracked({ FMEA_STUB_FAIL: "p5:high:2", FMEA_STUB_MISSING: "p6:medium:1", FMEA_STUB_INVALID: "p6:high:2", FMEA_STUB_CUT: "p7:high:1", FMEA_STUB_SLOW: "0.1", FMEA_STUB_FAST: "0.05" });
  const r = launch(s, []);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(startsOf(s).length, 16);
  assert.deepEqual(printedCells(r.stdout), ROSTER);
  assert.ok(r.stdout.includes(`\np5 high run2: no summary line (exit 1); log ${join(s.root, "logs", "p5-high-run2.log")}\n`), r.stdout);
  assert.match(r.stdout, /^round finished: \d+m \d\ds, concurrency 4, canary p1:high:1; runs under /m);
  assert.match(r.stdout, /^cells to re-run: p5:high:2 \(exit 1, no summary line\), p6:high:2 \(validate_exit=2\), p6:medium:1 \(analysis=missing\), p7:high:1 \(final=cut\)$/m);
  assert.ok(r.stdout.includes(`\ndelete each published one first: ${["p6/high/run2", "p6/medium/run1", "p7/high/run1"].map((d) => join(s.root, d)).join(" ")}\n`), r.stdout);
  assert.ok(r.stdout.includes(`\nre-run them with: node tools/run-round.ts 9z --no-canary --cells p5:high:2,p6:high:2,p6:medium:1,p7:high:1 --publish-root ${s.root}\n`), r.stdout);
  const failed = readRound(s).cells.find((c) => c.cell === "p5:high:2");
  assert.ok(failed !== undefined && failed.exit === 1 && failed.summary === null, JSON.stringify(failed));
});

test("a canary that refuses or leaves an artefact missing stops the round before any other cell starts; a cut-off canary does not", { skip: SKIP }, () => {
  for (const [variable, reason] of [["FMEA_STUB_FAIL", "exit 1, no summary line"], ["FMEA_STUB_MISSING", "analysis=missing"]]) {
    const s = tracked({ [variable]: "p1:high:1", FMEA_STUB_SLOW: "0.05" });
    const r = launch(s, []);
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(startsOf(s), ["p1:high:1"]);
    assert.ok(r.stdout.includes(`\nround stopped: the canary p1:high:1 ended with ${reason}; no other cell was started; log ${join(s.root, "logs", "p1-high-run1.log")}\n`), r.stdout);
    assert.deepEqual(readRound(s).cells.map((c) => c.cell), ["p1:high:1"]);
  }
  const s = tracked({ FMEA_STUB_CUT: "p1:high:1", FMEA_STUB_SLOW: "0.05", FMEA_STUB_FAST: "0.05" });
  const r = launch(s, []);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(startsOf(s).length, 16);
  assert.match(r.stdout, /^cells to re-run: p1:high:1 \(final=cut\)$/m);
});

test("--cells runs exactly the named cells in roster order, the first of them as the canary, and --no-canary drops the canary", { skip: SKIP }, () => {
  const s = tracked({ FMEA_STUB_SLOW: "0.05", FMEA_STUB_FAST: "0.3" });
  const r = launch(s, ["--cells", "p7:medium:1,5:high:1,p6:high:1", "--parallel", "2"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(printedCells(r.stdout), ["p5:high:1", "p6:high:1", "p7:medium:1"]);
  assert.deepEqual(new Set(startsOf(s)), new Set(["p5:high:1", "p6:high:1", "p7:medium:1"]));
  assert.equal(startsOf(s)[0], "p5:high:1");
  assert.equal(readRound(s).canary, "p5:high:1");

  const t = tracked({ FMEA_STUB_SLOW: "0.05", FMEA_STUB_FAST: "0.05" });
  const u = launch(t, ["--no-canary", "--cells", "p6:medium:2,p1:high:2"]);
  assert.equal(u.status, 0, u.stderr);
  assert.deepEqual(printedCells(u.stdout), ["p1:high:2", "p6:medium:2"]);
  assert.deepEqual(new Set(startsOf(t)), new Set(["p1:high:2", "p6:medium:2"]));
  assert.match(u.stdout, /^round finished: \d+m \d\ds, concurrency 4, canary none; runs under /m);
  assert.equal(readRound(t).canary, null);
});

test("a malformed --cells, a --parallel out of range, a bad stage and an unknown flag are refused before the keyring is read", { skip: SKIP }, () => {
  const usage = /^usage: node tools\/run-round\.ts <stage> \[--parallel <n>\] \[--force-parallel\] \[--cells p<prompt>:<capability>:<run>,\.\.\.\] \[--no-canary\] \[--publish-root <dir>\]$/m;
  const cases: [string[], RegExp][] = [
    [["--cells", "p2:high:1"], /^error: --cells names p2:high:1, which is not a cell of the roster \(prompts 1, 5, 6, 7 at high and medium, runs 1 and 2\)$/m],
    [["--cells", "p1:high:3"], /^error: --cells names p1:high:3, which is not a cell of the roster /m],
    [["--cells", "p1:low:1"], /^error: --cells entry 'p1:low:1' is not p<prompt>:<capability>:<run>$/m],
    [["--cells", "p1:high"], /^error: --cells entry 'p1:high' is not p<prompt>:<capability>:<run>$/m],
    [["--cells", "p1:high:1,,p5:high:1"], /^error: --cells entry '' is not p<prompt>:<capability>:<run>$/m],
    [["--cells", "p1:high:1,1:high:1"], /^error: --cells names p1:high:1 twice$/m],
    [["--cells"], usage],
    [["--parallel", "9"], /^error: --parallel 9 is above 8; each cell takes a core and 1 to 2 GB, so pass --force-parallel to run more than 8 at once$/m],
    [["--parallel", "0"], /^error: --parallel takes a whole number from 1, not '0'$/m],
    [["--parallel", "two"], /^error: --parallel takes a whole number from 1, not 'two'$/m],
    [["--fast"], usage],
  ];
  for (const [args, want] of cases) {
    const s = tracked();
    const r = launch(s, args);
    assert.equal(r.status, 1, `${args.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, want, args.join(" "));
    assert.ok(!existsSync(join(s.dir, "keyring-calls.txt")), `${args.join(" ")} read the keyring`);
    assert.deepEqual(events(s), []);
  }
  const s = tracked();
  const r = spawnSync(process.execPath, [LAUNCHER, "stage-two", "--publish-root", s.root], { cwd: ROOT, env: s.env, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, usage);
  assert.ok(!existsSync(join(s.dir, "keyring-calls.txt")));
});

test("--force-parallel lets --parallel go above 8", { skip: SKIP }, () => {
  const s = tracked({ FMEA_STUB_SLOW: "0.05", FMEA_STUB_FAST: "0.05" });
  const r = launch(s, ["--parallel", "9", "--force-parallel", "--no-canary", "--cells", "p1:high:1"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readRound(s).concurrency, 9);
});

test("a cell whose run folder already holds a transcript is refused before the keyring is read", { skip: SKIP }, () => {
  const s = tracked();
  mkdirSync(join(s.root, "p6", "high", "run1"), { recursive: true });
  writeFileSync(join(s.root, "p6", "high", "run1", "transcript.json"), "{}\n");
  const r = launch(s, []);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`error: ${join(s.root, "p6", "high", "run1")} already holds a transcript; delete the folder to re-run the cell\n`), r.stderr);
  assert.ok(!existsSync(join(s.dir, "keyring-calls.txt")));
  assert.deepEqual(events(s), []);
});

test("without the key the launcher refuses before claude and the runner are reached", { skip: SKIP }, () => {
  const cases: Record<string, string>[] = [
    { FMEA_STUB_SECRET: "" },
    { FMEA_STUB_SECRET: '{"OTHER":"x"}' },
    { FMEA_STUB_SECRET: "not json" },
    { FMEA_STUB_SECRET: '{"DEEPSEEK_API_KEY":""}' },
    { FMEA_STUB_KEYRING_EXIT: "1", FMEA_STUB_SECRET: "" },
  ];
  for (const env of cases) {
    const s = tracked(env);
    const r = launch(s, []);
    assert.equal(r.status, 1, JSON.stringify(env));
    assert.match(r.stderr, /^NO KEY: refusing$/m);
    assert.ok(existsSync(join(s.dir, "keyring-calls.txt")), "the keyring stub was not asked");
    assert.ok(!existsSync(join(s.dir, "claude-calls.txt")), "claude was reached without a key");
    assert.deepEqual(events(s), []);
  }
});

test("a smoke reply that is not ok, or a failed smoke call, refuses the round with the reply redacted, the key and its last four characters never printed", { skip: SKIP }, () => {
  const cases: Record<string, string>[] = [
    { FMEA_STUB_SMOKE: `API Error: 401 invalid key ${KEY} (ends ${TAIL})` },
    { FMEA_STUB_SMOKE: `ok ${TAIL}`, FMEA_STUB_SMOKE_EXIT: "1" },
  ];
  for (const env of cases) {
    const s = tracked(env);
    const r = launch(s, []);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^refusing: the gateway did not answer with 'ok'; fix the key or the endpoint before running the round$/m);
    assert.match(r.stderr, /^smoke reply \(exit \d, redacted\): .*<key-tail>/m);
    for (const out of [r.stdout, r.stderr]) {
      assert.ok(!out.includes(KEY), "the key was printed");
      assert.ok(!out.includes(TAIL), "the key's last four characters were printed");
    }
    assert.deepEqual(events(s), []);
    const config = readFileSync(join(s.dir, "smoke-config.txt"), "utf8").trim();
    assert.ok(config.startsWith(s.tmp + "/") && !existsSync(config), `the smoke config folder ${config} survived or lay outside TMPDIR`);
  }
});

test("node or claude missing from PATH is refused before the runner is reached", { skip: SKIP }, () => {
  const s = tracked();
  const bare = mkdtempSync(join(s.dir, "bare-"));
  writeExecutable(join(bare, "secret-tool"), REAL_KEYRING_GUARD);
  const r = launch({ ...s, env: { ...s.env, PATH: `${bare}:${dirname(process.execPath)}:/usr/bin:/bin` } }, []);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^refusing: claude is not on PATH$/m);
  assert.deepEqual(events(s), []);
  // Where the system folders hold a node of their own, PATH cannot be made to lack one.
  if (existsSync("/usr/bin/node") || existsSync("/bin/node")) return;
  const t = tracked();
  const u = launch({ ...t, env: { ...t.env, PATH: `${t.dir}/bin:/usr/bin:/bin` } }, []);
  assert.equal(u.status, 1, u.stderr);
  assert.match(u.stderr, /^refusing: node is not on PATH$/m);
  assert.deepEqual(events(t), []);
});

test("nvm's newest node goes first on PATH, by version and not by name", { skip: SKIP }, () => {
  const s = tracked({ FMEA_STUB_SLOW: "0.05" });
  for (const v of ["v9.11.2", "v10.0.0"]) {
    mkdirSync(join(s.nvm, "versions", "node", v, "bin"), { recursive: true });
    writeExecutable(join(s.nvm, "versions", "node", v, "bin", "node"), `#!/usr/bin/env bash\necho ${v}\n`);
  }
  const r = launch(s, ["--no-canary", "--cells", "p1:high:1"]);
  assert.equal(r.status, 0, r.stderr);
  const bin = join(s.nvm, "versions", "node", "v10.0.0", "bin");
  assert.match(r.stdout, new RegExp(`^node=${escaped(bin)}/node \\(v10\\.0\\.0\\)$`, "m"));
  assert.match(readFileSync(join(s.dir, "env-p1:high:1.txt"), "utf8"), new RegExp(`^path0=${escaped(bin)}$`, "m"));
});

test("a re-run of named cells into a round that has a round.json replaces those cells' entries and keeps the round's own fields", { skip: SKIP }, () => {
  const s = tracked({ FMEA_STUB_FAST: "0.05" });
  mkdirSync(s.root, { recursive: true });
  const cell = (id: string) => ({ cell: id, started: "2026-10-14T08:01:00.000Z", ended: "2026-10-14T08:15:00.000Z", exit: 0, summary: `${id} line` });
  const original = { method: "parallel", concurrency: 4, canary: "p1:high:1", started: "2026-10-14T08:00:00.000Z", ended: "2026-10-14T08:21:04.000Z", cli_version: "2.1.300", cells: ROSTER.map(cell) };
  writeFileSync(join(s.root, "round.json"), JSON.stringify(original, null, 2));
  const r = launch(s, ["--no-canary", "--cells", "p5:high:2", "--parallel", "2"]);
  assert.equal(r.status, 0, r.stderr);
  const round = readRound(s);
  assert.deepEqual({ ...round, cells: [] }, { ...original, cells: [] });
  assert.deepEqual(round.cells.map((c) => c.cell), ROSTER);
  const rerun = round.cells.find((c) => c.cell === "p5:high:2");
  assert.ok(rerun !== undefined && rerun.summary !== null && rerun.summary.startsWith("p5 high run2: model=deepseek-flash "), JSON.stringify(rerun));
  assert.ok(Date.parse(rerun.started) > Date.parse(original.ended));
  assert.deepEqual(round.cells.filter((c) => c.cell !== "p5:high:2"), original.cells.filter((c) => c.cell !== "p5:high:2"));

  writeFileSync(join(s.root, "round.json"), "{ not a record");
  const u = launch(s, ["--no-canary", "--cells", "p5:high:1"]);
  assert.equal(u.status, 1, u.stderr);
  assert.ok(u.stderr.includes(`error: ${join(s.root, "round.json")} is not a round record; move it aside before re-running cells into this round\n`), u.stderr);
  assert.ok(!startsOf(s).includes("p5:high:1"));
});

test("SIGINT stops the round: every running cell gets SIGTERM, the launcher exits 130, and the finished cells' folders stay", { skip: SKIP }, async () => {
  const s = tracked({ FMEA_STUB_HANG: "1", FMEA_STUB_SLOW: "0.05" });
  const child = spawn(process.execPath, [LAUNCHER, "9z", "--publish-root", s.root, "--parallel", "3"], { cwd: ROOT, env: s.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  const closed = new Promise<number | null>((done) => child.on("close", (code) => done(code)));
  // The three fan-out stubs are waiting on their sleeps once each has written the sleep's pid.
  const sleepers = (): Map<string, number> => new Map(readdirSync(s.dir).filter((n) => /^sleep-.*\.txt$/.test(n)).flatMap((n) => {
    const pid = Number(readFileSync(join(s.dir, n), "utf8"));
    return pid > 0 ? [[n.slice("sleep-".length, -".txt".length), pid] as [string, number]] : [];
  }));
  const deadline = Date.now() + 20_000;
  while (sleepers().size < 3 && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50));
  assert.equal(sleepers().size, 3, "the fan-out never had three cells waiting");
  child.kill("SIGINT");
  const began = Date.now();
  assert.equal(await closed, 130);
  assert.ok(Date.now() - began < 10_000, "the launcher waited for the hanging cells instead of terminating them");
  assert.equal(startsOf(s).length, 4, "a cell started after the signal");
  const hung = events(s).filter((e) => e.kind === "start" && e.cell !== "p1:high:1");
  for (const e of hung) {
    assert.ok(await gone(e.pid), `${e.cell}'s stub ${e.pid} is still alive`);
    const sleeper = sleepers().get(e.cell);
    assert.ok(sleeper !== undefined && await gone(sleeper), `${e.cell}'s sleep ${sleeper} is still alive: the stub's process group was not signalled`);
  }
  assert.ok(existsSync(join(s.root, "p1", "high", "run1", "transcript.json")), "the canary's folder was removed");
  assert.match(stdout, /^round interrupted: 3 running cells were sent SIGTERM; the finished cells' folders are in place under /m);
  const stopped = new Set(hung.map((e) => e.cell));
  assert.deepEqual(readRound(s).cells.map((c) => [c.cell, c.exit]), [["p1:high:1", 0], ...ROSTER.filter((c) => stopped.has(c)).map((c) => [c, null])]);
});

test("redact replaces the key and its last four characters and collapses whitespace; the smoke check takes ok alone", () => {
  assert.equal(redact(`a ${KEY}\n  b ${TAIL}\tc`, KEY), "a <key> b <key-tail> c");
  assert.equal(redact("nothing  to hide", ""), "nothing to hide");
  for (const yes of ["ok", "OK.", "  Ok\n", "**ok**"]) assert.ok(isOkReply(yes), yes);
  for (const no of ["", "not ok", "looks fine", "ok, but", "token"]) assert.ok(!isOkReply(no), no);
});
