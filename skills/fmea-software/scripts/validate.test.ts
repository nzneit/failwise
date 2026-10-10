import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { staleComputed, validateDocument } from "./lib/validation.ts";
import { loadTable } from "./lib/table.ts";
import { bandTable, minimalDoc, minimalDocOn, rating, writeTable } from "./test-helpers.ts";
import { isRfc3339DateTime } from "./lib/dates.ts";
import { changedMessage, clone, fixturePath, loadFixture, runCli, runCliWithOtherWriter, withTempDir } from "./test-helpers.ts";
import { LEGACY_TRIGGERS, V2_TRIGGERS, assertLegacyRefused, writeLegacy } from "./test-helpers.ts";
import type { FmeaDocument, Lint } from "./lib/types.ts";
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { PLUGIN_VERSION } from "./lib/version.ts";
import { SKILL_ROOT } from "./test-helpers.ts";

const table = loadTable();
const golden = (): FmeaDocument => loadFixture<FmeaDocument>("checkout-service.fmea.json");

test("the golden analysis validates with the fourteen expected lints and a score of 89", () => {
  const result = validateDocument(golden(), table);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.lints.length, 14);
  assert.equal(result.quality_score, 89);
  const blockers = result.lints.filter((l) => l.severity === "blocker");
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].rule, "detection-1-without-evidenced-control");
  assert.equal(blockers[0].pointer, "/chains/6/ratings/D");
  const byRule = (rule: string) => result.lints.filter((l) => l.rule === rule).map((l) => l.pointer);
  assert.deepEqual(byRule("occurrence-estimate-without-trigger"), ["/chains/5/ratings/O"]);
  assert.deepEqual(byRule("seeded-action-without-incident"), ["/chains/7/actions/1"]);
  assert.equal(byRule("rating-provisional").length, 11);
  assert.deepEqual(byRule("rating-provisional").slice(-3), ["/chains/8/ratings/S", "/chains/8/ratings/O", "/chains/8/ratings/D"]);
  assert.deepEqual(byRule("metadata-without-ground-rules"), []);
});

test("the checkout fixture holds two codebases, three edges from checkout, and ch-9 at /chains/8 linked to ch-1 with ch-1's O as its cited O", () => {
  const doc = golden();
  const metaKeys = Object.keys(doc.meta);
  assert.equal(metaKeys[metaKeys.indexOf("boundary") + 1], "codebases");
  assert.deepEqual(doc.meta.codebases, [
    { id: "checkout", name: "Checkout service", repo: "acme/checkout" },
    { id: "session-auth", name: "Session authentication library", repo: "acme/session-auth" },
  ]);
  assert.deepEqual(doc.elements.map((e) => [e.id, e.codebase ?? null]), [
    ["checkout", "checkout"], ["checkout.api", null], ["checkout.payment-gateway", null],
    ["checkout.order-store", null], ["checkout.session-auth", "session-auth"], ["pricing", null],
  ]);
  for (const i of [0, 4]) { const keys = Object.keys(doc.elements[i]); assert.equal(keys[keys.indexOf("sources") - 1], "codebase"); }
  assert.deepEqual(doc.dependencies, [
    { from: "checkout", to: "checkout.payment-gateway", strength: "strong", sla: "99.95% monthly", limits: "50 rps per merchant" },
    { from: "checkout", to: "pricing", strength: "weak", sla: "99.9% monthly" },
    { from: "checkout", to: "checkout.order-store", strength: "strong", sla: "99.99% monthly" },
  ]);
  const [ch1, ch9] = [doc.chains[0], doc.chains[8]];
  assert.deepEqual([doc.chains.length, ch9.id, ch9.function, ch9.trigger], [9, "ch-9", "fn-checkout-order", undefined]);
  assert.equal(`${ch9.failure_mode}.`, ch1.effects.next_level);
  assert.equal(ch9.effects.end, ch1.effects.end);
  assert.deepEqual(ch9.causes, [{ text: ch1.failure_mode, chain: "ch-1",
    cited_o: { value: ch1.ratings.O.value, evidence_kind: ch1.ratings.O.evidence_kind, evidence_ref: ch1.ratings.O.evidence_ref } }]);
  assert.deepEqual((["S", "O", "D"] as const).map((f) => [ch9.ratings[f].value, ch9.ratings[f].evidence_kind, ch9.ratings[f].review.status]),
    [[9, "estimate", "provisional"], [6, "estimate", "provisional"], [3, "estimate", "provisional"]]);
  assert.deepEqual([ch9.actions, ch9.catalog_refs, ch9.priority], [[], [], { value: "H", table: "priority-fmea-software-v1", rpn: 162 }]);
  assert.equal(doc.computed!.validator_version, "0.4.1");
});

