import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  elementIdSet,
  jaccard,
  priorityCounts,
  stability,
  SHIPPED_TABLE_PATH,
  JACCARD_MIN,
  COUNT_BOUND_FRACTION,
  type FmeaDocument,
} from "./eval-stability.ts";

const VOCAB = ["H", "M", "L"];

function doc(ids: string[], priorities: string[]): FmeaDocument {
  return {
    elements: ids.map((id) => ({ id })),
    chains: priorities.map((value) => ({ priority: { value } })),
  };
}

test("identical documents: jaccard 1, every count diff 0, pass", () => {
  const a = doc(["checkout", "checkout.payment-gateway", "checkout.pricing"], ["H", "M", "L", "M"]);
  const b = doc(["checkout", "checkout.payment-gateway", "checkout.pricing"], ["H", "M", "L", "M"]);
  const s = stability(a, b, VOCAB);
  assert.equal(s.jaccard, 1);
  assert.deepEqual(s.countDiffs, { H: 0, M: 0, L: 0 });
  assert.equal(s.maxRows, 4);
  assert.equal(s.pass, true);
});

test("disjoint element ids: jaccard 0, fail", () => {
  const a = doc(["checkout", "checkout.pricing"], ["H"]);
  const b = doc(["order-store", "session-auth"], ["H"]);
  const s = stability(a, b, VOCAB);
  assert.equal(s.jaccard, 0);
  assert.equal(s.pass, false);
});

test("case and surrounding whitespace differences in ids are ignored", () => {
  // The schema's grammar already makes an element id lowercase kebab-case, but
  // these documents are unvalidated run output, so the set normalises anyway.
  const a = doc(["  checkout ", "CHECKOUT.payment-gateway"], ["M"]);
  const b = doc(["checkout", "checkout.Payment-Gateway"], ["M"]);
  assert.deepEqual([...elementIdSet(a)].sort(), ["checkout", "checkout.payment-gateway"]);
  assert.equal(jaccard(elementIdSet(a), elementIdSet(b)), 1);
});

test("jaccard of two empty sets is 1", () => {
  assert.equal(jaccard(new Set(), new Set()), 1);
});

test("three of five ids shared fails; four of five reaches the 0.8 floor", () => {
  const a = doc(["a", "b", "c", "d"], ["L"]);
  const b = doc(["a", "b", "c", "e"], ["L"]);
  const s = stability(a, b, VOCAB);
  assert.equal(s.jaccard, 3 / 5);
  assert.equal(s.pass, false);
  const c = doc(["a", "b", "c", "d"], ["L"]);
  const d = doc(["a", "b", "c", "d", "e"], ["L"]);
  const t = stability(c, d, VOCAB);
  assert.equal(t.jaccard, 0.8);
  assert.equal(t.pass, true);
});

test("count bound uses the larger of the two row counts", () => {
  // run 1 has 10 rows, run 2 has 5: bound is 0.2 × 10 = 2, not 0.2 × 5 = 1.
  const a = doc(["x"], ["H", "H", "H", "M", "M", "M", "L", "L", "L", "L"]);
  const b = doc(["x"], ["H", "M", "M", "L", "L"]);
  const s = stability(a, b, VOCAB);
  assert.equal(s.maxRows, 10);
  assert.equal(s.bound, 2);
  assert.deepEqual(s.countDiffs, { H: 2, M: 1, L: 2 });
  assert.equal(s.pass, true);
});

test("a count difference above the bound fails", () => {
  const a = doc(["x"], ["H", "H", "H", "M", "L"]);
  const b = doc(["x"], ["L", "L", "L", "M", "L"]);
  const s = stability(a, b, VOCAB);
  assert.equal(s.bound, 1);
  assert.deepEqual(s.countDiffs, { H: 3, M: 0, L: 3 });
  assert.equal(s.pass, false);
});

test("priorityCounts ignores values outside the vocabulary", () => {
  const a = doc(["x"], ["H", "VH", "L"]);
  assert.deepEqual(priorityCounts(a, VOCAB), { H: 1, M: 0, L: 1 });
});

