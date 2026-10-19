// tools/run-round.ts <stage> [--parallel <n>] [--force-parallel] [--cells p<prompt>:<capability>:<run>,...] [--no-canary] [--publish-root <dir>]
//
// One sixteen-run eval round of the prose evals (prose design 2026-10-14, §8.1)
// on DeepSeek Flash through the Anthropic-compatible gateway, run in parallel
// rather than one cell after another (§11.5 ruling 10: built while round 1b ran;
// used from round 1c on, §11.6). The roster is the sequential script's:
// prompts 1, 5, 6 and 7 at high and medium, runs 1 and 2, in that order. Each
// cell is one tools/run-eval.sh child, which already gives a run its own
// working, plugin and config folders, its own /autocompact probe and its own
// publish folder, so cells share nothing but the gateway.
//
//   node tools/run-round.ts 2                        the whole round, four at once
//   node tools/run-round.ts 2 --parallel 6           six at once
//   node tools/run-round.ts 2 --no-canary --cells p5:high:2,p6:medium:1
//                                                    a re-run of named cells
//
// The same command works in bash and fish, and `bun tools/run-round.ts …` works
// too. The steps:
//
// 1. Preflight, as the sequential script does. The DeepSeek key is read from
//    the login keyring (`secret-tool search --all service goose`, the JSON
//    field DEEPSEEK_API_KEY) and is never printed or written; with no key the
//    launch is refused. The children's environment is the launcher's own less
//    every variable whose name starts with CLAUDE, so a launch from inside a
//    Claude Code session hands its cells and its smoke call none of the
//    session's CLAUDECODE, CLAUDE_CODE_* or CLAUDE_EFFORT (§11.6, carried
//    items; the sequential rounds inherited them); one line says how many were
//    dropped, and round.json names them. It gets ANTHROPIC_BASE_URL,
//    ANTHROPIC_AUTH_TOKEN, FMEA_EVAL_MODELS and DISABLE_AUTOUPDATER=1, and nvm's
//    newest node goes first on PATH ($NVM_DIR, or ~/.nvm). node and claude must
//    be on PATH; their paths and the CLI version are printed. One cheap call
//    through the gateway, under a fresh CLAUDE_CONFIG_DIR that is removed after,
//    must answer `ok`; otherwise its reply is printed with the key and its last
//    four characters replaced, and the launch is refused. Before any of this, a
//    cell whose run folder already holds a transcript is refused, as
//    tools/run-eval.sh would refuse it after the canary.
// 2. The canary: the first cell runs alone to the end. A canary that refuses or
//    ends with an artefact missing stops the round, the sequential script's
//    first-refusal guard kept. --no-canary skips it, for a re-run of named cells.
// 3. The fan-out: the other cells, at most --parallel at once (4 by default;
//    above 8 only with --force-parallel, since each session takes a core and 1
//    to 2 GB). Each child's stdout and stderr are appended to
//    <root>/logs/p<p>-<cap>-run<n>.log after a dated separator line, so a
//    re-run keeps the earlier attempt's log (ruling 1 counts a second cut-off
//    as a failure). A child gets the environment of step 1, the repository root
//    as its working folder, no stdin and a process group of its own, so the
//    controlling terminal's signals reach the launcher alone.
// 4. The output: the summary lines in roster order once all are in, then a
//    `round finished` line with the elapsed time, the concurrency and the
//    canary, then the run folders. Exit 0 when every line shows every artefact
//    present, validate_exit=0 and final=complete; otherwise exit 1 after naming
//    the cells to re-run and the --cells command that re-runs them.
// 5. The record: <root>/round.json (tools/lib/round-record.ts), which
//    tools/eval-report.ts reads for its Harness section. A --cells launch into a
//    round that has one replaces those cells' entries and keeps the round's own
//    fields, adding the names it stripped to a round's env_stripped; a round
//    recorded without that field keeps none, its other cells having inherited
//    the variables.
// 6. Signals: on SIGINT, SIGTERM or SIGHUP, from the smoke call on, every
//    process group the launch started gets SIGTERM. The launcher then waits
//    until every group is gone, the claude sessions under a runner included,
//    for up to 30 seconds, and sends SIGKILL to the groups that remain; only
//    then does it write round.json and exit 130, even when its own stdout or
//    stderr died with the signal: a line it cannot write is dropped. The
//    finished cells' folders stay in place, and the smoke call's config folder
//    is removed. A cell that meets the SIGKILL runs no cleanup: its
//    fmea-eval-*, fmea-plugin-* and fmea-config-* folders stay under $TMPDIR
//    (/tmp when unset), to be removed by hand.
//
// The publish root is build/evals/prose-<stage>/ unless --publish-root names
// another folder. FMEA_RUN_EVAL names another one-cell runner, FMEA_SECRET_TOOL
// another keyring command and FMEA_ROUND_GRACE_MS another grace period in
// milliseconds, so tools/run-round.test.ts can run the launcher on stubs and
// never read the real keyring.

