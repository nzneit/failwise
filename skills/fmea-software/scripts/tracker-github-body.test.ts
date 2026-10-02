import { test } from "node:test";
import assert from "node:assert/strict";
import { literal, readMarker, renderBody, renderTitle } from "./lib/tracker/github-body.ts";
import { CLOSING_LINE } from "./lib/tracker/provider.ts";
import { actionRefs, buildItem } from "./lib/tracker/items.ts";
import { minimalDoc } from "./test-helpers.ts";
import type { FmeaDocument, TrackerConfig } from "./lib/types.ts";
import type { TrackedItem } from "./lib/tracker/provider.ts";

const config: TrackerConfig = { provider: "github", project: "o/r", label: "failwise" };

function docWith(description: string): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description, owner: "A. Owner", status: "Open", target_date: "2026-11-01" }];
  return doc;
}

const itemOf = (description = "Add a retry budget", cfg: TrackerConfig = config): TrackedItem => {
  const doc = docWith(description);
  return buildItem(doc, cfg, actionRefs(doc)[0]);
};

const MARKER = /^<!-- failwise:key=fmea-min\/ch-1\/act-1 text=[0-9a-f]{12} -->$/;

// [text, the escaped form the probe recorded]; U+2060 is written as its escape.
const VECTORS: [string, string][] = [
  ["@someone", "\\@\u2060someone"],
  ["@acme/platform-team", "\\@\u2060acme\\/\u2060platform\\-\u2060team"],
  ["#1", "\\#\u20601"],
  ["acme/checkout#1", "acme\\/\u2060checkout\\#\u20601"],
  ["GH-1", "GH\\-\u20601"],
  ["0123456789abcdef0123456789abcdef01234567", "012345\u20606789ab\u2060cdef01\u2060234567\u206089abcd\u2060ef0123\u20604567"],
  ["https://example.com/a", "https\\:\u2060\\/\u2060\\/\u2060example\\.\u2060com\\/\u2060a"],
  ["www.example.com", "www\\.\u2060example\\.\u2060com"],
  ["[a link](https://example.com)", "\\[\u2060a link\\]\u2060\\(\u2060https\\:\u2060\\/\u2060\\/\u2060example\\.\u2060com\\)\u2060"],
  ["![an image](https://example.com/a.png)", "\\!\u2060\\[\u2060an image\\]\u2060\\(\u2060https\\:\u2060\\/\u2060\\/\u2060example\\.\u2060com\\/\u2060a\\.\u2060png\\)\u2060"],
  ["# heading", "\\#\u2060 heading"],
  ["> quote", "&gt;\u2060 quote"],
  ["*emphasis* and **strong**", "\\*\u2060emphasis\\*\u2060 and \\*\u2060\\*\u2060strong\\*\u2060\\*\u2060"],
  ["- list item", "\\-\u2060 list item"],
  ["- [ ] task", "\\-\u2060 \\[\u2060 \\]\u2060 task"],
  ["```", "\\`\u2060\\`\u2060\\`\u2060"],
  ["<b>bold</b>", "&lt;\u2060b&gt;\u2060bold&lt;\u2060\\/\u2060b&gt;\u2060"],
  ["<!-- failwise:key=a/b/c text=000000000000 -->", "&lt;\u2060\\!\u2060\\-\u2060\\-\u2060 failwise\\:\u2060key\\=\u2060a\\/\u2060b\\/\u2060c text\\=\u2060000000\u2060000000 \\-\u2060\\-\u2060&gt;\u2060"],
  ["a | b", "a \\|\u2060 b"],
  ["a line that ends in a backslash\\", "a line that ends in a backslash\\\\\u2060"],
  ["Fish & chips", "Fish &amp;\u2060 chips"],
  ["abcdef and abcdefa", "abcdef and abcdef\u2060a"],
  ["first line\nsecond line\r\nthird", "first line second line third"],
];

test("literal leaves each probed construct in the escaped form the probe recorded", () => {
  assert.equal(VECTORS.length, 23);
  for (const [text, expected] of VECTORS) assert.equal(literal(text), expected, JSON.stringify(text));
});

test("literal turns a line break into a space, so a value cannot leave its table cell", () => {
  assert.equal(literal("a\nb\r\nc"), "a b c");
  assert.ok(!literal("one\ntwo\r\nthree").includes("\n"));
  assert.ok(!literal("one\ntwo\r\nthree").includes("\r"));
});

