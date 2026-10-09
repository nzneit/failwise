// The document commands the skill text gives, run as given. SKILL.md's Scripts block lists
// priority.ts, validate.ts and render.ts in the order a run uses them, with --force on the render
// line as an optional group, and work-tracking.md rule 7 repeats validate.ts and render.ts; this
// test reads those lines, fills in their placeholders and runs them on a copy of the checkout
// fixture. The first round runs every line with its optional groups left out, as the first report
// is rendered: to a path where no file exists, without --force. The same render command run again
// must then refuse with IO_EXISTS, which is why the flag exists. The second round, after a re-score
// that changes a rating, takes the optional --force on the render line, as every re-render does.
// Any other non-zero exit fails the test. The Scripts block's update-check.ts line is also run as
// given, on a stored copy and an unchanged draft of the fixture, its placeholders filled before the
// line is split, and each heading the legacy messages name is checked against SKILL.md. No shell is
// involved: each line is split on spaces and its script started with this Node, so the test
// behaves the same under bash and fish.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKILL_DIR = join(ROOT, "skills", "fmea-software");
const FIXTURE = join(SKILL_DIR, "evals", "fixtures", "checkout-service.fmea.json");
const PREFIX = "node ${CLAUDE_SKILL_DIR}/scripts/";
const DOCUMENT_SCRIPTS = ["priority.ts", "validate.ts", "render.ts"];
const EXIT_IO = 3;

/** The lines of the first fenced block under SKILL.md's "## Scripts" heading. */
function scriptsBlock(skillMd: string): string[] {
  const afterHeading = skillMd.split(/^## Scripts$/m)[1];
  assert.ok(afterHeading !== undefined, "SKILL.md has a '## Scripts' heading");
  const fenced = /^```\n([\s\S]*?)^```$/m.exec(afterHeading);
  assert.ok(fenced, "the Scripts section opens with a fenced block");
  return fenced[1].split("\n").filter((line) => line.trim() !== "");
}

function scriptOf(command: string): string {
  return command.startsWith(PREFIX) ? command.slice(PREFIX.length).split(" ")[0] : "";
}

/** The block's priority.ts, validate.ts and render.ts lines, each exactly once and in that order. */
function documentCommands(block: string[]): string[] {
  const commands = block.filter((line) => DOCUMENT_SCRIPTS.includes(scriptOf(line)));
  assert.deepEqual(commands.map(scriptOf), DOCUMENT_SCRIPTS, "the block gives priority.ts, validate.ts and render.ts once each, in that order");
  return commands;
}

/** A command line with its bracketed optional groups, such as " [--table-file path]", left out. */
function required(command: string): string {
  return command.replace(/ \[[^\]]*\]/g, "");
}

/** A command line with its optional " [--force]" taken and its other optional groups left out. */
function forced(command: string): string {
  return required(command.replace(" [--force]", " --force"));
}