import { spawn, spawnSync, type ChildProcess, type StdioOptions } from "node:child_process";
import { accessSync, appendFileSync, closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { isEntry } from "./lib/entry.ts";
import { compareVersions, parseVersion } from "./lib/host.ts";
import { cellWords, elapsedText, readRoundRecord, strippedText, type RoundCell, type RoundRecord } from "./lib/round-record.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL = "deepseek-flash";
const GATEWAY = "https://api.deepseek.com/anthropic";
const DEFAULT_PARALLEL = 4;
const MAX_PARALLEL = 8;
const GRACE_MS = 30_000;
const SMOKE_TIMEOUT_MS = 300_000;
const POLL_MS = 100;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const USAGE = "usage: node tools/run-round.ts <stage> [--parallel <n>] [--force-parallel] [--cells p<prompt>:<capability>:<run>,...] [--no-canary] [--publish-root <dir>]";
const VALUE_FLAGS = ["--parallel", "--cells", "--publish-root"];
const SWITCHES = ["--force-parallel", "--no-canary"];

/** One cell of the roster: a prompt at a model capability, one run of it. */
interface Cell { prompt: number; capability: string; run: number }

const ROSTER: Cell[] = [1, 5, 6, 7].flatMap((prompt) =>
  ["high", "medium"].flatMap((capability) => [1, 2].map((run) => ({ prompt, capability, run }))));

/** The fields a finished cell's summary line must carry, in the line's order, and the value each must have. */
const CLEAN: [string, string][] = [
  ["analysis", "present"], ["report", "present"], ["validate_exit", "0"],
  ["invocations", "present"], ["context", "present"], ["final", "complete"],
];

function cellId(c: Cell): string {
  return `p${c.prompt}:${c.capability}:${c.run}`;
}

function summaryPrefix(c: Cell): string {
  return `${cellWords(cellId(c))}: `;
}

function runDir(root: string, c: Cell): string {
  return join(root, `p${c.prompt}`, c.capability, `run${c.run}`);
}

/**
 * Writes a line, dropping it when the stream has died: a terminal window that
 * closed, or a pipe whose reader died with the signal, as `| tee log` does on
 * Ctrl-C. Writes on such a stream fail, and the launcher must still wait for
 * the groups and write round.json (step 6).
 */
function write(stream: NodeJS.WriteStream, line: string): void {
  try {
    stream.write(`${line}\n`);
  } catch {
    // the stream has died; the line is dropped
  }
}

/** A dead stdout or stderr reports its failed writes as an 'error' event, which would end the launcher unheard; this listener drops them. */
function ignoreDeadOutput(): void {
  for (const stream of [process.stdout, process.stderr]) stream.on("error", () => undefined);
}

function say(line: string): void {
  write(process.stdout, line);
}

/** Prints a refusal on stderr and returns the exit status 1. */
function refuse(line: string): 1 {
  write(process.stderr, line);
  return 1;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** What the command line asks for. */
interface Options {
  stage: string;
  parallel: number;
  /** The cells to run, in roster order. */
  cells: Cell[];
  cellsGiven: boolean;
  canary: boolean;
  publishRoot: string;
  /** The publish root as --publish-root gave it, resolved, or null for the default. */
  publishRootGiven: string | null;
}

/** The flags after the stage, or null for an unknown flag or a value flag with no value. */
function readFlags(rest: string[]): Map<string, string> | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (SWITCHES.includes(flag)) {
      flags.set(flag, "");
    } else if (VALUE_FLAGS.includes(flag) && value !== undefined) {
      flags.set(flag, value);
      i++;
    } else {
      return null;
    }
  }
  return flags;
}

