import assert from "node:assert/strict";
import { test } from "node:test";
import { countLines, countWords } from "./lib/measure.ts";

test("words are the whitespace-separated tokens wc -w counts", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("a  b\nc\t"), 3);
  assert.equal(countWords("a\u00a0b"), 2);
  assert.equal(countWords("| a | b |\n"), 5);
});

test("lines are the newlines wc -l counts", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\nb"), 1);
  assert.equal(countLines("a\r\nb\r\n"), 2);
});
