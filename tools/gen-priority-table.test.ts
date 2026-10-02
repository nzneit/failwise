import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cellKey,
  cellValue,
  checkParams,
  generateTable,
  main,
  serializeTable,
} from "./gen-priority-table.ts";
import type { PriorityParams } from "./gen-priority-table.ts";

const PARAMS_PATH = join(import.meta.dirname, "priority-params.json");

function shippedParams(): PriorityParams {
  return checkParams(JSON.parse(readFileSync(PARAMS_PATH, "utf8")), PARAMS_PATH);
}

test("the shipped params produce one cell per band combination", () => {
  const table = generateTable(shippedParams());
  assert.equal(Object.keys(table.cells).length, 125);
});

test("the shipped params carry their id, vocabulary and bands into the table", () => {
  const params = shippedParams();
  const table = generateTable(params);
  assert.equal(table.id, "priority-fmea-software-v1");
  assert.deepEqual(table.vocabulary, ["H", "M", "L"]);
  assert.deepEqual(table.bands, params.bands);
});

test("the named cells hold the values the design fixes", () => {
  const table = generateTable(shippedParams());
  assert.equal(table.cells["1-1-1"], "L");
  assert.equal(table.cells["5-1-1"], "M");
  assert.equal(table.cells["5-3-3"], "H");
  assert.equal(table.cells["3-1-1"], "L");
  assert.equal(table.cells["3-5-5"], "H");
  assert.equal(table.cells["5-5-5"], "H");
});

test("every cell value is one of the vocabulary values", () => {
  const table = generateTable(shippedParams());
  for (const [key, value] of Object.entries(table.cells)) {
    assert.ok(table.vocabulary.includes(value), `cell ${key} holds ${value}`);
  }
});

test("cells are emitted in ascending s-o-d key order", () => {
  const table = generateTable(shippedParams());
  const expected: string[] = [];
  for (let s = 1; s <= 5; s++) {
    for (let o = 1; o <= 5; o++) {
      for (let d = 1; d <= 5; d++) expected.push(cellKey(s, o, d));
    }
  }
  assert.deepEqual(Object.keys(table.cells), expected);
});

test("generation is deterministic: two runs serialize identically", () => {
  const first = serializeTable(generateTable(shippedParams()));
  const second = serializeTable(generateTable(shippedParams()));
  assert.equal(first, second);
});

test("the floor rule beats the weighted sum for S band 1", () => {
  const params = shippedParams();
  assert.equal(cellValue(params, 1, 5, 5), "L");
});

test("checkParams rejects bands that leave a rating uncovered", () => {
  const broken = JSON.parse(JSON.stringify(shippedParams()));
  broken.bands.S = [[1, 4], [6, 10]];
  assert.throws(
    () => checkParams(broken, "broken.json"),
    /broken\.json: bands\.S must start at 5 and leave no gap or overlap/,
  );
});

test("main writes the generated table and reports the cell count", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-priority-table-"));
  try {
    const out = join(dir, "table.json");
    const lines: string[] = [];
    const status = main([PARAMS_PATH, out], (text) => { lines.push(text); }, (text) => { lines.push(text); });
    assert.equal(status, 0);
    assert.deepEqual(lines, [`${out}: 125 cells\n`]);
    assert.equal(readFileSync(out, "utf8"), serializeTable(generateTable(shippedParams())));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main refuses the wrong number of arguments", () => {
  const errors: string[] = [];
  const status = main(["only-one.json"], () => {}, (text) => { errors.push(text); });
  assert.equal(status, 1);
  assert.deepEqual(errors, ["error USAGE: usage: node tools/gen-priority-table.ts <params.json> <out.json>\n"]);
});

test("main reports an unreadable params file as an I/O failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-priority-table-"));
  try {
    const missing = join(dir, "no-such-params.json");
    const errors: string[] = [];
    const status = main([missing, join(dir, "table.json")], () => {}, (text) => { errors.push(text); });
    assert.equal(status, 3);
    assert.equal(errors.length, 1);
    assert.ok(
      errors[0].startsWith(`error IO_READ: cannot read ${missing}: `),
      `unexpected error line ${JSON.stringify(errors[0])}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main keeps a malformed params file's error on one line", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-priority-table-"));
  try {
    const malformed = join(dir, "malformed.json");
    writeFileSync(malformed, '{\n  "vocabulary": [H],\n  "bands": {}\n}\n');
    const errors: string[] = [];
    const status = main([malformed, join(dir, "table.json")], () => {}, (text) => { errors.push(text); });
    assert.equal(status, 3);
    assert.equal(errors.length, 1);
    assert.ok(
      errors[0].startsWith(`error IO_READ: cannot read ${malformed}: `),
      `unexpected error line ${JSON.stringify(errors[0])}`,
    );
    assert.ok(
      errors[0].endsWith("\n") && !errors[0].slice(0, -1).includes("\n"),
      `the error spans more than one line ${JSON.stringify(errors[0])}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main reports params that fail the shape check as a validation failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-priority-table-"));
  try {
    const broken = JSON.parse(readFileSync(PARAMS_PATH, "utf8"));
    broken.bands.S = [[1, 4], [6, 10]];
    const brokenPath = join(dir, "broken-params.json");
    writeFileSync(brokenPath, `${JSON.stringify(broken, null, 2)}\n`);
    const errors: string[] = [];
    const status = main([brokenPath, join(dir, "table.json")], () => {}, (text) => { errors.push(text); });
    assert.equal(status, 2);
    assert.deepEqual(errors, [
      `error PARAMS_INVALID: ${brokenPath}: bands.S must start at 5 and leave no gap or overlap\n`,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main reports an unwritable output path as an I/O failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-priority-table-"));
  try {
    const errors: string[] = [];
    const status = main([PARAMS_PATH, dir], () => {}, (text) => { errors.push(text); });
    assert.equal(status, 3);
    assert.equal(errors.length, 1);
    assert.ok(
      errors[0].startsWith(`error IO_WRITE: cannot write ${dir}: `),
      `unexpected error line ${JSON.stringify(errors[0])}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const TABLE_PATH = join(
  import.meta.dirname,
  "..",
  "skills",
  "fmea-software",
  "data",
  "priority-fmea-software-v1.json",
);

test("the committed table is exactly what the committed params generate", () => {
  assert.equal(readFileSync(TABLE_PATH, "utf8"), serializeTable(generateTable(shippedParams())));
});