/** --parallel's value, or the refusal. */
function parseParallel(text: string, force: boolean): number | string {
  if (!/^[1-9][0-9]*$/.test(text)) return `error: --parallel takes a whole number from 1, not '${text}'`;
  const n = Number(text);
  if (n > MAX_PARALLEL && !force) {
    return `error: --parallel ${n} is above ${MAX_PARALLEL}; each cell takes a core and 1 to 2 GB, so pass --force-parallel to run more than ${MAX_PARALLEL} at once`;
  }
  return n;
}

/** --cells' cells in roster order, or the refusal: an entry that is not p<prompt>:<capability>:<run>, a cell outside the roster, or one named twice. */
function parseCells(text: string): Cell[] | string {
  const named = new Set<string>();
  for (const entry of text.split(",")) {
    const m = /^p?(\d+):(high|medium):(\d+)$/.exec(entry);
    if (m === null) return `error: --cells entry '${entry}' is not p<prompt>:<capability>:<run>`;
    const id = `p${Number(m[1])}:${m[2]}:${Number(m[3])}`;
    if (!ROSTER.some((c) => cellId(c) === id)) {
      return `error: --cells names ${id}, which is not a cell of the roster (prompts 1, 5, 6, 7 at high and medium, runs 1 and 2)`;
    }
    if (named.has(id)) return `error: --cells names ${id} twice`;
    named.add(id);
  }
  return ROSTER.filter((c) => named.has(cellId(c)));
}

/** The options, or the line that refuses them. */
function parseArgs(argv: string[]): Options | string {
  const [stage, ...rest] = argv;
  const flags = readFlags(rest);
  if (stage === undefined || !/^[0-9][a-z]?$/.test(stage) || flags === null) return USAGE;
  const parallel = parseParallel(flags.get("--parallel") ?? String(DEFAULT_PARALLEL), flags.has("--force-parallel"));
  if (typeof parallel === "string") return parallel;
  const cellsText = flags.get("--cells");
  const cells = cellsText === undefined ? ROSTER : parseCells(cellsText);
  if (typeof cells === "string") return cells;
  const given = flags.get("--publish-root");
  const publishRootGiven = given === undefined ? null : resolve(given);
  return {
    stage, parallel, cells, cellsGiven: cellsText !== undefined, canary: !flags.has("--no-canary"),
    publishRoot: publishRootGiven ?? join(ROOT, "build", "evals", `prose-${stage}`), publishRootGiven,
  };
}

function roundFile(opts: Options): string {
  return join(opts.publishRoot, "round.json");
}

/** Why the launch cannot go ahead before the keyring is read, or null: a run folder already holding a transcript, or a --cells launch into an unreadable round.json. */
function guardProblem(opts: Options): string | null {
  const taken = opts.cells.map((c) => runDir(opts.publishRoot, c)).find((d) => existsSync(join(d, "transcript.json")));
  if (taken !== undefined) return `error: ${taken} already holds a transcript; move the folder out of ${opts.publishRoot} to re-run the cell`;
  if (opts.cellsGiven && readRoundRecord(roundFile(opts)) === "unreadable") {
    return `error: ${roundFile(opts)} is not a round record; move it aside before re-running cells into this round`;
  }
  return null;
}

/** The DeepSeek key from the first `secret = ` line whose JSON carries it, or "" when none does; the command's exit status is not read. */
function readKey(env: NodeJS.ProcessEnv): string {
  const r = spawnSync(env.FMEA_SECRET_TOOL ?? "secret-tool", ["search", "--all", "service", "goose"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.startsWith("secret = ")) continue;
    const key = keyOf(line.slice("secret = ".length));
    if (key !== "") return key;
  }
  return "";
}

