// The document commands the skill text gives, run as given. SKILL.md's Scripts block lists
// priority.ts, validate.ts and render.ts in the order a run uses them, and work-tracking.md rule 7
// repeats validate.ts and render.ts; this test reads those lines, fills in their placeholders and
// runs them on a copy of the checkout fixture: once on a document whose priorities are not yet
// written, as the model first writes it, and again after a re-score that changes a rating, with
// the report of the first round still at the --out path. Any non-zero exit fails the test.
// A bracketed optional part such as [--table-file path] is dropped, so each line runs in its
// shortest form, the one a document on the shipped table uses. No shell is involved: each line is split on spaces and its script started with this Node, so the
// test behaves the same under bash and fish.

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
const DOCUMENT_SCRIPTS = new Set(["priority.ts", "validate.ts", "render.ts"]);

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

/** The block's priority.ts, validate.ts and render.ts lines, in the block's order, each exactly once. */
function documentCommands(block: string[]): string[] {
  const commands = block.filter((line) => DOCUMENT_SCRIPTS.has(scriptOf(line)));
  assert.deepEqual(commands.map(scriptOf).sort(), [...DOCUMENT_SCRIPTS].sort(), "the block gives each document script once");
  return commands;
}

/** A command line without its bracketed optional parts, such as " [--table-file path]". */
function required(command: string): string {
  return command.replace(/ \[[^\]]*\]/g, "");
}

/** The validate.ts and render.ts commands of work-tracking.md rule 7, as full command lines. */
function ruleSevenCommands(workTracking: string): string[] {
  const rule = workTracking.split("\n").find((line) => line.startsWith("7. "));
  assert.ok(rule, "work-tracking.md has a rule 7");
  const spans = [...rule.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return spans.filter((span) => /^(validate|render)\.ts /.test(span)).map((span) => PREFIX + span);
}

/** argv for one command line, optional parts dropped and placeholders filled; refuses a line it cannot run as given. */
function argv(command: string, doc: string, report: string): string[] {
  const tokens = required(command).split(" ");
  assert.equal(tokens[0], "node", `${command}: starts with node`);
  const filled = tokens.slice(1).map((t) =>
    t.replace("${CLAUDE_SKILL_DIR}", SKILL_DIR).replace("<file>", doc).replace("<report.html>", report),
  );
  for (const t of filled) assert.ok(!/[<>[\]$]/.test(t), `${command}: '${t}' is a placeholder this test cannot fill`);
  return filled;
}

function runAll(commands: string[], doc: string, report: string, round: string): void {
  for (const command of commands) {
    const result = spawnSync(process.execPath, argv(command, doc, report), { encoding: "utf8" });
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

function withDocument(body: (doc: string, report: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "skill-commands-"));
  try {
    const doc = join(dir, "analysis.json");
    writeFileSync(doc, JSON.stringify(unwrittenFixture(), null, 2) + "\n");
    body(doc, join(dir, "report.html"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const skillMd = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
const workTracking = readFileSync(join(SKILL_DIR, "references", "work-tracking.md"), "utf8");

test("SKILL.md's document commands run as given on a new document, and again after a re-score", () => {
  const commands = documentCommands(scriptsBlock(skillMd));
  withDocument((doc, report) => {
    runAll(commands, doc, report, "first round");
    assert.ok(existsSync(report), "the first round wrote the report");
    rescore(doc);
    runAll(commands, doc, report, "second round, after a re-score");
    const after = JSON.parse(readFileSync(doc, "utf8"));
    assert.equal(after.chains[0].priority.value, "L", "the stored priority follows the re-scored rating");
    assert.equal(after.chains[0].priority.rpn, 2 * after.chains[0].ratings.O.value * after.chains[0].ratings.D.value);
  });
});

test("work-tracking.md rule 7 gives validate.ts and render.ts as the Scripts block does, and they run over an existing report", () => {
  const block = documentCommands(scriptsBlock(skillMd));
  const rule = ruleSevenCommands(workTracking);
  assert.deepEqual(rule.map(scriptOf), ["validate.ts", "render.ts"], "rule 7 gives validate.ts, then render.ts");
  const blockRequired = block.map(required);
  for (const command of rule) assert.ok(blockRequired.includes(required(command)), `rule 7's '${command}' is the Scripts block's line, optional parts aside`);
  withDocument((doc, report) => {
    runAll(block, doc, report, "the run before tracking");
    runAll(rule, doc, report, "rule 7");
  });
});