const ANALYSIS_FIXTURES = ["checkout-service.fmea.json", "update/before.fmea.json", "update/stale-rows.fmea.json", "legacy-rpn-sheet.expected.fmea.json"];

test("all four analysis fixtures carry a top-level dependencies array between functions and chains and no element dependency key", () => {
  for (const name of ANALYSIS_FIXTURES) {
    const doc = loadFixture<Record<string, unknown>>(name);
    const keys = Object.keys(doc);
    assert.ok(Array.isArray(doc.dependencies), name);
    assert.equal(keys.indexOf("dependencies"), keys.indexOf("functions") + 1, name);
    assert.equal(keys.indexOf("chains"), keys.indexOf("dependencies") + 1, name);
    assert.deepEqual((doc.elements as Record<string, unknown>[]).filter((e) => "dependency" in e).map((e) => e.id), [], name);
  }
});

test("update/before.fmea.json and legacy-rpn-sheet.expected.fmea.json validate with ok true", () => {
  for (const name of ["update/before.fmea.json", "legacy-rpn-sheet.expected.fmea.json"]) {
    const result = validateDocument(loadFixture(name), table);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
  }
});

test("the legacy expected fixture holds the conversion's edge from checkout-api to payment-gateway, strong, with its open assumption owned by user", () => {
  const doc = loadFixture<FmeaDocument>("legacy-rpn-sheet.expected.fmea.json");
  assert.deepEqual(doc.dependencies, [{ from: "checkout-api", to: "payment-gateway", strength: "strong" }]);
  const named = doc.meta.assumptions.filter((a) => a.text.includes("checkout-api") && a.text.includes("payment-gateway"));
  assert.deepEqual(named.map((a) => [a.owner, a.status]), [["user", "open"]]);
  assert.match(named[0].text, /first in-scope item in sheet order/);
  assert.match(named[0].text, /strength strong/);
  assert.ok(!doc.meta.history[0].change.includes("dependency block"), doc.meta.history[0].change);
});

test("the update fixtures' checkout-to-gateway edge is strong before the update and weak in the stale rows", () => {
  const pricing = { from: "checkout", to: "pricing", strength: "weak", sla: "99.9% monthly" };
  const gateway = (strength: string) => ({ from: "checkout", to: "checkout.payment-gateway", strength, sla: "99.95% monthly", limits: "50 rps per merchant" });
  assert.deepEqual(loadFixture<FmeaDocument>("update", "before.fmea.json").dependencies, [gateway("strong"), pricing]);
  assert.deepEqual(loadFixture<FmeaDocument>("update", "stale-rows.fmea.json").dependencies, [gateway("weak"), pricing]);
});

test("a schema violation short-circuits: no lints, score 0, ok false", () => {
  const doc = golden() as unknown as Record<string, unknown>;
  delete (doc.meta as Record<string, unknown>).scope;
  const result = validateDocument(doc, table);
  assert.equal(result.ok, false);
  assert.deepEqual(result.lints, []);
  assert.equal(result.quality_score, 0);
  assert.ok(result.errors.some((e) => e.code === "SCHEMA" && e.pointer === "/meta" && /missing required property "scope"/.test(e.message)));
});

test("an invariant failure still reports lints and a score", () => {
  const doc = golden();
  doc.chains[0].stale = { flag: true };
  const result = validateDocument(doc, table);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].rule, "stale-without-reason");
  assert.equal(result.errors[0].code, "INVARIANT");
  assert.equal(result.lints.length, 14);
  assert.equal(result.quality_score, 89);
});

