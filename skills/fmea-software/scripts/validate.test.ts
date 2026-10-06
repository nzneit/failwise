import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { validatorVersion } from "./validate.ts";
import { staleComputed, validateDocument } from "./lib/validation.ts";
import { loadTable } from "./lib/table.ts";
import { isRfc3339DateTime } from "./lib/dates.ts";
import { clone, fixturePath, loadFixture, runCli, withTempDir } from "./test-helpers.ts";
import type { FmeaDocument, Lint } from "./lib/types.ts";

const table = loadTable();
const golden = (): FmeaDocument => loadFixture<FmeaDocument>("checkout-service.fmea.json");

test("the golden analysis validates with the eleven expected lints and a score of 88", () => {
  const result = validateDocument(golden(), table);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.lints.length, 11);
  assert.equal(result.quality_score, 88);
  const blockers = result.lints.filter((l) => l.severity === "blocker");
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].rule, "detection-1-without-evidenced-control");
  assert.equal(blockers[0].pointer, "/chains/6/ratings/D");
  const byRule = (rule: string) => result.lints.filter((l) => l.rule === rule).map((l) => l.pointer);
  assert.deepEqual(byRule("occurrence-estimate-without-trigger"), ["/chains/5/ratings/O"]);
  assert.deepEqual(byRule("seeded-action-without-incident"), ["/chains/7/actions/1"]);
  assert.equal(byRule("rating-provisional").length, 8);
  assert.deepEqual(byRule("metadata-without-ground-rules"), []);
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
  assert.equal(result.lints.length, 11);
  assert.equal(result.quality_score, 88);
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
    assert.equal(parsed.quality_score, 88);
    assert.equal(parsed.lints.length, 11);
  });
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
    assert.equal((JSON.parse(after) as FmeaDocument).computed?.quality_score, 88);
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
    assert.deepEqual(Object.keys(first), ["meta", "elements", "functions", "chains", "computed"]);
    assert.deepEqual(
      { meta: first.meta, elements: first.elements, functions: first.functions, chains: first.chains },
      { meta: beforeDoc.meta, elements: beforeDoc.elements, functions: beforeDoc.functions, chains: beforeDoc.chains },
    );
    assert.equal(first.computed?.validator_version, validatorVersion());
    assert.equal(first.computed?.quality_score, 88);
    assert.equal(first.computed?.lints.length, 11);
    assert.ok(isRfc3339DateTime(String(first.computed?.validated_at)));
  });
});

test("--write replaces an existing computed block whole and keeps it where the file had it", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    const reordered = {
      computed: { quality_score: 3, lints: [], validated_at: "2020-01-01T00:00:00Z", validator_version: "0.0.1" },
      meta: doc.meta, elements: doc.elements, functions: doc.functions, chains: doc.chains,
    };
    writeFileSync(path, JSON.stringify(reordered, null, 2) + "\n");
    assert.equal(runCli("validate.ts", [path, "--write"]).status, 0);
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(Object.keys(after), ["computed", "meta", "elements", "functions", "chains"]);
    assert.equal(after.computed?.quality_score, 88);
    assert.equal(after.computed?.validator_version, validatorVersion());
    assert.equal(after.computed?.lints.length, 11);
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

test("a document that already carries computed is validated, not compared against this run", () => {
  const doc = golden();
  doc.computed = { quality_score: 3, lints: [], validated_at: "2020-01-01T00:00:00Z", validator_version: "0.0.1" };
  const result = validateDocument(doc, table);
  assert.equal(result.ok, true);
  assert.equal(result.quality_score, 88);
});

test("the CLI exits 2 with TABLE_ID_MISMATCH when --table-file names another table", () => {
  const r = runCli("validate.ts", [fixturePath("checkout-service.fmea.json"), "--table-file", fixturePath("tables", "well-formed-alt.json")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^error TABLE_ID_MISMATCH: priority-table-mismatch: .* at \/meta\/scales\/priority_table$/m);
});

test("a missing input file exits 3 with IO_READ", () => {
  const r = runCli("validate.ts", ["/nonexistent/analysis.json"]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /^error IO_READ: .*\/nonexistent\/analysis\.json/m);
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
      message: "computed.quality_score is 3 but validate.ts now gives 88; run validate.ts --write, then render.ts again" },
    { code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/lints",
      message: "computed.lints, written by validator 0.1.0, holds 11 findings fewer than validate.ts now finds; run validate.ts --write, then render.ts again" },
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
    { code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/lints/11",
      message: "computed.lints, written by validator 0.1.0, holds 1 finding more than validate.ts now finds; run validate.ts --write, then render.ts again" },
  ]);
});
