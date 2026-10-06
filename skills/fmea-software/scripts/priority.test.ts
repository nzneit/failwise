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
import { bandTable, writeTable } from "./test-helpers.ts";

// Writes the minimal document as it is first written, with its priority block and its
// meta.scales.priority_table removed, to <dir>/analysis.json and returns the path; the CLI must
// put both back, the record naming the table it loaded.
function writeMinimalWithoutPriority(dir: string): string {
  const doc = minimalDoc() as unknown as { meta: { scales: Record<string, unknown> }; chains: Record<string, unknown>[] };
  delete doc.meta.scales.priority_table;
  delete doc.chains[0].priority;
  const path = join(dir, "analysis.json");
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return path;
}

test("applyPriorities writes M/96 on a document that records no table and records the table id", () => {
  const table = loadTable();
  const doc = minimalDoc();
  delete (doc.meta.scales as Partial<FmeaDocument["meta"]["scales"]>).priority_table;
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
  delete (doc.meta.scales as Partial<FmeaDocument["meta"]["scales"]>).priority_table;
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

// ---- The recorded table: a run that loads another table is refused unless --change-table is given.

const SHIPPED_ID = "priority-fmea-software-v1";
const ALT_ID = "priority-alt-3band-v1";
const ALT_TABLE = fixturePath("tables", "well-formed-alt.json");

/** The one stderr line of a refused run whose document records `recorded` and whose command loaded `loaded`. */
function mismatchLine(recorded: string, loaded: string): string {
  return `error TABLE_ID_MISMATCH: priority-table-mismatch: meta.scales.priority_table is ${recorded} but the loaded table id is ${loaded}; pass the --table-file of the recorded table, or pass --change-table to record the loaded one at /meta/scales/priority_table\n`;
}

// Writes `doc` to <dir>/analysis.json and returns the path and the text written.
function writeDoc(dir: string, doc: unknown): { path: string; text: string } {
  const path = join(dir, "analysis.json");
  const text = JSON.stringify(doc, null, 2) + "\n";
  writeFileSync(path, text);
  return { path, text };
}

// Two rows, the second with a post-action re-rating, recording `recorded` (or nothing when undefined)
// and carrying the priorities of that table, as a document written by an earlier run does.
function recordedDoc(recorded: unknown): FmeaDocument {
  const doc = withPostRatings();
  const second = clone(minimalDoc().chains[0]);
  second.id = "ch-2";
  second.ratings = { S: rating(9), O: rating(9), D: rating(9) };
  doc.chains.push(second);
  const table = loadTable(recorded === ALT_ID ? ALT_TABLE : undefined);
  delete (doc.meta.scales as Partial<FmeaDocument["meta"]["scales"]>).priority_table;
  applyPriorities(doc, table);
  if (recorded === undefined) delete (doc.meta.scales as Partial<FmeaDocument["meta"]["scales"]>).priority_table;
  else (doc.meta.scales as unknown as Record<string, unknown>).priority_table = recorded;
  return doc;
}

test("CLI on a document that records the alternative table, run without --table-file: exit 2, TABLE_ID_MISMATCH, the file untouched", () => {
  withTempDir((dir) => {
    const { path, text } = writeDoc(dir, recordedDoc(ALT_ID));
    const result = runCli("priority.ts", [path, "--write"]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, mismatchLine(ALT_ID, SHIPPED_ID));
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

test("CLI on a document that records the shipped table, run with the alternative --table-file: exit 2, TABLE_ID_MISMATCH, the file untouched", () => {
  withTempDir((dir) => {
    const { path, text } = writeDoc(dir, recordedDoc(SHIPPED_ID));
    const result = runCli("priority.ts", [path, "--write", "--table-file", ALT_TABLE]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, mismatchLine(SHIPPED_ID, ALT_ID));
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

test("the table guard runs before the ratings are range-checked", () => {
  withTempDir((dir) => {
    const doc = recordedDoc(SHIPPED_ID);
    doc.chains[0].ratings.O.value = 11;
    const { path, text } = writeDoc(dir, doc);
    const result = runCli("priority.ts", [path, "--write", "--table-file", ALT_TABLE]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, mismatchLine(SHIPPED_ID, ALT_ID));
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

test("CLI with --change-table records the loaded table on the document and every row, and names the old one on stdout", () => {
  const cases: { recorded: string; args: string[]; loaded: string }[] = [
    { recorded: SHIPPED_ID, args: ["--table-file", ALT_TABLE], loaded: ALT_ID },
    { recorded: ALT_ID, args: [], loaded: SHIPPED_ID },
  ];
  for (const { recorded, args, loaded } of cases) {
    withTempDir((dir) => {
      const { path } = writeDoc(dir, recordedDoc(recorded));
      const result = runCli("priority.ts", [path, "--write", ...args, "--change-table"]);
      assert.equal(result.stderr, "");
      assert.equal(result.status, 0);
      assert.equal(result.stdout, `{"table": ${JSON.stringify(loaded)}, "rows": 2, "changed_from": ${JSON.stringify(recorded)}}\n`);
      const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
      assert.equal(doc.meta.scales.priority_table, loaded);
      assert.deepEqual(doc.chains.map((c) => c.priority.table), [loaded, loaded]);
      assert.equal(doc.chains[0].post_priority?.table, loaded);
      const expected = recordedDoc(undefined);
      applyPriorities(expected, loadTable(loaded === ALT_ID ? ALT_TABLE : undefined));
      assert.deepEqual(doc.chains.map((c) => [c.priority, c.post_priority]), expected.chains.map((c) => [c.priority, c.post_priority]), "every priority is recomputed with the loaded table");
    });
  }
});

test("CLI with --change-table on a document that already records the loaded table: exit 1, USAGE, the file untouched", () => {
  const cases: { recorded: string; args: string[] }[] = [
    { recorded: SHIPPED_ID, args: [] },
    { recorded: ALT_ID, args: ["--table-file", ALT_TABLE] },
  ];
  for (const { recorded, args } of cases) {
    withTempDir((dir) => {
      const { path, text } = writeDoc(dir, recordedDoc(recorded));
      const result = runCli("priority.ts", [path, "--write", ...args, "--change-table"]);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, `error USAGE: --change-table changes the table a document records, and this document already records the loaded table ${recorded}\n`);
      assert.equal(result.stdout, "");
      assert.equal(readFileSync(path, "utf8"), text);
    });
  }
});

test("CLI with --change-table on a document that records no table: exit 1, USAGE, the file untouched", () => {
  withTempDir((dir) => {
    const { path, text } = writeDoc(dir, recordedDoc(undefined));
    const result = runCli("priority.ts", [path, "--write", "--change-table"]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "error USAGE: --change-table changes the table a document records, and this document records none\n");
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

test("CLI on a first run records the loaded table, with and without --table-file, and prints the line as before", () => {
  const cases: { args: string[]; loaded: string }[] = [
    { args: [], loaded: SHIPPED_ID },
    { args: ["--table-file", ALT_TABLE], loaded: ALT_ID },
  ];
  for (const { args, loaded } of cases) {
    withTempDir((dir) => {
      const { path } = writeDoc(dir, recordedDoc(undefined));
      const result = runCli("priority.ts", [path, "--write", ...args]);
      assert.equal(result.stderr, "");
      assert.equal(result.status, 0);
      assert.equal(result.stdout, `{"table": ${JSON.stringify(loaded)}, "rows": 2}\n`);
      const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
      assert.equal(doc.meta.scales.priority_table, loaded);
      assert.deepEqual(doc.chains.map((c) => c.priority.table), [loaded, loaded]);
    });
  }
});

test("CLI run again with the recorded table recomputes the priorities and prints the line as before", () => {
  withTempDir((dir) => {
    const doc = recordedDoc(ALT_ID);
    doc.chains[1].priority = { value: "?", table: ALT_ID, rpn: 0 };
    const { path } = writeDoc(dir, doc);
    const result = runCli("priority.ts", [path, "--write", "--table-file", ALT_TABLE]);
    assert.equal(result.stderr, "");
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `{"table": "${ALT_ID}", "rows": 2}\n`);
    const after = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.equal(after.meta.scales.priority_table, ALT_ID);
    assert.equal(after.chains[1].priority.rpn, 729);
  });
});

test("CLI on a document whose recorded table is not a string refuses with TABLE_ID_MISMATCH and leaves the file untouched", () => {
  for (const recorded of [7, null]) {
    withTempDir((dir) => {
      const { path, text } = writeDoc(dir, recordedDoc(recorded));
      const result = runCli("priority.ts", [path, "--write"]);
      assert.equal(result.status, 2);
      assert.equal(result.stderr, mismatchLine(String(recorded), SHIPPED_ID));
      assert.equal(result.stdout, "");
      assert.equal(readFileSync(path, "utf8"), text);
    });
  }
});

// ---- A loaded table that breaks the priority properties is used, with a warning line per property.

test("CLI with a --table-file that breaks priority properties writes the priorities, exits 0 and prints one warning line per broken property, and none on a run it refuses", () => {
  const broken = bandTable(["L", "M", "H"]);
  broken.cells["3-1-1"] = "L";
  broken.cells["1-3-3"] = "M";
  withTempDir((dir) => {
    const tableFile = writeTable(dir, broken);
    const refused = writeDoc(dir, recordedDoc(SHIPPED_ID));
    const refusal = runCli("priority.ts", [refused.path, "--write", "--table-file", tableFile]);
    assert.equal(refusal.status, 2);
    assert.equal(refusal.stderr, mismatchLine(SHIPPED_ID, broken.id));
    assert.equal(readFileSync(refused.path, "utf8"), refused.text);
    const path = writeMinimalWithoutPriority(dir);
    const result = runCli("priority.ts", [path, "--write", "--table-file", tableFile]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"table": "priority-test-properties", "rows": 1}\n');
    assert.equal(result.stderr, [
      'warning priority-table-property: table priority-test-properties breaks "priority never decreases as S, O or D increases" at 3-1-1 (L) below 2-1-1 (M)\n',
      'warning priority-table-property: table priority-test-properties breaks "S of 9 or 10 is never below M" at 3-1-1 (L)\n',
      'warning priority-table-property: table priority-test-properties breaks "S of 1 is always L" at 1-3-3 (M)\n',
    ].join(""));
    const doc = JSON.parse(readFileSync(path, "utf8")) as FmeaDocument;
    assert.deepEqual(doc.chains[0].priority, { value: "M", table: "priority-test-properties", rpn: 96 });
  });
});

test("applyPriorities refuses a document that records another table unless changeTable is set", () => {
  const table = loadTable();
  const doc = recordedDoc(ALT_ID);
  assert.throws(() => applyPriorities(doc, table), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "TABLE_ID_MISMATCH");
    assert.equal(err.pointer, "/meta/scales/priority_table");
    return true;
  });
  assert.equal(doc.meta.scales.priority_table, ALT_ID, "a refusal changes nothing");
  applyPriorities(doc, table, { changeTable: true });
  assert.equal(doc.meta.scales.priority_table, SHIPPED_ID);
});