function keyOf(json: string): string {
  try {
    const parsed: unknown = JSON.parse(json);
    const key = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).DEEPSEEK_API_KEY : undefined;
    return typeof key === "string" ? key : "";
  } catch {
    return "";
  }
}

/** Text with the key and its last four characters replaced and whitespace runs collapsed, as the sequential script's redact() treats a reply. */
export function redact(text: string, key: string): string {
  let out = text;
  if (key !== "") {
    out = out.split(key).join("<key>");
    if (key.length >= 4) out = out.split(key.slice(-4)).join("<key-tail>");
  }
  return out.split(/\s+/).filter((w) => w !== "").join(" ");
}

/** Whether the smoke call's reply is the word ok alone, in any case, with punctuation around it at most. */
export function isOkReply(text: string): boolean {
  return /^\W*ok\W*$/i.test(text.trim());
}

/** nvm's newest node bin folder by version, or null when nvm holds none. */
function newestNvmBin(nvmDir: string): string | null {
  const versions = join(nvmDir, "versions", "node");
  let names: string[];
  try {
    names = readdirSync(versions);
  } catch {
    return null;
  }
  const newest = names
    .flatMap((name) => {
      const version = parseVersion(name);
      return version !== null && name.startsWith("v") && existsSync(join(versions, name, "bin")) ? [{ name, version }] : [];
    })
    .sort((a, b) => compareVersions(a.version, b.version))
    .pop();
  return newest === undefined ? null : join(versions, newest.name, "bin");
}

/** The first executable file of that name on PATH, or null. */
function onPath(name: string, path: string): string | null {
  for (const dir of path.split(delimiter).filter((d) => d !== "")) {
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      // not here; the next folder
    }
  }
  return null;
}

/** The first line of a command's output, stdout before stderr. */
function firstLine(command: string, args: string[], env: Record<string, string>): string {
  const r = spawnSync(command, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n")[0].trim();
}

/**
 * The environment of step 1 and the names it dropped, sorted: the launcher's own less every variable whose name starts
 * with CLAUDE, then the gateway and the model table, the updater off, nvm's newest node first on PATH.
 */
function roundEnv(key: string, publishRoot: string): { env: Record<string, string>; stripped: string[] } {
  const env: Record<string, string> = {};
  const stripped: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("CLAUDE")) stripped.push(name);
    else if (value !== undefined) env[name] = value;
  }
  const nvmBin = newestNvmBin(env.NVM_DIR ?? join(homedir(), ".nvm"));
  return {
    env: {
      ...env,
      PATH: nvmBin === null ? env.PATH ?? "" : `${nvmBin}${delimiter}${env.PATH ?? ""}`,
      ANTHROPIC_BASE_URL: GATEWAY,
      ANTHROPIC_AUTH_TOKEN: key,
      FMEA_EVAL_MODELS: `high=${MODEL},medium=${MODEL}`,
      DISABLE_AUTOUPDATER: "1",
      FMEA_EVAL_PUBLISH_ROOT: publishRoot,
    },
    stripped: stripped.sort(),
  };
}

/**
 * The launch's watch over its children and the signals: every process group it
 * started and has not yet seen gone (each child leads its own), how many cells
 * are running, and, once a signal came, how many were running then and the
 * promise that settles when every group is gone or SIGKILL went to the rest.
 */
interface Watch {
  stopping: boolean;
  groups: Set<number>;
  cells: number;
  stoppedCells: number;
  drained: Promise<void>;
  graceMs: number;
}

/** Sends a signal to a process group, 0 to ask whether it has a member left; false when it has none. */
function signalGroup(group: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-group, signal);
    return true;
  } catch {
    // ESRCH: the group has no member left. EPERM, which a group of this launch's own children does not raise, counts as gone too.
    return false;
  }
}

/** Sends a signal to every group of the set, forgets the groups that are gone (a Set may lose its current entry while iterated), and returns how many remain. */
function signalGroups(groups: Set<number>, signal: NodeJS.Signals | 0): number {
  for (const group of groups) if (!signalGroup(group, signal)) groups.delete(group);
  return groups.size;
}

