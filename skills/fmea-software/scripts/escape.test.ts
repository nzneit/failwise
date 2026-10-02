import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, escapeJsonForScript } from "./lib/escape.ts";
import { loadFixture } from "./test-helpers.ts";

const LINE_SEP = "\u2028";
const PARA_SEP = "\u2029";

/** Task 13's fixture: a closing script tag, an HTML comment opener, quotes and an ampersand,
 *  an onerror attribute, and U+2028 and U+2029 inside field values. */
const vectors: string[] = loadFixture<{ vectors: string[] }>("injection-vectors.json").vectors;

test("the injection fixture carries the six vectors the escaping tests need", () => {
  assert.equal(vectors.length, 6);
  assert.ok(vectors.some((v) => v.includes("</script>")));
  assert.ok(vectors.some((v) => v.includes("<!--")));
  assert.ok(vectors.some((v) => v.includes(LINE_SEP)));
  assert.ok(vectors.some((v) => v.includes(PARA_SEP)));
});

test("escapeHtml produces exactly the five named replacements", () => {
  assert.equal(escapeHtml("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("plain text"), "plain text");
});

test("every injection vector loses its markup characters under escapeHtml", () => {
  for (const v of vectors) {
    const escaped = escapeHtml(v);
    assert.equal(escaped.includes("<"), false, v);
    assert.equal(escaped.includes(">"), false, v);
    assert.equal(escaped.includes("\""), false, v);
    assert.equal(escaped.includes("'"), false, v);
    // every surviving ampersand opens one of the five entities
    assert.equal(escaped.replace(/&(?:amp|lt|gt|quot|#39);/g, "").includes("&"), false, v);
  }
});

test("escapeJsonForScript removes every character that can break out of a script block", () => {
  for (const v of vectors) {
    const json = JSON.stringify({ v });
    const escaped = escapeJsonForScript(json);
    assert.equal(escaped.includes("<"), false, v);
    assert.equal(escaped.includes(">"), false, v);
    assert.equal(escaped.includes("&"), false, v);
    assert.equal(escaped.includes(LINE_SEP), false, v);
    assert.equal(escaped.includes(PARA_SEP), false, v);
    assert.deepEqual(JSON.parse(escaped), { v });
  }
});

test("escapeJsonForScript leaves JSON without those characters unchanged", () => {
  const json = JSON.stringify({ name: "Checkout service DFMEA", version: 1 });
  assert.equal(escapeJsonForScript(json), json);
});
