// Pins the two id sentences of references/quality-and-lint.md to the code they list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVARIANT_RULES } from "./lib/invariants.ts";
import { MACHINE_RULES } from "./lib/lints.ts";
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

test("quality-and-lint.md names fifteen machine lints: MACHINE_RULES in order, then priority-table-property", () => {
  const ids = idsOf("The machine lints the scripts implement are fifteen:");
  assert.equal(ids.length, 15);
  assert.deepEqual(ids, [...MACHINE_RULES.map((r) => r.id), "priority-table-property"]);
});