/** SIGTERM to every group, then a wait until each is gone or the grace period ends, then SIGKILL to the groups that remain. */
async function drain(watch: Watch): Promise<void> {
  const deadline = Date.now() + watch.graceMs;
  signalGroups(watch.groups, "SIGTERM");
  while (signalGroups(watch.groups, 0) > 0 && Date.now() < deadline) await pause(POLL_MS);
  signalGroups(watch.groups, "SIGKILL");
}

/** The grace period: FMEA_ROUND_GRACE_MS when it is a whole number of milliseconds, otherwise 30 seconds. */
function graceMs(): number {
  const text = process.env.FMEA_ROUND_GRACE_MS;
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : GRACE_MS;
}

/** Installs the handlers of step 6 and returns the watch they act on. */
function watchSignals(): Watch {
  const watch: Watch = { stopping: false, groups: new Set(), cells: 0, stoppedCells: 0, drained: Promise.resolve(), graceMs: graceMs() };
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      if (watch.stopping) return;
      watch.stopping = true;
      watch.stoppedCells = watch.cells;
      watch.drained = drain(watch);
    });
  }
  return watch;
}

/** How a child ended: its exit status, or null with the signal that ended it or the error that kept it from running. */
interface Ended { code: number | null; signal: NodeJS.Signals | null; error: string | null }

/**
 * Starts a command as the leader of a process group of its own, which the
 * watch records, and resolves when it has ended; the group is forgotten then
 * unless a member outlives the leader. `started` sees the child first.
 */
function spawnInGroup(watch: Watch, command: string, args: string[], options: { env: Record<string, string>; stdio: StdioOptions; cwd?: string }, started?: (child: ChildProcess) => void): Promise<Ended> {
  return new Promise((done) => {
    let settled = false;
    let group: number | undefined;
    const finish = (ended: Ended): void => {
      if (settled) return;
      settled = true;
      if (group !== undefined && !signalGroup(group, 0)) watch.groups.delete(group);
      done(ended);
    };
    try {
      const child = spawn(command, args, { ...options, detached: true });
      group = child.pid;
      if (group !== undefined) watch.groups.add(group);
      started?.(child);
      child.once("error", (err) => finish({ code: null, signal: null, error: err.message }));
      child.once("close", (code, signal) => finish({ code, signal, error: null }));
    } catch (err) {
      finish({ code: null, signal: null, error: errorText(err) });
    }
  });
}

/** The smoke call's end and its stdout and stderr; SIGKILL to its group when it outlasts the timeout. */
async function smokeCall(watch: Watch, claude: string, env: Record<string, string>): Promise<{ ended: Ended; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  let timer: NodeJS.Timeout | undefined;
  const ended = await spawnInGroup(watch, claude, ["-p", "Reply with the single word ok.", "--model", MODEL, "--max-turns", "1", "--no-session-persistence"], { env, stdio: ["ignore", "pipe", "pipe"] }, (child) => {
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    const group = child.pid;
    if (group !== undefined) timer = setTimeout(() => signalGroup(group, "SIGKILL"), SMOKE_TIMEOUT_MS);
  });
  clearTimeout(timer);
  return { ended, stdout, stderr };
}

/**
 * One cheap call through the gateway under a fresh config folder, removed on
 * every path, a signal's included: 0 when it exits 0 and answers ok; 130 after
 * a signal; otherwise 1 after printing the reply's last lines redacted and the
 * refusal.
 */
