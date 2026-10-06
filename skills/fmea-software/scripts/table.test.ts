// Tests for lib/table.ts: the priority table's shape check and loader, the property check of a
// loaded table, the band lookup, and the §10 property tests over the shipped table.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ScriptError } from "./lib/codes.ts";
import { bandIndex, cellKey, checkTableProperties, checkTableShape, computePriority, loadTable, lookupPriority, vocabularyRank } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";
import { bandTable, fixturePath, loadFixture, clone, rating } from "./test-helpers.ts";

// A small well-formed table built in memory: two bands per factor, two values, eight cells.
// Tests mutate a clone of it to produce exactly one defect each.
function smallTable(): PriorityTable {
  const two: [number, number][] = [[1, 5], [6, 10]];
  const cells: Record<string, string> = {};
  for (let s = 1; s <= 2; s++) for (let o = 1; o <= 2; o++) for (let d = 1; d <= 2; d++) cells[`${s}-${o}-${d}`] = s === 2 ? "H" : "L";
  return { id: "small", vocabulary: ["H", "L"], bands: { S: two, O: clone(two), D: clone(two) }, cells };
}

// Asserts that fn throws a ScriptError with the given code and a message matching re.
function assertScriptError(fn: () => unknown, code: string, re: RegExp): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ScriptError, `expected ScriptError, got ${String(err)}`);
    assert.equal(err.code, code);
    assert.match(err.message, re);
    return true;
  });
}

test("loadTable() with no argument loads the shipped table", () => {
  const table = loadTable();
  assert.equal(table.id, "priority-fmea-software-v1");
  assert.deepEqual(table.vocabulary, ["H", "M", "L"]);
  assert.equal(table.bands.S.length, 5);
  assert.equal(Object.keys(table.cells).length, 125);
});

test("loadTable on a missing file throws TABLE_MALFORMED", () => {
  assertScriptError(() => loadTable("/nonexistent.json"), "TABLE_MALFORMED", /nonexistent\.json/);
});

test("checkTableShape accepts a table with a different vocabulary and band count", () => {
  const raw = loadFixture("tables", "well-formed-alt.json");
  const table = checkTableShape(raw, "well-formed-alt.json");
  assert.equal(table.vocabulary.length, 4);
  assert.equal(table.bands.S.length, 3);
  assert.equal(Object.keys(table.cells).length, 27);
  assert.equal(loadTable(fixturePath("tables", "well-formed-alt.json")).id, table.id);
});

test("checkTableShape rejects the malformed fixtures, naming the defect", () => {
  const cases: [string, RegExp][] = [
    ["malformed-gap.json", /gap/],
    ["malformed-overlap.json", /overlap/],
    ["malformed-cell-missing.json", /missing cell/],
    ["malformed-vocab.json", /outside the vocabulary/],
  ];
  for (const [file, re] of cases) {
    assertScriptError(() => checkTableShape(loadFixture("tables", file), file), "TABLE_MALFORMED", re);
    assertScriptError(() => loadTable(fixturePath("tables", file)), "TABLE_MALFORMED", re);
  }
});

test("checkTableShape prefixes every message with the origin", () => {
  assertScriptError(() => checkTableShape(null, "my-table.json"), "TABLE_MALFORMED", /^my-table\.json: /);
});

test("checkTableShape rejects bands that do not start at 1", () => {
  const t = smallTable();
  t.bands.S = [[2, 5], [6, 10]];
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /bands\.S must start at 1/);
});

test("checkTableShape rejects bands that do not end at 10", () => {
  const t = smallTable();
  t.bands.O = [[1, 5], [6, 9]];
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /bands\.O must end at 10/);
});

test("checkTableShape rejects a band with lo > hi", () => {
  const t = smallTable();
  t.bands.D = [[1, 5], [7, 6]];
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /bands\.D\[1\]/);
});

test("checkTableShape rejects a cell key outside the band combinations", () => {
  const t = smallTable();
  t.cells["3-1-1"] = "H";
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /unexpected cell key "3-1-1"/);
});

test("checkTableShape rejects bands missing a factor", () => {
  const t = smallTable() as unknown as { bands: Record<string, unknown> };
  delete t.bands.D;
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /bands must have exactly the keys S, O, D/);
});

test("checkTableShape rejects a vocabulary with a duplicate", () => {
  const t = smallTable();
  t.vocabulary = ["H", "L", "H"];
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /vocabulary has a duplicate value "H"/);
});