/** The validate.ts and render.ts commands of work-tracking.md rule 7, as full command lines. */
function ruleSevenCommands(workTracking: string): string[] {
  const rule = workTracking.split("\n").find((line) => line.startsWith("7. "));
  assert.ok(rule, "work-tracking.md has a rule 7");
  const spans = [...rule.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return spans.filter((span) => /^(validate|render)\.ts /.test(span)).map((span) => PREFIX + span);
}

/** argv for one expanded command line, placeholders filled; refuses a line it cannot run as given. */
function argv(command: string, doc: string, report: string): string[] {
  const tokens = command.split(" ");
  assert.equal(tokens[0], "node", `${command}: starts with node`);
  const filled = tokens.slice(1).map((t) =>
    t.replace("${CLAUDE_SKILL_DIR}", SKILL_DIR).replace("<file>", doc).replace("<report.html>", report),
  );
  for (const t of filled) assert.ok(!/[<>[\]$]/.test(t), `${command}: '${t}' is a placeholder this test cannot fill`);
  return filled;
}

function run(command: string, doc: string, report: string) {
  return spawnSync(process.execPath, argv(command, doc, report), { encoding: "utf8" });
}

function runAll(commands: string[], doc: string, report: string, round: string): void {
  for (const command of commands) {
    const result = run(command, doc, report);
    assert.equal(result.status, 0, `${round}: '${command}' exited ${result.status}: ${result.stderr.trim()}`);
  }
}

/** The fixture as the model first writes it: no priority, no post_priority, no table pin, no computed block. */
function unwrittenFixture(): Record<string, any> {
  const doc = JSON.parse(readFileSync(FIXTURE, "utf8"));
  delete doc.computed;
  delete doc.meta.scales.priority_table;
  for (const chain of doc.chains) {
    delete chain.priority;
    delete chain.post_priority;
  }
  return doc;
}

/** Chain 0's Severity re-scored from 9 to 2 by a named person, which moves its priority from H to L. */
function rescore(path: string): void {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(doc.chains[0].ratings.S.value, 9, "the fixture's chain 0 has Severity 9");
  doc.chains[0].ratings.S = { ...doc.chains[0].ratings.S, value: 2, review: { status: "rescored", by: "A. Reviewer", date: "2026-10-05" } };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

function inTempDir(body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "skill-commands-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withDocument(body: (doc: string, report: string) => void): void {
  inTempDir((dir) => {
    const doc = join(dir, "analysis.json");
    writeFileSync(doc, JSON.stringify(unwrittenFixture(), null, 2) + "\n");
    body(doc, join(dir, "report.html"));
  });
}

const skillMd = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
const workTracking = readFileSync(join(SKILL_DIR, "references", "work-tracking.md"), "utf8");

test("SKILL.md's document commands render a first report without --force, and re-render with it after a re-score", () => {
  const commands = documentCommands(scriptsBlock(skillMd));
  const render = commands[2];
  assert.ok(render.includes(" [--force]"), `the render line '${render}' carries --force as an optional group, in brackets`);
  assert.ok(!required(render).includes("--force"), `the render line '${render}' carries --force only in brackets`);
  withDocument((doc, report) => {
    assert.ok(!existsSync(report), "no file is at the --out path before the first render");
    runAll(commands.map(required), doc, report, "first round, every optional group left out");
    assert.ok(existsSync(report), "the first round wrote the report");
    const again = run(required(render), doc, report);
    assert.equal(again.status, EXIT_IO, `a second render without --force exited ${again.status}, not ${EXIT_IO}`);
    assert.match(again.stderr, /IO_EXISTS/, "a second render without --force refuses with IO_EXISTS");
    rescore(doc);
    runAll(commands.map(forced), doc, report, "second round, after a re-score, with --force on the render");
    const after = JSON.parse(readFileSync(doc, "utf8"));
    assert.equal(after.chains[0].priority.value, "L", "the stored priority follows the re-scored rating");
    assert.equal(after.chains[0].priority.rpn, 2 * after.chains[0].ratings.O.value * after.chains[0].ratings.D.value);
  });
});

test("work-tracking.md rule 7 gives validate.ts and render.ts --force as the Scripts block does, and they run over an existing report", () => {
  const commands = documentCommands(scriptsBlock(skillMd));
  const [, validate, render] = commands;
  const rule = ruleSevenCommands(workTracking);
  assert.deepEqual(rule, [required(validate), forced(render)], "rule 7 gives the block's validate line without its optional groups, then its render line with --force taken");
  withDocument((doc, report) => {
    runAll(commands.map(required), doc, report, "the run before tracking");
    runAll(rule, doc, report, "rule 7");
  });
});

const UPDATE_CHECK_LINE = "node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]";

/** The block's update-check.ts line, exactly once. */
function updateCheckCommand(block: string[]): string {
  const lines = block.filter((line) => scriptOf(line) === "update-check.ts");
  assert.equal(lines.length, 1, "the block gives update-check.ts once");
  return lines[0];
}

test("SKILL.md's update-check.ts line runs on a stored copy and an unchanged draft, exits 0 and prints its summary line", () => {
  const line = updateCheckCommand(scriptsBlock(skillMd));
  assert.equal(line, UPDATE_CHECK_LINE);
  inTempDir((dir) => {
    const copy = join(dir, "copy.json");
    const draft = join(dir, "draft.json");
    const text = readFileSync(FIXTURE, "utf8");
    writeFileSync(copy, text);
    writeFileSync(draft, text);
    // the placeholders hold a space, so they are filled before argv() splits the line
    const filled = required(line).replace("<stored copy>", copy).replace("<draft>", draft);
    const result = spawnSync(process.execPath, argv(filled, draft, ""), { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trimEnd().split("\n").at(-1),
      "update-check: 0 edge changes, 0 element changes, 0 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer");
  });
});

test("each SKILL.md heading the KIND_LEGACY and DEPENDENCY_LEGACY messages name is a heading of SKILL.md", () => {
  const legacy = readFileSync(join(SKILL_DIR, "scripts", "lib", "legacy.ts"), "utf8");
  const named = [...legacy.matchAll(/SKILL\.md describes under "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...named].sort(), ["Migrate a v1 document", "Migrate a v2 document"],
    "lib/legacy.ts names both migration headings, each written whole inside one template literal with bare double quotes");
  for (const heading of named) assert.match(skillMd, new RegExp(`^### ${heading}$`, "m"), `SKILL.md has no '### ${heading}' heading`);
});
