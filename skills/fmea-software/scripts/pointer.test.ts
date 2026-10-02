import assert from "node:assert/strict";
import { test } from "node:test";
import { chainIndex, ptr } from "./lib/pointer.ts";

test("ptr with no segments is the whole-document pointer", () => {
  assert.equal(ptr(), "");
});

test("ptr joins string and number segments", () => {
  assert.equal(ptr("chains", 1, "ratings", "S"), "/chains/1/ratings/S");
  assert.equal(ptr("meta"), "/meta");
});

test("ptr escapes tilde and slash inside a segment", () => {
  assert.equal(ptr("a~b"), "/a~0b");
  assert.equal(ptr("a/b"), "/a~1b");
  assert.equal(ptr("a~/b"), "/a~0~1b");
});

test("chainIndex reads the row index, matched segment by segment", () => {
  assert.equal(chainIndex("/chains/1/ratings/S"), 1);
  assert.equal(chainIndex("/chains/0"), 0);
  assert.equal(chainIndex("/chains/10"), 10);
  assert.equal(chainIndex("/chains/10/actions/2"), 10);
});

test("chainIndex is null for pointers outside a chain row", () => {
  assert.equal(chainIndex("/chains/1x"), null);
  assert.equal(chainIndex("/chains"), null);
  assert.equal(chainIndex("/meta/x"), null);
  assert.equal(chainIndex(""), null);
});