test("checkTableShape rejects an empty id and a non-object", () => {
  const t = smallTable();
  t.id = "";
  assertScriptError(() => checkTableShape(t, "t"), "TABLE_MALFORMED", /id must be a non-empty string/);
  assertScriptError(() => checkTableShape([], "t"), "TABLE_MALFORMED", /must be a JSON object/);
});

test("checkTableShape returns a table with exactly the four fields", () => {
  const t = smallTable() as unknown as Record<string, unknown>;
  t.extra = "ignored";
  const out = checkTableShape(t, "t");
  assert.deepEqual(Object.keys(out).sort(), ["bands", "cells", "id", "vocabulary"]);
});

// The shape check is shape only: a supplied table that breaks the §7 priority properties still
// loads, so a licensed table that departs from them on purpose drops in (§12); the property check
// below names what it breaks. The §10 property tests further down are scoped to the shipped table.
test("checkTableShape accepts a shape-valid table that violates the §7 priority properties", () => {
  const t = smallTable();
  t.cells["1-1-1"] = "H";  // S band 1 is not the lowest value
  t.cells["2-2-2"] = "L";  // priority falls as every factor rises
  const out = checkTableShape(t, "t");
  assert.equal(out.cells["1-1-1"], "H");
  assert.equal(out.cells["2-2-2"], "L");
});

// ---- the property check of a loaded table (§7): one message per broken property, naming the cells

const PROPERTY_TABLE = "table priority-test-properties breaks";

test("checkTableProperties finds no broken property in the shipped table, the alternative fixture table or the test table", () => {
  assert.deepEqual(checkTableProperties(loadTable()), []);
  assert.deepEqual(checkTableProperties(loadTable(fixturePath("tables", "well-formed-alt.json"))), []);
  assert.deepEqual(checkTableProperties(bandTable(["L", "M", "H"])), []);
});

test("checkTableProperties names each cell below the cell one band down in S, O or D, in the key order of the cell one band down", () => {
  const t = bandTable(["L", "M", "H"]);
  t.cells["2-1-1"] = "H";
  assert.deepEqual(checkTableProperties(t), [
    `${PROPERTY_TABLE} "priority never decreases as S, O or D increases" at 2-2-1 (M) below 2-1-1 (H), 2-1-2 (M) below 2-1-1 (H)`,
  ]);
  const u = bandTable(["L", "M", "H"]);
  u.cells["1-1-3"] = "M";
  u.cells["2-1-3"] = "L";
  u.cells["1-2-1"] = "M";
  assert.equal(
    checkTableProperties(u)[0],
    `${PROPERTY_TABLE} "priority never decreases as S, O or D increases" at 2-1-3 (L) below 1-1-3 (M), 1-2-3 (L) below 1-1-3 (M), 1-3-1 (L) below 1-2-1 (M), 1-2-2 (L) below 1-2-1 (M), 2-1-3 (L) below 2-1-2 (M)`,
  );
});

test("checkTableProperties names each cell of the S bands holding 9 or 10 that is below M", () => {
  const t = bandTable(["L", "L", "M"]);
  t.cells["3-1-1"] = "L";
  assert.deepEqual(checkTableProperties(t), [`${PROPERTY_TABLE} "S of 9 or 10 is never below M" at 3-1-1 (L)`]);
});

test("checkTableProperties names each cell of the S band holding 1 that is not L", () => {
  const t = bandTable(["L", "M", "H"]);
  t.cells["1-3-3"] = "M";
  assert.deepEqual(checkTableProperties(t), [`${PROPERTY_TABLE} "S of 1 is always L" at 1-3-3 (M)`]);
});

test("checkTableProperties names each cell below the cell with its S band and a lower O or D band exchanged", () => {
  const property = "severity outranks: exchanging the S band with a higher O or D band never lowers the priority";
  const viaO = bandTable(["L", "M", "M"]);
  const viaD = bandTable(["L", "M", "M"]);
  for (const c of [1, 2, 3]) {
    viaO.cells[`2-3-${c}`] = viaO.cells[`3-3-${c}`] = "H";
    viaD.cells[`2-${c}-3`] = viaD.cells[`3-${c}-3`] = "H";
  }
  assert.deepEqual(checkTableProperties(viaO), [`${PROPERTY_TABLE} "${property}" at 3-2-1 (M) below 2-3-1 (H), 3-2-2 (M) below 2-3-2 (H), 3-2-3 (M) below 2-3-3 (H)`]);
  assert.deepEqual(checkTableProperties(viaD), [`${PROPERTY_TABLE} "${property}" at 3-1-2 (M) below 2-1-3 (H), 3-2-2 (M) below 2-2-3 (H), 3-3-2 (M) below 2-3-3 (H)`]);
});