test("a table whose id differs is a TABLE_ID_MISMATCH error and no per-row errors", () => {
  const alt = loadTable(fixturePath("tables", "well-formed-alt.json"));
  const result = validateDocument(golden(), alt);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, "TABLE_ID_MISMATCH");
  assert.equal(result.errors[0].pointer, "/meta/scales/priority_table");
});

test("an empty rationale is a schema error, so the section 6 non-empty rule lands in errors[]", () => {
  const doc = golden();
  doc.chains[0].ratings.S.rationale = "";
  const result = validateDocument(doc, table);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.code === "SCHEMA" && e.pointer === "/chains/0/ratings/S/rationale"),
    JSON.stringify(result.errors),
  );
});

test("the CLI prints the result JSON and exits 0 on the golden analysis", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, readFileSync(fixturePath("checkout-service.fmea.json")));
    const r = runCli("validate.ts", [path]);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.quality_score, 89);
    assert.equal(parsed.lints.length, 14);
  });
});

for (const trigger of [...LEGACY_TRIGGERS, ...V2_TRIGGERS]) {
  test(trigger.name, () => {
    withTempDir((dir) => assertLegacyRefused(runCli("validate.ts", [writeLegacy(dir, trigger)]), trigger.pointer, trigger.code));
  });
}

test("a v3 document gets no KIND_LEGACY or DEPENDENCY_LEGACY issue and a top level that is not an analysis falls through to SCHEMA", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, readFileSync(fixturePath("checkout-service.fmea.json")));
    const v3 = runCli("validate.ts", [path]);
    assert.equal(v3.status, 0);
    assert.ok(!v3.stderr.includes("KIND_LEGACY"), v3.stderr);
    assert.ok(!v3.stderr.includes("DEPENDENCY_LEGACY"), v3.stderr);
    writeFileSync(path, '{"meta": 1}\n');
    const other = runCli("validate.ts", [path]);
    assert.equal(other.status, 2);
    assert.match(other.stderr, /^error SCHEMA:/m);
    assert.ok(!other.stderr.includes("KIND_LEGACY"), other.stderr);
    assert.ok(!other.stderr.includes("DEPENDENCY_LEGACY"), other.stderr);
  });
});

const V3_REMEDIES = 'a new analysis adds the top-level dependencies array, empty when nothing depends on anything, and an analysis written against 0.3.x to 0.5.x is migrated through the update mode as SKILL.md describes under "Migrate a v2 document"';

test("format-legacy: a document with no top-level dependencies array gets one DEPENDENCY_LEGACY line carrying both remedies", () => {
  withTempDir((dir) => {
    const r = runCli("validate.ts", [writeLegacy(dir, V2_TRIGGERS[0])]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `error DEPENDENCY_LEGACY: format-legacy: document predates schema v3 (no top-level dependencies array); ${V3_REMEDIES} at /dependencies\n`);
  });
});

test("the v2 gate on minimalDoc: no top-level dependencies array is one DEPENDENCY_LEGACY issue at /dependencies", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  assert.deepEqual(validateDocument(doc, table).errors, [{
    code: "DEPENDENCY_LEGACY", rule: "format-legacy", pointer: "/dependencies",
    message: `document predates schema v3 (no top-level dependencies array); ${V3_REMEDIES}`,
  }]);
});

test("the v2 gate on minimalDoc: an element's dependency key, null included, is a block named by its element's id", () => {
  for (const block of [{ strength: "strong" }, null]) {
    const doc = minimalDoc();
    (doc.elements[0] as unknown as Record<string, unknown>).dependency = block;
    assert.deepEqual(validateDocument(doc, table).errors, [{
      code: "DEPENDENCY_LEGACY", rule: "format-legacy", pointer: "/elements/0/dependency",
      message: `document predates schema v3 (element svc has a dependency block); ${V3_REMEDIES}`,
    }], JSON.stringify(block));
  }
});

test("the v2 gate on minimalDoc: a v1 trait beside a missing dependencies array is KIND_LEGACY alone", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  delete (doc.elements as Record<string, unknown>[])[0].boundary;
  assert.deepEqual(validateDocument(doc, table).errors.map((e) => [e.code, e.pointer]), [["KIND_LEGACY", "/elements/0"]]);
});

