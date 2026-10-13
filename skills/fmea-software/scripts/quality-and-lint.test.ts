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

/** The backticked ids of the one line that starts with `opening`. */
function idsOf(opening: string): string[] {
  const line = reference.split("\n").find((l) => l.startsWith(opening));
  assert.ok(line, `quality-and-lint.md has a line starting '${opening}'`);
  return [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
}

test("quality-and-lint.md lists the validator ids as schema, format-legacy and INVARIANT_RULES, in order", () => {
  assert.deepEqual(idsOf("The validator ids a row may name are exactly"), ["schema", "format-legacy", ...INVARIANT_RULES]);
});

test("quality-and-lint.md names nineteen machine lints: MACHINE_RULES in order, then priority-table-property", () => {
  const ids = idsOf("The machine lints the scripts implement are nineteen:");
  assert.equal(ids.length, 19);
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