test("checkTableProperties reads the table's own bands and compares severity only over the band indices both factors have", () => {
  const t: PriorityTable = {
    id: "uneven", vocabulary: ["H", "M", "L"],
    bands: { S: [[1, 5], [6, 10]], O: [[1, 1], [2, 8], [9, 10]], D: [[1, 10]] },
    cells: { "1-1-1": "L", "1-2-1": "L", "1-3-1": "L", "2-1-1": "M", "2-2-1": "M", "2-3-1": "M" },
  };
  assert.deepEqual(checkTableProperties(t), []);
  t.cells["1-3-1"] = "M";
  assert.deepEqual(checkTableProperties(t), ['table uneven breaks "S of 1 is always L" at 1-3-1 (M)']);
});

test("checkTableProperties gives one message per broken property, in the order they are stated, and none for a one-value vocabulary", () => {
  const messages = checkTableProperties(bandTable(["H", "M", "L"]));
  assert.deepEqual(messages.map((m) => m.slice(0, m.indexOf('" at ') + 1)), [
    `${PROPERTY_TABLE} "priority never decreases as S, O or D increases"`,
    `${PROPERTY_TABLE} "S of 9 or 10 is never below M"`,
    `${PROPERTY_TABLE} "S of 1 is always L"`,
    `${PROPERTY_TABLE} "severity outranks: exchanging the S band with a higher O or D band never lowers the priority"`,
  ]);
  const one = bandTable(["P", "P", "P"]);
  one.vocabulary = ["P"];
  assert.deepEqual(checkTableProperties(one), []);
});

test("checkTableProperties checks S of 9 and S of 10 each when they fall in different S bands", () => {
  const split = (c: [string, string, string, string]): PriorityTable => ({
    id: "split", vocabulary: ["H", "M", "L"],
    bands: { S: [[1, 1], [2, 8], [9, 9], [10, 10]], O: [[1, 10]], D: [[1, 10]] },
    cells: { "1-1-1": c[0], "2-1-1": c[1], "3-1-1": c[2], "4-1-1": c[3] },
  });
  assert.deepEqual(checkTableProperties(split(["L", "L", "L", "M"])), ['table split breaks "S of 9 or 10 is never below M" at 3-1-1 (L)']);
  assert.deepEqual(checkTableProperties(split(["L", "L", "M", "L"])), [
    'table split breaks "priority never decreases as S, O or D increases" at 4-1-1 (L) below 3-1-1 (M)',
    'table split breaks "S of 9 or 10 is never below M" at 4-1-1 (L)',
  ]);
});

test("checkTableProperties reads M and L by position from the bottom of a vocabulary other than H, M, L", () => {
  const t: PriorityTable = {
    id: "five", vocabulary: ["Critical", "High", "Medium", "Low", "None"],
    bands: { S: [[1, 1], [2, 8], [9, 10]], O: [[1, 10]], D: [[1, 10]] },
    cells: { "1-1-1": "Low", "2-1-1": "Low", "3-1-1": "None" },
  };
  assert.deepEqual(checkTableProperties(t), [
    'table five breaks "priority never decreases as S, O or D increases" at 3-1-1 (None) below 2-1-1 (Low)',
    'table five breaks "S of 9 or 10 is never below Low" at 3-1-1 (None)',
    'table five breaks "S of 1 is always None" at 1-1-1 (Low)',
  ]);
});

// ---- lookup

test("bandIndex maps a rating to its 1-based band in the shipped table", () => {
  const table = loadTable();
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => bandIndex(table, "S", v)), [1, 2, 2, 3, 3, 3, 4, 4, 5, 5]);
});

test("bandIndex throws RATING_RANGE for 0, 11, 2.5, and the string \"3\"", () => {
  const table = loadTable();
  for (const bad of [0, 11, 2.5, "3"]) {
    assertScriptError(() => bandIndex(table, "O", bad as number), "RATING_RANGE", /rating O must be an integer from 1 to 10/);
  }
});

test("cellKey joins band indices with dashes", () => {
  assert.equal(cellKey(1, 2, 3), "1-2-3");
});