test("the v2 gate on minimalDoc: a top-level dependencies of null passes the gate and gets SCHEMA lines", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  doc.dependencies = null;
  const result = validateDocument(doc, table);
  assert.equal(result.ok, false);
  assert.ok(result.errors.every((e) => e.code === "SCHEMA"), JSON.stringify(result.errors));
  assert.ok(result.errors.some((e) => e.pointer === "/dependencies" && /expected type array/.test(e.message)), JSON.stringify(result.errors));
});

test("validate.ts --write reads an analysis that begins with a byte-order mark and writes it back without the mark", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, `\uFEFF${readFileSync(fixturePath("checkout-service.fmea.json"), "utf8")}`, "utf8");
    const r = runCli("validate.ts", [path, "--write"]);
    assert.equal(r.stderr, "");
    assert.equal(r.status, 0);
    const after = readFileSync(path, "utf8");
    assert.equal(after.startsWith("\uFEFF"), false);
    assert.equal((JSON.parse(after) as FmeaDocument).computed?.quality_score, 89);
  });
});

test("the CLI exits 2, prints one coded stderr line per error, and --write leaves the file byte-identical", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    doc.chains[0].priority.rpn = 1;
    doc.chains[1].priority.value = "L";
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const before = readFileSync(path);
    const r = runCli("validate.ts", [path, "--write"]);
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errors.length, 2);
    const lines = r.stderr.trimEnd().split("\n");
    assert.deepEqual(lines, [
      "error PRIORITY_MISMATCH: priority-rpn-mismatch: stored rpn 1 but S times O times D is 162 at /chains/0/priority/rpn",
      "error PRIORITY_MISMATCH: priority-value-mismatch: stored priority L but the table gives H at /chains/1/priority/value",
    ]);
    assert.deepEqual(readFileSync(path), before);
  });
});

test("--write adds a computed block and leaves the authored parts alone", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    delete doc.computed;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const beforeDoc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.equal(runCli("validate.ts", [path, "--write"]).status, 0);
    const first = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(Object.keys(first), ["meta", "elements", "functions", "dependencies", "chains", "computed"]);
    assert.deepEqual(
      { meta: first.meta, elements: first.elements, functions: first.functions, dependencies: first.dependencies, chains: first.chains },
      { meta: beforeDoc.meta, elements: beforeDoc.elements, functions: beforeDoc.functions, dependencies: beforeDoc.dependencies, chains: beforeDoc.chains },
    );
    assert.equal(first.computed?.validator_version, PLUGIN_VERSION);
    assert.equal(first.computed?.quality_score, 89);
    assert.equal(first.computed?.lints.length, 14);
    assert.ok(isRfc3339DateTime(String(first.computed?.validated_at)));
  });
});

test("--write replaces an existing computed block whole and keeps it where the file had it", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    const reordered = {
      computed: { quality_score: 3, lints: [], validated_at: "2020-01-01T00:00:00Z", validator_version: "0.0.1" },
      meta: doc.meta, elements: doc.elements, functions: doc.functions, dependencies: doc.dependencies, chains: doc.chains,
    };
    writeFileSync(path, JSON.stringify(reordered, null, 2) + "\n");
    assert.equal(runCli("validate.ts", [path, "--write"]).status, 0);
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(Object.keys(after), ["computed", "meta", "elements", "functions", "dependencies", "chains"]);
    assert.equal(after.computed?.quality_score, 89);
    assert.equal(after.computed?.validator_version, PLUGIN_VERSION);
    assert.equal(after.computed?.lints.length, 14);
  });
});

