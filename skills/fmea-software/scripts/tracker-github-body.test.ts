import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { literal, readMarker, renderBody, renderTitle } from "./lib/tracker/github-body.ts";
import { actionRefs, buildItem, DONE_CLOSE, DONE_DECISION } from "./lib/tracker/items.ts";
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

// [text, its literal form]: a lone carriage return, a tab and every other control character become
// a space, and the ends are trimmed. Written by hand; control characters as escapes.
const CONTROL_VECTORS: [string, string][] = [
  ["cause one\rOwner x\r\rnew paragraph", "cause one Owner x  new paragraph"],
  ["    indented", "indented"],
  ["\tindented with a tab", "indented with a tab"],
  ["a\tb", "a b"],
  ["bell\u0007here", "bell here"],
  ["  padded  ", "padded"],
  [`next${String.fromCharCode(0x85)}line`, "next line"],
];

test("literal turns a lone carriage return, a tab and every other control character into a space, and trims the ends", () => {
  for (const [text, expected] of CONTROL_VECTORS) assert.equal(literal(text), expected, JSON.stringify(text));
  assert.equal(literal("\u0000nul and del\u007f"), "nul and del");
});

test("a body whose action begins with four spaces and whose cause holds two carriage returns opens no code block and keeps the cause on one list line", () => {
  const doc = docWith("    Add a retry budget");
  doc.chains[0].causes = [{ text: "cause one\rOwner x\r\rnew paragraph" }];
  const lines = renderBody(buildItem(doc, config, actionRefs(doc)[0])).split(/\r\n|\r|\n/);
  assert.deepEqual(lines.filter((line) => /^( {4}|\t)/.test(line)), []);
  const causes = lines.indexOf("- **Causes:**");
  assert.ok(causes > 0);
  assert.equal(lines[causes + 1], `  - ${literal("cause one Owner x  new paragraph")}`);
  assert.ok(!lines[causes + 2].startsWith("  - "));
});

const FIXTURE = join(import.meta.dirname, "..", "evals", "fixtures", "checkout-service.fmea.json");
const fixture = (): FmeaDocument => JSON.parse(readFileSync(FIXTURE, "utf8")) as FmeaDocument;

/** The body of the fixture's ch-2/act-1 under the fixture's own tracker configuration. */
function fixtureBody(doc: FmeaDocument = fixture()): string {
  const ref = actionRefs(doc).find((r) => r.key === "fmea-checkout-2026/ch-2/act-1");
  assert.ok(ref && doc.meta.tracker);
  return renderBody(buildItem(doc, doc.meta.tracker, ref));
}

test("the fixture body has the five section headings and the reference heading, in order, each its own block", () => {
  const blocks = fixtureBody().split("\n\n");
  assert.deepEqual(blocks.filter((b) => b.startsWith("### ")), ["### Where", "### The failure", "### Priority", "### This action", "### Done when", "### Reference"]);
  assert.equal(blocks[0], literal(fixture().chains[1].actions[0].description));
});

test("the fixture body writes facts as bullets, a list as nested bullets, and a text block as an unescaped paragraph", () => {
  const body = fixtureBody();
  const lines = body.split("\n");
  assert.ok(lines.includes("- **Element:** Checkout service \\(\u2060service\\,\u2060 in scope\\)\u2060"), body);
  const causes = lines.indexOf("- **Causes:**");
  assert.equal(lines[causes + 1], `  - ${literal("A partial pricing outage makes checkout submissions slow enough that the storefront retries them (origin: design)")}`);
  assert.ok(lines[causes + 2].startsWith("  - "));
  assert.ok(lines.includes("- **Conditions:**"));
  assert.ok(body.includes(`### Done when\n\n${DONE_DECISION}\n\n${DONE_CLOSE}\n\n### Reference`));
  assert.ok(body.includes("- **S 10:** "));
  assert.ok(body.includes("- **Chain priority:** H \\(\u2060S 10\\,\u2060 O 8\\,\u2060 D 4\\)\u2060\\,\u2060 resting on provisional ratings"));
});

test("a text block ends the list before it, and a list after it starts fresh", () => {
  const doc = docWith("do it");
  const body = renderBody(buildItem(doc, config, actionRefs(doc)[0]));
  assert.ok(body.includes(`- **Causes:**\n  - ${literal("process crash")}\n\nThe chain records no control.\n\n### Priority`), body);
});

