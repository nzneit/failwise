import { test } from "node:test";
import assert from "node:assert/strict";
import { rowFileStem, rowStem } from "../dev/browser/matrix.ts";

test("a row's comparison stem is its id reduced as the screenshot command reduces it, with no position", () => {
  assert.equal(rowStem("row-ch-2"), "row-ch-2");
  assert.equal(rowStem("row-a/b c"), "row-a-b-c");
  assert.equal(rowFileStem(12, "row-a/b c"), "row-12-a-b-c");
});