// The failure this pins has to be provoked, and the two ways of provoking it that do not work are
// worth a skip rather than a red test: root ignores the directory mode, and some filesystems do
// not honour it either. Both are probed here, the second by attempting the very write the script
// would attempt.
test("a failing --write prints the coded line only, with nothing on stdout", (t) => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, readFileSync(fixturePath("checkout-service.fmea.json")));
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      t.skip("this process runs as root, which writes into a read-only directory regardless of its mode");
      return;
    }
    chmodSync(dir, 0o500); // the atomic write cannot create its sibling temporary file
    try {
      const probe = join(dir, "probe.tmp");
      let honoured = false;
      try {
        writeFileSync(probe, "");
        rmSync(probe, { force: true });
      } catch {
        honoured = true;
      }
      if (!honoured) {
        t.skip("this filesystem does not honour a read-only directory mode, so the write cannot be made to fail");
        return;
      }
      const r = runCli("validate.ts", [path, "--write"]);
      assert.equal(r.status, 3);
      assert.equal(r.stdout, "");
      assert.deepEqual(r.stderr.trimEnd().split("\n").length, 1);
      assert.ok(r.stderr.startsWith("error IO_WRITE: "), r.stderr);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

test("--write refuses with IO_CHANGED and keeps the save another writer made during the run", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, JSON.stringify(golden(), null, 2) + "\n");
    const other = golden();
    other.meta.name = "Saved by another writer";
    const saved = JSON.stringify(other, null, 2) + "\n";
    const r = runCliWithOtherWriter("validate.ts", [path, "--write"], path, saved);
    assert.equal(r.stderr, `error IO_CHANGED: ${changedMessage(path)}\n`);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(path, "utf8"), saved);
    assert.deepEqual(readdirSync(dir), ["analysis.json"]);
  });
});

test("a document that already carries computed is validated, not compared against this run", () => {
  const doc = golden();
  doc.computed = { quality_score: 3, lints: [], validated_at: "2020-01-01T00:00:00Z", validator_version: "0.0.1" };
  const result = validateDocument(doc, table);
  assert.equal(result.ok, true);
  assert.equal(result.quality_score, 89);
});