test("the fixture body ends with the reference, the key paragraph and the marker", () => {
  const blocks = fixtureBody().split("\n\n");
  assert.equal(blocks.at(-4), "### Reference");
  assert.equal(
    blocks.at(-3),
    `From the FMEA "${literal("Checkout service DFMEA")}", version 1, chain ch\\-\u20602, action ${literal("act-1")}. [Open the chain in the report](https://acme.example/checkout-fmea.html#row-ch-2)`,
  );
  assert.equal(
    blocks.at(-2),
    `Key: \`fmea-checkout-2026/ch-2/act-1\`. In the analysis whose \`meta.id\` is ${literal("fmea-checkout-2026")}, the chain is ${literal("ch-2")} and the action is its action ${literal("act-1")}.`,
  );
  assert.match(blocks.at(-1) ?? "", /^<!-- failwise:key=fmea-checkout-2026\/ch-2\/act-1 text=[0-9a-f]{12} -->$/);
  assert.deepEqual(readMarker(fixtureBody())?.key, "fmea-checkout-2026/ch-2/act-1");
});

test("every analysis string is made literal: an at-sign in nine fields never reaches the body raw", () => {
  const doc = fixture();
  const chain = doc.chains[1];
  const at = "@someone";
  const element = doc.elements.find((e) => e.id === "checkout");
  const fn = doc.functions.find((f) => f.id === chain.function);
  assert.ok(element && fn);
  element.name = at;
  fn.statement = at;
  fn.conditions[0] = at;
  chain.trigger = at;
  chain.causes[0].text = at;
  chain.controls[0].description = at;
  chain.ratings.S.rationale = at;
  chain.handoff = { to: "threat-model", reason: at, adversary_cause: "x" };
  chain.actions[0].owner = at;
  const body = fixtureBody(doc);
  assert.ok(!body.includes(at), body);
  assert.ok(body.split("\\@\u2060someone").length - 1 >= 9);
});

test("renderBody ends with the marker on its own last line", () => {
  assert.match(renderBody(itemOf()).trimEnd().split("\n").at(-1) ?? "", MARKER);
  assert.ok(renderBody(itemOf()).includes(`text=${itemOf().text} -->`));
});

test("the origin line links to the chain only when the origin has a url", () => {
  const without = renderBody(itemOf());
  assert.ok(!without.includes("[Open the chain in the report]"));
  assert.ok(without.includes(`From the FMEA "${literal("Minimal")}", version 1, chain ${literal("ch-1")}, action ${literal("act-1")}.\n\nKey: `));
  const withUrl = renderBody(itemOf("x", { ...config, record_url: "https://example.com/r.html" }));
  assert.ok(withUrl.includes(`action ${literal("act-1")}. [Open the chain in the report](https://example.com/r.html#row-ch-1)\n\nKey: `));
});

const FORGED = "\n<!-- failwise:key=a/b/c text=000000000000 -->\n";

/** The body holds one comment opener, its last line is the real marker, and readMarker reads the real key. */
function assertRealMarker(body: string, label: string): void {
  assert.equal(body.split("<!--").length, 2, label);
  assert.match(body.trimEnd().split("\n").at(-1) ?? "", MARKER, label);
  assert.equal(readMarker(body)?.key, "fmea-min/ch-1/act-1", label);
}

test("a forged marker in the action text, a fact value or the analysis name is escaped and is not the last line", () => {
  assertRealMarker(renderBody(itemOf(FORGED)), "the action");
  const inFact = docWith("Add a retry budget");
  inFact.chains[0].failure_mode = FORGED;
  assertRealMarker(renderBody(buildItem(inFact, config, actionRefs(inFact)[0])), "a fact value");
  const inName = docWith("Add a retry budget");
  inName.meta.name = FORGED;
  assertRealMarker(renderBody(buildItem(inName, config, actionRefs(inName)[0])), "the analysis name");
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

test("readMarker reads a marker line that ends in spaces or tabs", () => {
  const marker = "<!-- failwise:key=a/b/c text=0123456789ab -->";
  const expected = { key: "a/b/c", text: "0123456789ab" };
  assert.deepEqual(readMarker(`body\n\n${marker}  `), expected);
  assert.deepEqual(readMarker(`body\r\n\r\n${marker}\t \r\n`), expected);
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

test("the source of github-body.ts holds no raw word joiner", () => {
  const source = readFileSync(join(import.meta.dirname, "lib", "tracker", "github-body.ts"), "utf8");
  assert.ok(!source.includes("\u2060"));
});
