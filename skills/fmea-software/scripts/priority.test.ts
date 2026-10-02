// Tests for priority.ts: the pure applyPriorities function and the CLI's exit statuses,
// stdout line, and in-place write.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptError } from "./lib/codes.ts";
import { loadTable } from "./lib/table.ts";
import { applyPriorities, assertPriorityInput } from "./priority.ts";
import { clone, fixturePath, loadFixture, minimalDoc, rating, runCli, withTempDir } from "./test-helpers.ts";
import type { FmeaDocument } from "./lib/types.ts";

// Writes the minimal document, with its priority block removed, to <dir>/analysis.json and
// returns the path; the CLI must put the block back.
function writeMinimalWithoutPriority(dir: string): string {
  const doc = minimalDoc() as unknown as { chains: Record<string, unknown>[] };
  delete doc.chains[0].priority;
  const path = join(dir, "analysis.json");
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return path;
}

test("applyPriorities writes M/96 on the minimal document and pins the table id", () => {
  const table = loadTable();
  const doc = minimalDoc();
  doc.meta.scales.priority_table = "something-else";
  doc.meta.scales.version = 3;
  doc.chains[0].priority = { value: "?", table: "?", rpn: 0 };
  const out = applyPriorities(doc, table);
  assert.equal(out, doc, "applyPriorities mutates and returns the same document");
  assert.deepEqual(out.chains[0].priority, { value: "M", table: "priority-fmea-software-v1", rpn: 96 });
  assert.equal(out.meta.scales.priority_table, "priority-fmea-software-v1");
  assert.equal(out.meta.scales.version, 3, "the scales version pin is the update mode's, not priority.ts's");
});

test("applyPriorities writes a priority on every chain, not just the first", () => {
  const table = loadTable();
  const doc = minimalDoc();
  const second = clone(doc.chains[0]);
  second.id = "ch-2";
  second.ratings = { S: rating(1), O: rating(1), D: rating(1) };
  doc.chains.push(second);
  applyPriorities(doc, table);
  assert.deepEqual(doc.chains.map((c) => c.priority.value), ["M", "L"]);
  assert.deepEqual(doc.chains[1].priority, { value: "L", table: "priority-fmea-software-v1", rpn: 1 });
});

test("applyPriorities throws RATING_RANGE with the pointer of the offending value", () => {
  const table = loadTable();
  const doc = minimalDoc();
  doc.chains[0].ratings.S.value = 11;
  assert.throws(() => applyPriorities(doc, table), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "RATING_RANGE");
    assert.equal(err.pointer, "/chains/0/ratings/S/value");
    return true;
  });
});

test("CLI without --write exits 1 with a USAGE line and touches nothing", () => {
  withTempDir((dir) => {
    const path = writeMinimalWithoutPriority(dir);
    const before = readFileSync(path, "utf8");
    const result = runCli("priority.ts", [path]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith("error USAGE:"), result.stderr);
    assert.equal(readFileSync(path, "utf8"), before);
  });
});

test("CLI with --write exits 0, prints the table id and row count, and fills priority", () => {
  withTempDir((dir) => {
    const path = writeMinimalWithoutPriority(dir);
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.stderr, "");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"table": "priority-fmea-software-v1", "rows": 1}\n');
    const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(doc.chains[0].priority, { value: "M", table: "priority-fmea-software-v1", rpn: 96 });
    assert.equal(doc.meta.scales.priority_table, "priority-fmea-software-v1");
    assert.equal(doc.meta.scales.version, 1);
  });
});

test("CLI with --table-file uses the alternative table's vocabulary and id", () => {
  const alt = loadFixture<{ id: string; vocabulary: string[] }>("tables", "well-formed-alt.json");
  withTempDir((dir) => {
    const path = writeMinimalWithoutPriority(dir);
    const result = runCli("priority.ts", [path, "--write", "--table-file", fixturePath("tables", "well-formed-alt.json")]);
    assert.equal(result.stderr, "");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `{"table": ${JSON.stringify(alt.id)}, "rows": 1}\n`);
    const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.ok(alt.vocabulary.includes(doc.chains[0].priority.value), `value ${doc.chains[0].priority.value} not in ${alt.vocabulary.join(",")}`);
    assert.equal(doc.chains[0].priority.table, alt.id);
    assert.equal(doc.chains[0].priority.rpn, 96);
    assert.equal(doc.meta.scales.priority_table, alt.id);
    assert.equal(doc.meta.scales.version, 1);
  });
});

test("CLI with a malformed --table-file exits 3 with a TABLE_MALFORMED line and writes nothing", () => {
  withTempDir((dir) => {
    const path = writeMinimalWithoutPriority(dir);
    const before = readFileSync(path, "utf8");
    const result = runCli("priority.ts", [path, "--write", "--table-file", fixturePath("tables", "malformed-gap.json")]);
    assert.equal(result.status, 3);
    assert.ok(result.stderr.startsWith("error TABLE_MALFORMED:"), result.stderr);
    assert.match(result.stderr, /gap/);
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(path, "utf8"), before);
  });
});

test("CLI on a missing input file exits 3 with an IO_READ line", () => {
  withTempDir((dir) => {
    const result = runCli("priority.ts", [join(dir, "missing.json"), "--write"]);
    assert.equal(result.status, 3);
    assert.ok(result.stderr.startsWith("error IO_READ:"), result.stderr);
  });
});

