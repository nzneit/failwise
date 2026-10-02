import { test } from "node:test";
import assert from "node:assert/strict";
import { runLints } from "./lib/lints.ts";
import { qualityScore } from "./lib/quality.ts";
import { minimalDoc } from "./test-helpers.ts";
import type { Lint } from "./lib/types.ts";

const blocker = (pointer: string): Lint => ({ rule: "detection-1-without-evidenced-control", severity: "blocker", pointer, message: "blocker" });
const warning = (pointer: string): Lint => ({ rule: "rating-provisional", severity: "warning", pointer, message: "warning" });

test("an analysis with no chains scores 0", () => {
  assert.equal(qualityScore(0, []), 0);
  assert.equal(qualityScore(0, [blocker("/chains/0/ratings/D")]), 0);
});

test("a clean analysis scores 100", () => {
  assert.equal(qualityScore(8, []), 100);
});

test("eight rows with one blocker score 88", () => {
  assert.equal(qualityScore(8, [blocker("/chains/6/ratings/D")]), 88);
});

test("warnings never lower the score", () => {
  const lints = [warning("/chains/0/ratings/S"), warning("/chains/1/ratings/O"), warning("/chains/7/actions/1")];
  assert.equal(qualityScore(8, lints), 100);
});

test("two blockers on the same row dirty it once", () => {
  assert.equal(qualityScore(8, [blocker("/chains/6/ratings/D"), blocker("/chains/6/ratings/S")]), 88);
});

test("a blocker outside the chain rows zeroes the score", () => {
  assert.equal(qualityScore(8, [blocker("/meta/scope")]), 0);
  assert.equal(qualityScore(8, [blocker("")]), 0);
  assert.equal(qualityScore(8, [blocker("/chains")]), 0);
});

test("a document that records neither ground rules nor assumptions scores 0", () => {
  const doc = minimalDoc();
  const lints = runLints(doc);
  assert.deepEqual(lints.map((l) => `${l.severity} ${l.rule} ${l.pointer}`), [
    "blocker metadata-without-ground-rules /meta/ground_rules",
    "blocker metadata-without-ground-rules /meta/assumptions",
  ]);
  assert.equal(qualityScore(doc.chains.length, lints), 0);
});

test("row indexes are matched by segment, so /chains/10 is not /chains/1", () => {
  assert.equal(qualityScore(11, [blocker("/chains/10/x")]), 91);
  assert.equal(qualityScore(11, [blocker("/chains/10/x"), blocker("/chains/1/x")]), 82);
});

test("a blocker on a row index the document does not have is ignored", () => {
  assert.equal(qualityScore(8, [blocker("/chains/9/ratings/D")]), 100);
});

test("the score rounds half up, as Math.round does", () => {
  assert.equal(qualityScore(8, [blocker("/chains/0/x")]), 88);
  assert.equal(qualityScore(3, [blocker("/chains/0/x")]), 67);
  assert.equal(qualityScore(6, [blocker("/chains/0/x")]), 83);
});