test("CLI prints the Stability JSON for two files and a table file", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-"));
  try {
    const a = doc(["checkout", "checkout.pricing"], ["H", "M"]);
    const b = doc(["Checkout", "checkout.Pricing"], ["H", "L"]);
    writeFileSync(join(dir, "run1.json"), JSON.stringify(a));
    writeFileSync(join(dir, "run2.json"), JSON.stringify(b));
    writeFileSync(join(dir, "table.json"), JSON.stringify({ id: "t", vocabulary: VOCAB }));
    const r = spawnSync(
      process.execPath,
      [join(import.meta.dirname, "eval-stability.ts"), join(dir, "run1.json"), join(dir, "run2.json"), "--table-file", join(dir, "table.json")],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out, { jaccard: 1, maxRows: 2, countDiffs: { H: 0, M: 1, L: 1 }, bound: 0.4, pass: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 1 on a wrong argument count and 3 on an unreadable file", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const usage = spawnSync(process.execPath, [script, "only-one.json"], { encoding: "utf8" });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /^error USAGE: /);
  const missing = spawnSync(process.execPath, [script, "/nonexistent/a.json", "/nonexistent/b.json"], { encoding: "utf8" });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /^error IO_READ: cannot read \/nonexistent\/a\.json/);
});

test("with no --table-file the CLI falls back to the shipped priority table", () => {
  // Guards SHIPPED_TABLE_PATH: tools/ is two segments away from the table, so a
  // wrong relative path here would only show up on an unattended eval night.
  assert.match(SHIPPED_TABLE_PATH, /skills\/fmea-software\/data\/priority-fmea-software-v1\.json$/);
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-shipped-"));
  try {
    const a = doc(["checkout"], ["H", "M"]);
    writeFileSync(join(dir, "run1.json"), JSON.stringify(a));
    writeFileSync(join(dir, "run2.json"), JSON.stringify(a));
    const r = spawnSync(
      process.execPath,
      [join(import.meta.dirname, "eval-stability.ts"), join(dir, "run1.json"), join(dir, "run2.json")],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(Object.keys(JSON.parse(r.stdout).countDiffs), ["H", "M", "L"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the exported thresholds are the ones stability applies", () => {
  assert.equal(JACCARD_MIN, 0.8);
  assert.equal(COUNT_BOUND_FRACTION, 0.2);
  const a = doc(["x"], ["H", "H", "H", "M", "M", "M", "L", "L", "L", "L"]);
  const b = doc(["x"], ["H", "M", "M", "L", "L"]);
  assert.equal(stability(a, b, VOCAB).bound, 10 * COUNT_BOUND_FRACTION);
});

test("CLI exits 3 on JSON that is not a document and on a table with no vocabulary, 1 on a flag misuse", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-bad-"));
  try {
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify(doc(["x"], ["H"])));
    const notDoc = join(dir, "not-a-doc.json");
    writeFileSync(notDoc, JSON.stringify({ meta: {} }));
    const r1 = spawnSync(process.execPath, [script, notDoc, good], { encoding: "utf8" });
    assert.equal(r1.status, 3);
    assert.match(r1.stderr, /^error IO_READ: .*has no elements\[\] and chains\[\]/);
    const badTable = join(dir, "table.json");
    writeFileSync(badTable, JSON.stringify({ id: "t" }));
    const r2 = spawnSync(process.execPath, [script, good, good, "--table-file", badTable], { encoding: "utf8" });
    assert.equal(r2.status, 3);
    assert.match(r2.stderr, /^error IO_READ: .*has no vocabulary\[\] of strings/);
    const noPath = spawnSync(process.execPath, [script, good, good, "--table-file"], { encoding: "utf8" });
    assert.equal(noPath.status, 1);
    assert.match(noPath.stderr, /^error USAGE: --table-file needs a path/);
    const unknown = spawnSync(process.execPath, [script, good, good, "--bogus"], { encoding: "utf8" });
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /^error USAGE: unknown flag --bogus/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The four tests below feed the CLI the shapes an unvalidated eval run can really
// produce. Each one used to crash with an uncaught TypeError or print V8's
// multi-line parse message; each must now be one coded line with the I/O exit 3.

test("an element with no string id is one coded IO_READ line, not a stack trace", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-element-"));
  try {
    const bad = join(dir, "run1.json");
    const good = join(dir, "run2.json");
    writeFileSync(bad, JSON.stringify({ elements: [{ id: "checkout" }, { name: "Pricing" }], chains: [] }));
    writeFileSync(good, JSON.stringify(doc(["checkout"], ["H"])));
    const r = spawnSync(process.execPath, [script, bad, good], { encoding: "utf8" });
    assert.equal(r.status, 3);
    assert.equal(r.stderr.trimEnd().split("\n").length, 1, r.stderr);
    assert.match(r.stderr, /^error IO_READ: .*elements\[1\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a chains entry that is not an object is one coded IO_READ line", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-chain-"));
  try {
    const bad = join(dir, "run1.json");
    const good = join(dir, "run2.json");
    writeFileSync(bad, JSON.stringify({ elements: [{ id: "checkout" }], chains: [{ priority: { value: "H" } }, null] }));
    writeFileSync(good, JSON.stringify(doc(["checkout"], ["H"])));
    const r = spawnSync(process.execPath, [script, bad, good], { encoding: "utf8" });
    assert.equal(r.status, 3);
    assert.equal(r.stderr.trimEnd().split("\n").length, 1, r.stderr);
    assert.match(r.stderr, /^error IO_READ: .*chains\[1\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a --table-file whose JSON is null or a scalar is one coded IO_READ line", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-table-"));
  try {
    const good = join(dir, "run.json");
    const table = join(dir, "table.json");
    writeFileSync(good, JSON.stringify(doc(["checkout"], ["H"])));
    // null is the shape that used to crash: `table.vocabulary` on null throws,
    // while a number boxes and reads as undefined.
    for (const text of ["null", "42"]) {
      writeFileSync(table, text);
      const r = spawnSync(process.execPath, [script, good, good, "--table-file", table], { encoding: "utf8" });
      assert.equal(r.status, 3, text);
      assert.equal(r.stderr.trimEnd().split("\n").length, 1, r.stderr);
      assert.match(r.stderr, /^error IO_READ: .*has no vocabulary\[\] of strings/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a malformed JSON file is one coded IO_READ line even though the parse message spans lines", () => {
  const script = join(import.meta.dirname, "eval-stability.ts");
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-parse-"));
  try {
    const bad = join(dir, "run1.json");
    const good = join(dir, "run2.json");
    writeFileSync(bad, '{\n  "elements": [},\n');
    writeFileSync(good, JSON.stringify(doc(["checkout"], ["H"])));
    const r = spawnSync(process.execPath, [script, bad, good], { encoding: "utf8" });
    assert.equal(r.status, 3);
    assert.equal(r.stderr.trimEnd().split("\n").length, 1, r.stderr);
    assert.match(r.stderr, /^error IO_READ: cannot read /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
