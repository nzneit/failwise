// Pins the three id sentences and the two rule groups of references/quality-and-lint.md to the code they list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVARIANT_RULES } from "./lib/invariants.ts";
import { MACHINE_RULES } from "./lib/lints.ts";
import { loadSchema } from "./lib/schema.ts";
import { SKILL_ROOT } from "./test-helpers.ts";

const reference = readFileSync(join(SKILL_ROOT, "references", "quality-and-lint.md"), "utf8");
const scales = readFileSync(join(SKILL_ROOT, "references", "scales-software.md"), "utf8");
const methodology = readFileSync(join(SKILL_ROOT, "references", "methodology.md"), "utf8");

/** The backticked ids of the one line that starts with `opening`. */
function idsOf(opening: string): string[] {
  const line = reference.split("\n").find((l) => l.startsWith(opening));
  assert.ok(line, `quality-and-lint.md has a line starting '${opening}'`);
  return [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
}

test("quality-and-lint.md lists the validator ids as schema, format-legacy and INVARIANT_RULES, in order", () => {
  assert.deepEqual(idsOf("The validator ids a row may name are exactly"), ["schema", "format-legacy", ...INVARIANT_RULES]);
});

test("quality-and-lint.md names twenty-one machine lints: MACHINE_RULES in order, then priority-table-property", () => {
  const ids = idsOf("The machine lints the scripts implement are twenty-one:");
  assert.equal(ids.length, 21);
  assert.deepEqual(ids, [...MACHINE_RULES.map((r) => r.id), "priority-table-property"]);
});

test("quality-and-lint.md names the stale reason set v2 in the order the schema's enum gives", () => {
  const enumOrder = (((loadSchema().$defs as Record<string, Record<string, unknown>>).stale as Record<string, Record<string, unknown>>).properties.reason as { enum: string[] }).enum;
  assert.deepEqual(idsOf("The stale reason set v2 is"), enumOrder);
  assert.deepEqual(enumOrder, ["element-changed", "function-changed", "flow-changed", "control-removed", "scales-version"]);
});

test("quality-and-lint.md documents the three reviewer rules this revision adds, under their ids", () => {
  const rows = reference.split("\n").filter((l) => /^\| `[a-z0-9-]+` \|/.test(l));
  for (const id of ["chain-flow-effect-consistency", "chain-flow-shared-provider", "flow-referent-unsourced"]) {
    assert.ok(rows.some((r) => r.startsWith(`| \`${id}\` |`) && r.includes("| reviewer |")), `${id} is documented as a reviewer row`);
  }
  assert.ok(rows.find((r) => r.startsWith("| `flow-referent-unsourced` |"))!.includes("open assumption"), "the unsourced rule records an open assumption");
});

test("the top-of-scale anchor row measures over the reference population, not the function's users alone", () => {
  const row = reference.split("\n").find((l) => l.startsWith("| `catastrophic-severity-anchor` |"));
  assert.ok(row, "the anchor row exists");
  assert.ok(row!.includes("the named flow's, where a chain names flows, the function's users otherwise"), "the anchor row is restated in referent terms");
  assert.ok(row!.includes("[adapted-from:C030]"), "the row keeps its provenance tag");
});

test("scales-software.md declares the scales version this revision bumps, once", () => {
  assert.match(scales, /^scales version: 2$/m);
  assert.equal(scales.split("\n").filter((l) => l.startsWith("scales version: ")).length, 1);
});

test("scales-software.md restates every anchor row that names a radius class, and its checked sentence lists exactly those rows", () => {
  // Scoped to the Severity table: Occurrence and Detection carry anchor tables of the same shape,
  // and two of their rows read "at majority or subset radius" and "internal-only radius".
  const severity = scales.slice(scales.indexOf("## Severity, 1 to 10"), scales.indexOf("## Occurrence, 1 to 10"));
  const rows = [...severity.matchAll(/^\| (\d+) \| ([^|]*)\|/gm)].map((m) => ({ rating: Number(m[1]), anchor: m[2] }));
  assert.equal(rows.length, 10, "the Severity anchor table has ten rows");
  const radius = rows.filter((r) => /majority|subset|internal.only/i.test(r.anchor)).map((r) => r.rating);
  assert.deepEqual(radius, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const sentence = scales.split("\n").find((l) => l.startsWith("The anchor rows that name a radius class are"));
  assert.ok(sentence, "the checked sentence exists");
  const range = sentence!.match(/^The anchor rows that name a radius class are (\d+) to (\d+)/);
  assert.ok(range, "the sentence states its row range up front");
  const [lo, hi] = [Number(range![1]), Number(range![2])];
  assert.deepEqual(Array.from({ length: hi - lo + 1 }, (_, i) => hi - i), radius);
  const tenth = rows.find((r) => r.rating === 10)!;
  assert.ok(tenth.anchor.includes("the reference population"), "rating 10's population is restated in referent terms");
});

test("DF4's sentence stands verbatim in the row that disclaims the canon's criticality", () => {
  const row = methodology.split("\n").find((l) => l.startsWith("| A flow's value-priority tier |"));
  assert.ok(row, "the row exists");
  assert.ok(row!.includes("a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target"));
  assert.ok(row!.includes("[paraphrased:C201]"), "the tier's vocabulary is cited to C201");
  assert.ok(row!.includes("[skill-authored]"), "the disclaimer is the skill's own words");
});