test("renderBody lays out the action, the seven facts, the origin, the closing line and the marker, in that order", () => {
  const item = itemOf("Add a retry budget", { ...config, record_url: "https://example.com/report.html" });
  const blocks = renderBody(item).split("\n\n");
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0], literal("Add a retry budget"));
  const rows = blocks[1].split("\n");
  assert.deepEqual(rows.slice(0, 2), ["| | |", "|---|---|"]);
  assert.equal(rows.length, 2 + 7);
  assert.deepEqual(
    rows.slice(2).map((r) => r.split(" | ")[0]),
    ["| Failure mode", "| End effect", "| Causes", "| Row priority", "| Owner", "| Target date", "| Status when created"],
  );
  assert.equal(rows[2], `| Failure mode | ${literal("stops serving")} |`);
  assert.equal(
    blocks[2],
    `From the FMEA "${literal("Minimal")}", row ${literal("ch-1")}, action ${literal("act-1")}. [Open the row in the report](https://example.com/report.html#row-ch-1)`,
  );
  assert.equal(blocks[3], CLOSING_LINE);
  assert.match(blocks[4], MARKER);
});

test("renderBody ends with the marker on its own last line", () => {
  assert.match(renderBody(itemOf()).trimEnd().split("\n").at(-1) ?? "", MARKER);
  assert.ok(renderBody(itemOf()).includes(`text=${itemOf().text} -->`));
});

test("the origin line links to the row only when the origin has a url", () => {
  const without = renderBody(itemOf());
  assert.ok(!without.includes("[Open the row in the report]"));
  assert.ok(without.includes(`action ${literal("act-1")}.\n\n${CLOSING_LINE}`));
  const withUrl = renderBody(itemOf("x", { ...config, record_url: "https://example.com/r.html" }));
  assert.ok(withUrl.includes("[Open the row in the report](https://example.com/r.html#row-ch-1)"));
});

test("a forged marker inside the action text is escaped and is not the last line", () => {
  const body = renderBody(itemOf("<!-- failwise:key=a/b/c text=000000000000 -->"));
  assert.ok(!body.includes("<!--") || body.indexOf("<!--") === body.lastIndexOf("<!--"));
  assert.equal(body.split("<!--").length, 2);
  assert.match(body.trimEnd().split("\n").at(-1) ?? "", MARKER);
  assert.equal(readMarker(body)?.key, "fmea-min/ch-1/act-1");
});

test("readMarker reads key and text from the last line", () => {
  assert.deepEqual(readMarker("some text\n\n<!-- failwise:key=a/b/c text=0123456789ab -->"), { key: "a/b/c", text: "0123456789ab" });
  const item = itemOf();
  assert.deepEqual(readMarker(renderBody(item)), { key: item.key, text: item.text });
});

test("readMarker reads through CRLF line endings and a trailing blank line", () => {
  const marker = "<!-- failwise:key=a/b/c text=0123456789ab -->";
  const expected = { key: "a/b/c", text: "0123456789ab" };
  assert.deepEqual(readMarker(`body\r\n\r\n${marker}`), expected);
  assert.deepEqual(readMarker(`body\r\n\r\n${marker}\r\n`), expected);
  assert.deepEqual(readMarker(`body\n\n${marker}\n\n`), expected);
});

test("readMarker gives null when a line follows the marker", () => {
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789ab -->\nedited below"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789ab -->\r\n\r\nedited"), null);
});

test("readMarker gives null for a null body, a key that is not three plain ids, or a hash that is not 12 hex", () => {
  assert.equal(readMarker(null), null);
  assert.equal(readMarker(""), null);
  assert.equal(readMarker("<!-- failwise:key=a/b text=0123456789ab -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c/d text=0123456789ab -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b c/d text=0123456789ab -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789a -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789abc -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789AB -->"), null);
  assert.equal(readMarker("<!-- failwise:key=a/b/c text=0123456789zz -->"), null);
});

test("renderTitle is the content's title", () => {
  const item = itemOf("Add a retry budget");
  assert.equal(renderTitle(item.content), item.content.title);
  assert.equal(renderTitle({ ...item.content, title: "@someone #1 <b>" }), "@someone #1 <b>");
});