test("CLI on a document whose chains is not an array exits 2 with a SCHEMA line", () => {
  withTempDir((dir) => {
    const doc = minimalDoc() as unknown as Record<string, unknown>;
    doc.chains = { "ch-1": {} };
    const path = join(dir, "analysis.json");
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.startsWith("error SCHEMA:"), result.stderr);
    assert.ok(result.stderr.trimEnd().endsWith(" at /chains"), result.stderr);
  });
});

test("CLI on an input that does not end in .json exits 1", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.txt");
    writeFileSync(path, JSON.stringify(minimalDoc()));
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith("error USAGE:"), result.stderr);
  });
});

test("CLI on a rating of 11 exits 2 with a RATING_RANGE line and leaves the file unchanged", () => {
  withTempDir((dir) => {
    const doc = minimalDoc();
    doc.chains[0].ratings.O.value = 11;
    const path = join(dir, "analysis.json");
    const text = JSON.stringify(doc, null, 2) + "\n";
    writeFileSync(path, text);
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.startsWith("error RATING_RANGE:"), result.stderr);
    assert.ok(result.stderr.trimEnd().endsWith(" at /chains/0/ratings/O/value"), result.stderr);
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

test("assertPriorityInput names the first location it cannot rewrite", () => {
  const cases: [unknown, string][] = [
    [42, ""],
    [{}, "/meta"],
    [{ meta: {} }, "/meta/scales"],
    [{ meta: { scales: {} } }, "/chains"],
    [{ meta: { scales: {} }, chains: [1] }, "/chains/0"],
    [{ meta: { scales: {} }, chains: [{}] }, "/chains/0/ratings"],
    [{ meta: { scales: {} }, chains: [{ ratings: { S: 5 } }] }, "/chains/0/ratings/S"],
    [{ meta: { scales: {} }, chains: [{ ratings: { S: {}, O: {}, D: {} } }] }, "/chains/0/ratings/S/value"],
    [{ meta: { scales: {} }, chains: [{ ratings: { S: { value: 8 }, O: { value: 3 }, D: { value: 4 } }, post_ratings: 5 }] }, "/chains/0/post_ratings"],
    [{ meta: { scales: {} }, chains: [{ ratings: { S: { value: 8 }, O: { value: 3 }, D: { value: 4 } }, post_ratings: { S: {}, O: {}, D: {} } }] }, "/chains/0/post_ratings/S/value"],
  ];
  for (const [raw, pointer] of cases) {
    assert.throws(() => assertPriorityInput(raw), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "SCHEMA");
      assert.equal(err.pointer, pointer);
      return true;
    });
  }
  const doc = minimalDoc();
  assert.equal(assertPriorityInput(doc), doc, "a well-shaped document comes back unchanged");
});

// ---- post_priority: the chain-level sibling of priority, computed from post_ratings.

// The minimal document with one Completed action and a post-action re-rating, the shape the
// golden fixture's ch-3 carries. The default S 4, O 3, D 2 is that row's re-rating; under the
// shipped table it is M with rpn 24.
function withPostRatings(S = 4, O = 3, D = 2): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "add a retry", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(S), O: rating(O), D: rating(D) };
  return doc;
}

test("applyPriorities writes post_priority from post_ratings with the same table as priority", () => {
  const table = loadTable();
  const doc = withPostRatings();
  applyPriorities(doc, table);
  assert.deepEqual(doc.chains[0].post_priority, { value: "M", table: "priority-fmea-software-v1", rpn: 24 });
  assert.deepEqual(doc.chains[0].priority, { value: "M", table: "priority-fmea-software-v1", rpn: 96 }, "the pre-action priority is unchanged");
});

test("applyPriorities removes post_priority when post_ratings is absent", () => {
  const table = loadTable();
  const doc = minimalDoc();
  doc.chains[0].post_priority = { value: "H", table: "priority-fmea-software-v1", rpn: 24 };
  applyPriorities(doc, table);
  assert.equal("post_priority" in doc.chains[0], false, "a chain with no post_ratings carries no post_priority");
});

test("post_priority uses the loaded table, not the shipped one, under --table-file", () => {
  const alt = loadTable(fixturePath("tables", "well-formed-alt.json"));
  const doc = withPostRatings();
  applyPriorities(doc, alt);
  assert.deepEqual(doc.chains[0].post_priority, { value: "M", table: "priority-alt-3band-v1", rpn: 24 });
  assert.deepEqual(doc.chains[0].priority, { value: "H", table: "priority-alt-3band-v1", rpn: 96 });
});

test("applyPriorities throws RATING_RANGE with the pointer of the offending post rating", () => {
  const table = loadTable();
  const doc = withPostRatings(4, 3, 0);
  assert.throws(() => applyPriorities(doc, table), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "RATING_RANGE");
    assert.equal(err.pointer, "/chains/0/post_ratings/D/value");
    return true;
  });
});

test("CLI with --write fills post_priority beside post_ratings", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, JSON.stringify(withPostRatings(), null, 2) + "\n");
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.stderr, "");
    assert.equal(result.status, 0);
    const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(doc.chains[0].post_priority, { value: "M", table: "priority-fmea-software-v1", rpn: 24 });
  });
});