test("--write accepts a validated_at written with a lower-case t and z and replaces it with a new stamp", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    doc.computed = { quality_score: 3, lints: [], validated_at: "2020-01-01t00:00:00z", validator_version: "0.0.1" };
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const r = runCli("validate.ts", [path, "--write"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.match(String(after.computed?.validated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(after.computed?.quality_score, 89);
  });
});

test("the CLI exits 2 with TABLE_ID_MISMATCH when --table-file names another table", () => {
  const r = runCli("validate.ts", [fixturePath("checkout-service.fmea.json"), "--table-file", fixturePath("tables", "well-formed-alt.json")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^error TABLE_ID_MISMATCH: priority-table-mismatch: .* at \/meta\/scales\/priority_table$/m);
});

// ---- A loaded table that breaks a priority property: a warning after the document's lints.

const S1_FINDING: Lint = {
  rule: "priority-table-property", severity: "warning", pointer: "/meta/scales/priority_table",
  message: 'table priority-test-properties breaks "S of 1 is always L" at 1-3-3 (M)',
};

/** The test table with one cell of S band 1 raised to M, which breaks the S-of-1 property alone. */
function s1Broken() {
  const t = bandTable(["L", "M", "H"]);
  t.cells["1-3-3"] = "M";
  return t;
}

test("validateDocument adds the loaded table's broken properties after the document's lints, as warnings that change neither ok nor the score", () => {
  const doc = minimalDocOn(s1Broken());
  doc.meta.ground_rules = ["rate against the shipped anchors"];
  doc.meta.assumptions = [{ text: "the gateway holds its published SLA", owner: "T. Tester", status: "open" }];
  doc.chains[0].ratings.S = rating(8, "provisional");
  const result = validateDocument(doc, s1Broken());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.lints, [
    { rule: "rating-provisional", severity: "warning", pointer: "/chains/0/ratings/S", message: "The rating is still provisional and needs re-scoring" },
    S1_FINDING,
  ]);
  assert.equal(result.quality_score, 100);
});

test("validate.ts --write with a --table-file that breaks a property exits 0 and stores the finding in computed.lints", () => {
  withTempDir((dir) => {
    const tableFile = writeTable(dir, s1Broken());
    const path = join(dir, "analysis.json");
    writeFileSync(path, JSON.stringify(minimalDocOn(s1Broken()), null, 2) + "\n");
    const r = runCli("validate.ts", [path, "--write", "--table-file", tableFile]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(after.computed?.lints.at(-1), S1_FINDING);
  });
});

test("a missing input file exits 3 with IO_READ", () => {
  const r = runCli("validate.ts", ["/nonexistent/analysis.json"]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /^error IO_READ: .*\/nonexistent\/analysis\.json/m);
});

test("the version validate.ts --write records is the version in .claude-plugin/plugin.json", () => {
  const manifest = JSON.parse(readFileSync(join(SKILL_ROOT, "..", "..", ".claude-plugin", "plugin.json"), "utf8")) as { version?: unknown };
  assert.equal(PLUGIN_VERSION, manifest.version, "scripts/lib/version.ts and .claude-plugin/plugin.json give different versions; a release changes both");
});

test("--write works from a copy of the skill folder with no plugin manifest above it, and records the plugin version", () => {
  withTempDir((dir) => {
    const skill = join(dir, "skills", "fmea-software");
    cpSync(SKILL_ROOT, skill, { recursive: true });
    const path = join(dir, "analysis.json");
    const doc = golden();
    delete doc.computed;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const r = spawnSync(process.execPath, [join(skill, "scripts", "validate.ts"), path, "--write"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.equal(after.computed?.validator_version, PLUGIN_VERSION);
  });
});

test("a non-JSON input path exits 1 with USAGE", () => {
  const r = runCli("validate.ts", ["analysis.txt"]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "error USAGE: the analysis file must end in .json\n");
});

test("validateDocument leaves the document it is given untouched", () => {
  const doc = golden();
  const before = clone(doc);
  validateDocument(doc, table);
  assert.deepEqual(doc, before);
});

test("staleComputed finds nothing in a computed block validate.ts --write would write", () => {
  const doc = golden();
  assert.deepEqual(staleComputed(doc.computed!, validateDocument(doc, table)), []);
});

test("staleComputed gives one COMPUTED_STALE issue for the score and one for a stored lint list that falls short", () => {
  const doc = golden();
  const issues = staleComputed({ ...doc.computed!, quality_score: 3, lints: [] }, validateDocument(doc, table));
  assert.deepEqual(issues, [
    { code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/quality_score",
      message: "computed.quality_score is 3 but validate.ts now gives 89; run validate.ts --write, then render.ts again" },
    { code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/lints",
      message: "computed.lints, written by validator 0.4.1, holds 14 findings fewer than validate.ts now finds; run validate.ts --write, then render.ts again" },
  ]);
});

test("staleComputed gives one COMPUTED_STALE issue at the stored lint whose rule, severity or pointer alone differs", () => {
  const doc = golden();
  const fresh = validateDocument(doc, table);
  assert.deepEqual(staleComputed(doc.computed!, fresh), []);
  const i = 2;
  const cases: { field: string; change: (lint: Lint) => Lint }[] = [
    { field: "rule", change: (lint) => ({ ...lint, rule: `${lint.rule}-renamed` }) },
    { field: "severity", change: (lint) => ({ ...lint, severity: lint.severity === "warning" ? "blocker" : "warning" }) },
    { field: "pointer", change: (lint) => ({ ...lint, pointer: `${lint.pointer}/moved` }) },
  ];
  for (const { field, change } of cases) {
    const lints = doc.computed!.lints.map((lint, j) => (j === i ? change(lint) : lint));
    const issues = staleComputed({ ...doc.computed!, lints }, fresh);
    assert.deepEqual(issues.map((e) => [e.code, e.pointer]), [["COMPUTED_STALE", `/computed/lints/${i}`]],
      `a stored lint whose ${field} alone differs`);
  }
});

test("staleComputed points at the first stored lint past the validator's list when the stored list runs longer", () => {
  const doc = golden();
  const fresh = validateDocument(doc, table);
  const extra = { rule: "rating-provisional", severity: "warning" as const, pointer: "/chains/0/ratings/S", message: "an old finding" };
  assert.deepEqual(staleComputed({ ...doc.computed!, lints: [...fresh.lints, extra] }, fresh), [
    { code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/lints/14",
      message: "computed.lints, written by validator 0.4.1, holds 1 finding more than validate.ts now finds; run validate.ts --write, then render.ts again" },
  ]);
});