async function smokeTest(watch: Watch, claude: string, env: Record<string, string>, key: string): Promise<number> {
  say("smoke testing the gateway...");
  const config = mkdtempSync(join(tmpdir(), "fmea-smoke-config-"));
  let smoke: Awaited<ReturnType<typeof smokeCall>>;
  try {
    smoke = await smokeCall(watch, claude, { ...env, CLAUDE_CONFIG_DIR: config });
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
  if (watch.stopping) return 130;
  if (smoke.ended.code === 0 && isOkReply(smoke.stdout)) {
    say("gateway answered");
    return 0;
  }
  const reply = `${smoke.stdout}${smoke.stderr}${smoke.ended.error ?? ""}`.trimEnd().split("\n").slice(-5).join("\n");
  refuse(`smoke reply (exit ${smoke.ended.code ?? smoke.ended.signal ?? "none"}, redacted): ${redact(reply, key)}`);
  return refuse("refusing: the gateway did not answer with 'ok'; fix the key or the endpoint before running the round");
}

/** What the preflight hands the round: the children's environment and the names it dropped, the key for redaction, the CLI version and the watch. */
interface Preflight { env: Record<string, string>; stripped: string[]; key: string; cliVersion: string; watch: Watch }

/** Step 1, or the exit status after printing why the launch stops. */
async function preflight(opts: Options): Promise<Preflight | number> {
  const key = readKey(process.env);
  if (key === "") return refuse("NO KEY: refusing");
  const { env, stripped } = roundEnv(key, opts.publishRoot);
  say(`env: ${strippedText(stripped.length)}`);
  const node = onPath("node", env.PATH);
  if (node === null) return refuse("refusing: node is not on PATH");
  const claude = onPath("claude", env.PATH);
  if (claude === null) return refuse("refusing: claude is not on PATH");
  say(`node=${node} (${redact(firstLine(node, ["-v"], env), key)})`);
  say(`claude=${claude}`);
  const version = redact(firstLine(claude, ["--version"], env), key);
  say(`claude_version=${version}`);
  const watch = watchSignals();
  const smoke = await smokeTest(watch, claude, env, key);
  if (smoke === 130) {
    await watch.drained;
    say("round interrupted during the smoke call; no cell was started");
  }
  return smoke === 0 ? { env, stripped, key, cliVersion: version.split(" ")[0], watch } : smoke;
}

/** The state the cells share: what they run with, where they log, and the watch. */
interface Round { opts: Options; pre: Preflight; runner: string; logs: string; watch: Watch }

/** A finished cell: the cell, its record and its log. */
interface CellRun { cell: Cell; record: RoundCell; log: string }

function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Starts the runner for one cell, its stdout and stderr appended to its log, and resolves when it has ended. */
function startRunner(round: Round, cell: Cell, log: string): Promise<Ended> {
  const fd = openSync(log, "a");
  try {
    return spawnInGroup(round.watch, round.runner, [String(cell.prompt), cell.capability, String(cell.run)], { cwd: ROOT, env: round.pre.env, stdio: ["ignore", fd, fd] });
  } finally {
    closeSync(fd);
  }
}

/** One attempt at a cell after its separator line: how the runner ended, or why the launcher could not run it. */
async function attempt(round: Round, cell: Cell, log: string, separator: string): Promise<Ended> {
  try {
    appendFileSync(log, `${separator}\n`);
    round.watch.cells++;
    try {
      return await startRunner(round, cell, log);
    } finally {
      round.watch.cells--;
    }
  } catch (err) {
    return { code: null, signal: null, error: errorText(err) };
  }
}

/** The last summary line the cell's runner wrote to its log after this attempt's separator, redacted, or null. */
function summaryOf(log: string, cell: Cell, separator: string, key: string): string | null {
  let text = "";
  try {
    text = readFileSync(log, "utf8");
  } catch {
    return null;
  }
  const at = text.lastIndexOf(`${separator}\n`);
  if (at === -1) return null;
  const line = text.slice(at).split("\n").filter((l) => l.startsWith(`${summaryPrefix(cell)}model=`)).pop();
  return line === undefined ? null : redact(line, key);
}

/** Runs one cell to its end and returns its record; an error of the launcher's own is recorded in the cell's entry, never thrown. */
async function runCell(round: Round, cell: Cell): Promise<CellRun> {
  const log = join(round.logs, `p${cell.prompt}-${cell.capability}-run${cell.run}.log`);
  const started = new Date().toISOString();
  const separator = `--- run-round ${started}: ${cellId(cell)} ---`;
  say(`[${clock()}] started ${cellId(cell)}`);
  const ended = await attempt(round, cell, log, separator);
  say(`[${clock()}] ended ${cellId(cell)} (exit ${ended.code ?? ended.signal ?? "none"})`);
  const record: RoundCell = { cell: cellId(cell), started, ended: new Date().toISOString(), exit: ended.code, summary: summaryOf(log, cell, separator, round.pre.key) };
  if (ended.error !== null) record.error = redact(ended.error, round.pre.key);
  return { cell, log, record };
}

/** What keeps a cell from being clean; `stops` marks what stops the round when the canary has it: a refusal or an artefact missing. */
interface Problem { text: string; stops: boolean }

function problemsOf(r: RoundCell): Problem[] {
  const problems: Problem[] = [];
  if (r.exit !== 0) problems.push({ text: r.exit === null ? "no exit status" : `exit ${r.exit}`, stops: true });
  if (r.summary === null) return [...problems, { text: "no summary line", stops: true }];
  const fields = new Map([...r.summary.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
  for (const [name, want] of CLEAN) {
    const got = fields.get(name);
    if (got === undefined) problems.push({ text: `no ${name} field`, stops: true });
    else if (got !== want) problems.push({ text: `${name}=${got}`, stops: got === "missing" });
  }
  return problems;
}

function problemText(problems: Problem[]): string {
  return problems.map((p) => p.text).join(", ");
}

/** Runs the items with at most `limit` at once, starting none once `stopped` holds, and resolves with the results in the items' order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>, stopped: () => boolean): Promise<R[]> {
  const results: (R | undefined)[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !stopped()) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.filter((r): r is R => r !== undefined);
}

/**
 * round.json: this launch's record, or, for a --cells launch into a round that has one, that record with these cells'
 * entries replaced and the names this launch stripped added to its env_stripped, when it has one.
 */
function writeRecord(round: Round, started: Date, ended: Date, runs: CellRun[]): void {
  const { opts, pre } = round;
  const cells = runs.map((r) => r.record);
  const prior = opts.cellsGiven ? readRoundRecord(roundFile(opts)) : "missing";
  const record: RoundRecord = typeof prior === "string"
    ? { method: "parallel", concurrency: opts.parallel, canary: opts.canary ? cellId(opts.cells[0]) : null, started: started.toISOString(), ended: ended.toISOString(), cli_version: pre.cliVersion, env_stripped: pre.stripped, cells }
    : mergedRecord(prior, pre.stripped, cells);
  writeFileSync(roundFile(opts), `${JSON.stringify(record, null, 2)}\n`);
}

/** A round's record with these cells' entries replaced and, when it names the variables its launch stripped, this launch's added. */
function mergedRecord(prior: RoundRecord, stripped: string[], cells: RoundCell[]): RoundRecord {
  const merged: RoundRecord = { ...prior, cells: mergedCells(prior.cells, cells) };
  if (prior.env_stripped !== undefined) merged.env_stripped = [...new Set([...prior.env_stripped, ...stripped])].sort();
  return merged;
}

function mergedCells(prior: RoundCell[], fresh: RoundCell[]): RoundCell[] {
  const byId = new Map(prior.map((c) => [c.cell, c]));
  for (const c of fresh) byId.set(c.cell, c);
  const place = (id: string): number => {
    const i = ROSTER.findIndex((c) => cellId(c) === id);
    return i === -1 ? ROSTER.length : i;
  };
  return [...byId.values()].sort((a, b) => place(a.cell) - place(b.cell));
}

function summaryText(r: CellRun): string {
  const why = r.record.error === undefined ? `exit ${r.record.exit ?? "none"}` : `launcher error: ${r.record.error}`;
  return r.record.summary ?? `${summaryPrefix(r.cell)}no summary line (${why}); log ${r.log}`;
}

/** Every folder under the publish root that holds a transcript, sorted, as the sequential script lists them. */
function runFolders(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries.filter((e) => basename(e) === "transcript.json").map((e) => join(root, dirname(e))).sort();
}

/** Steps 4 and 5 after the fan-out: the lines in roster order, the round-finished line, the run folders, and the cells to re-run; 0 when every cell is clean. */
function report(round: Round, elapsed: number, runs: CellRun[]): number {
  const { opts } = round;
  for (const r of runs) say(summaryText(r));
  say("");
  say(`round finished: ${elapsedText(elapsed)}, concurrency ${opts.parallel}, canary ${opts.canary ? cellId(opts.cells[0]) : "none"}; runs under ${opts.publishRoot}:`);
  for (const dir of runFolders(opts.publishRoot)) say(dir);
  const failing = runs.map((r) => ({ r, problems: problemsOf(r.record) })).filter((x) => x.problems.length > 0);
  if (failing.length === 0) return 0;
  say("");
  say(`cells to re-run: ${failing.map((f) => `${cellId(f.r.cell)} (${problemText(f.problems)})`).join(", ")}`);
  const published = failing.map((f) => runDir(opts.publishRoot, f.r.cell)).filter((d) => existsSync(d));
  if (published.length > 0) say(`move each published folder out of ${opts.publishRoot} first, keeping it for the record: ${published.join(" ")}`);
  const root = opts.publishRootGiven === null ? "" : ` --publish-root ${opts.publishRootGiven}`;
  say(`re-run them with: node tools/run-round.ts ${opts.stage} --no-canary --cells ${failing.map((f) => cellId(f.r.cell)).join(",")}${root}`);
  return 1;
}

/** The canary alone: null when the round goes on, otherwise the exit status after saying why it stopped. */
function canaryVerdict(round: Round, canary: CellRun): number | null {
  const problems = problemsOf(canary.record);
  if (round.watch.stopping || !problems.some((p) => p.stops)) return null;
  say(summaryText(canary));
  say("");
  say(`round stopped: the canary ${cellId(canary.cell)} ended with ${problemText(problems)}; no other cell was started; log ${canary.log}`);
  const dir = runDir(round.opts.publishRoot, canary.cell);
  if (existsSync(dir)) say(`move ${dir} out of ${round.opts.publishRoot} before launching the round again`);
  return 1;
}

/** After a signal: once every group is gone or killed, the record and the line; exit 130. */
async function interrupted(round: Round, started: Date, runs: CellRun[]): Promise<number> {
  await round.watch.drained;
  writeRecord(round, started, new Date(), runs);
  const n = round.watch.stoppedCells;
  say(`round interrupted: ${n} running ${n === 1 ? "cell was" : "cells were"} sent SIGTERM; the finished cells' folders are in place under ${round.opts.publishRoot}`);
  return 130;
}

/** Steps 2 to 6. */
async function runRound(opts: Options, pre: Preflight): Promise<number> {
  const round: Round = { opts, pre, runner: process.env.FMEA_RUN_EVAL ?? join(ROOT, "tools", "run-eval.sh"), logs: join(opts.publishRoot, "logs"), watch: pre.watch };
  mkdirSync(round.logs, { recursive: true });
  const started = new Date();
  const runs: CellRun[] = [];
  let rest = opts.cells;
  if (opts.canary) {
    const canary = await runCell(round, opts.cells[0]);
    runs.push(canary);
    rest = opts.cells.slice(1);
    const stop = canaryVerdict(round, canary);
    if (stop !== null) {
      writeRecord(round, started, new Date(), runs);
      return stop;
    }
  }
  runs.push(...await pool(rest, opts.parallel, (cell) => runCell(round, cell), () => round.watch.stopping));
  if (round.watch.stopping) return interrupted(round, started, runs);
  const ended = new Date();
  writeRecord(round, started, ended, runs);
  return report(round, ended.getTime() - started.getTime(), runs);
}

async function main(argv: string[]): Promise<number> {
  ignoreDeadOutput();
  const opts = parseArgs(argv);
  const problem = typeof opts === "string" ? opts : guardProblem(opts);
  if (problem !== null || typeof opts === "string") return refuse(problem ?? USAGE);
  const pre = await preflight(opts);
  return typeof pre === "number" ? pre : runRound(opts, pre);
}

if (isEntry(import.meta)) process.exit(await main(process.argv.slice(2)));