test("lookupPriority and computePriority agree with the shipped cell map", () => {
  const table = loadTable();
  assert.equal(lookupPriority(table, 8, 3, 4), "M");
  assert.deepEqual(computePriority(table, { S: rating(8), O: rating(3), D: rating(4) }), { value: "M", table: "priority-fmea-software-v1", rpn: 96 });
  assert.deepEqual(computePriority(table, { S: rating(10), O: rating(10), D: rating(10) }), { value: "H", table: "priority-fmea-software-v1", rpn: 1000 });
});

test("vocabularyRank is the index in the vocabulary, or its length when absent", () => {
  const table = loadTable();
  assert.equal(vocabularyRank(table, "H"), 0);
  assert.equal(vocabularyRank(table, "M"), 1);
  assert.equal(vocabularyRank(table, "L"), 2);
  assert.equal(vocabularyRank(table, "X"), table.vocabulary.length);
});

// ---- §10 property tests over the shipped table. Ranks compare by vocabulary index,
// where 0 is the highest priority, so "never decreases" means the rank never grows.

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test("every one of the 1,000 (S, O, D) combinations yields a vocabulary value", () => {
  const table = loadTable();
  let count = 0;
  for (const s of ALL) for (const o of ALL) for (const d of ALL) {
    assert.ok(table.vocabulary.includes(lookupPriority(table, s, o, d)), `no vocabulary value at S${s} O${o} D${d}`);
    count++;
  }
  assert.equal(count, 1000);
});

// The three assertions of the monotonicity test at one (S, O, D) point: raising any one factor
// by one rating never lowers the priority. `rank` gives the vocabulary rank at a point.
function assertNoDecreaseAt(rank: (s: number, o: number, d: number) => number, s: number, o: number, d: number): void {
  if (s < 10) assert.ok(rank(s + 1, o, d) <= rank(s, o, d), `S ${s}->${s + 1} at O${o} D${d} lowered the priority`);
  if (o < 10) assert.ok(rank(s, o + 1, d) <= rank(s, o, d), `O ${o}->${o + 1} at S${s} D${d} lowered the priority`);
  if (d < 10) assert.ok(rank(s, o, d + 1) <= rank(s, o, d), `D ${d}->${d + 1} at S${s} O${o} lowered the priority`);
}

test("priority never decreases as any one factor increases", () => {
  const table = loadTable();
  const rank = (s: number, o: number, d: number) => vocabularyRank(table, lookupPriority(table, s, o, d));
  for (const s of ALL) for (const o of ALL) for (const d of ALL) assertNoDecreaseAt(rank, s, o, d);
});

test("S 9 and 10 never rank below M, whatever O and D", () => {
  const table = loadTable();
  const mRank = vocabularyRank(table, "M");
  for (const s of [9, 10]) for (const o of ALL) for (const d of ALL) {
    assert.ok(vocabularyRank(table, lookupPriority(table, s, o, d)) <= mRank, `S${s} O${o} D${d} is below M`);
  }
});

test("S 1 is always L", () => {
  const table = loadTable();
  for (const o of ALL) for (const d of ALL) assert.equal(lookupPriority(table, 1, o, d), "L", `S1 O${o} D${d} is not L`);
});

test("severity outranks: the two swap inequalities of §7 hold over band indices", () => {
  const table = loadTable();
  const n = table.bands.S.length;
  assert.equal(table.bands.O.length, n);
  assert.equal(table.bands.D.length, n);
  const cell = (s: number, o: number, d: number) => vocabularyRank(table, table.cells[cellKey(s, o, d)]);
  for (let a = 2; a <= n; a++) for (let b = 1; b < a; b++) for (let c = 1; c <= n; c++) {
    // cell(a, b, c) >= cell(b, a, c) in priority means rank(a, b, c) <= rank(b, a, c)
    assert.ok(cell(a, b, c) <= cell(b, a, c), `cell(S=${a},O=${b},D=${c}) ranks below cell(S=${b},O=${a},D=${c})`);
    assert.ok(cell(a, c, b) <= cell(b, c, a), `cell(S=${a},O=${c},D=${b}) ranks below cell(S=${b},O=${c},D=${a})`);
  }
});

test("rpn equals S times O times D for every combination", () => {
  const table = loadTable();
  for (const s of ALL) for (const o of ALL) for (const d of ALL) {
    assert.equal(computePriority(table, { S: rating(s), O: rating(o), D: rating(d) }).rpn, s * o * d);
  }
});
