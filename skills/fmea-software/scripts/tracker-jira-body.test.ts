import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdfDocument, readMarker, renderDescription, renderSummary } from "./lib/tracker/jira-body.ts";
import type { AdfDoc, AdfMark, AdfNode } from "./lib/tracker/jira-body.ts";
import { plain } from "./lib/tracker/text.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { actionRefs, buildItem, DONE_CLOSE, DONE_DECISION } from "./lib/tracker/items.ts";
import { minimalDoc } from "./test-helpers.ts";
import type { FmeaDocument, TrackerConfig } from "./lib/types.ts";
import type { TrackedItem } from "./lib/tracker/provider.ts";

const config: TrackerConfig = { provider: "jira", host: "jira.example.com", project: "FAILW", label: "failwise" };

function docWith(description: string): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description, owner: "A. Owner", status: "Open", target_date: "2026-11-01" }];
  return doc;
}

const itemOf = (description = "Add a retry budget", cfg: TrackerConfig = config): TrackedItem => {
  const doc = docWith(description);
  return buildItem(doc, cfg, actionRefs(doc)[0]);
};

const MARKER = /^failwise:key=fmea-min\/ch-1\/act-1 text=[0-9a-f]{12}$/;

/** Every node of a tree, the root's children first, depth first. */
function nodesOf(nodes: AdfNode[]): AdfNode[] {
  return nodes.flatMap((node) => [node, ...nodesOf(node.content ?? [])]);
}

function marksOf(doc: AdfDoc): AdfMark[] {
  return nodesOf(doc.content).flatMap((node) => node.marks ?? []);
}

function paragraph(...content: AdfNode[]): AdfNode {
  return { type: "paragraph", content };
}

function text(value: string, marks?: AdfMark[]): AdfNode {
  return marks === undefined ? { type: "text", text: value } : { type: "text", text: value, marks };
}

const doc = (...content: AdfNode[]): AdfDoc => ({ version: 1, type: "doc", content });
const MARKER_TEXT = "failwise:key=a/b/c text=0123456789ab";
const EXPECTED = { key: "a/b/c", text: "0123456789ab" };

const FIXTURE = join(import.meta.dirname, "..", "evals", "fixtures", "checkout-service.fmea.json");

/** The description of the fixture's ch-2/act-1 under its own tracker configuration, made a Jira one. */
function fixtureDescription(): AdfDoc {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as FmeaDocument;
  const ref = actionRefs(fixture).find((r) => r.key === "fmea-checkout-2026/ch-2/act-1");
  assert.ok(ref);
  return renderDescription(buildItem(fixture, { ...config, record_url: "https://acme.example/checkout-fmea.html" }, ref));
}

const STRONG = [{ type: "strong" }];

/** Fails on a node type or a mark outside the set the spike verified, and on a list nested in a list item. */
function assertVerifiedNodes(nodes: AdfNode[], inItem = false): void {
  for (const node of nodes) {
    assert.ok(["paragraph", "bulletList", "listItem", "text"].includes(node.type), node.type);
    assert.ok(!(inItem && node.type === "bulletList"), "a bulletList inside a listItem");
    for (const mark of node.marks ?? []) assert.ok(["strong", "link", "code"].includes(mark.type), mark.type);
    assertVerifiedNodes(node.content ?? [], inItem || node.type === "listItem");
  }
}

test("the fixture description holds only paragraph, bulletList, listItem and text, the strong, link and code marks, and no nested list", () => {
  const description = fixtureDescription();
  assert.equal(description.version, 1);
  assert.equal(description.type, "doc");
  assert.ok(isAdfDocument(description));
  assertVerifiedNodes(description.content);
});

/** The text of a paragraph that holds one strong text node, else null. */
const headingOf = (node: AdfNode): string | null =>
  node.type === "paragraph" && node.content?.length === 1 && node.content[0].marks?.[0]?.type === "strong" ? node.content[0].text ?? null : null;

test("the heading paragraphs come in order, each a paragraph of one strong text node", () => {
  const description = fixtureDescription();
  const headings = description.content.map(headingOf).filter((h) => h !== null && ["Where", "The failure", "Priority", "This action", "Done when", "Reference"].includes(h));
  assert.deepEqual(headings, ["Where", "The failure", "Priority", "This action", "Done when", "Reference"]);
  assert.deepEqual(description.content[0].content, [text("Decide whether the storefront's retry budget or a server-side admission control is the right place to bound retried load, and record the decision in the interface contract")]);
  assert.deepEqual(description.content[1], paragraph(text("Where", STRONG)));
});

test("a run of facts is one bullet list of label-and-value items, and a list block is a strong paragraph then a bullet list", () => {
  const content = fixtureDescription().content;
  const where = content.findIndex((n) => headingOf(n) === "Where");
  const facts = content[where + 1];
  assert.equal(facts.type, "bulletList");
  assert.deepEqual(facts.content?.map((i) => i.content?.[0].content), [
    [text("Element", STRONG), text(": Checkout service (service, in scope)")],
    [text("Function", STRONG), text(": Turn a submitted cart into a confirmed order exactly once")],
    [text("For whom", STRONG), text(": signed-in shoppers")],
  ]);
  assert.deepEqual(content[where + 2], paragraph(text("Conditions", STRONG)));
  assert.deepEqual(content[where + 3], {
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph(text("under promotion traffic"))] },
      { type: "listItem", content: [paragraph(text("while a dependency is degraded"))] },
    ],
  });
  assert.deepEqual(content[where + 4], paragraph(text("The failure", STRONG)));
});

test("a text block is a plain paragraph, and the done passages are the two paragraphs after their heading", () => {
  const content = fixtureDescription().content;
  const done = content.findIndex((n) => headingOf(n) === "Done when");
  assert.deepEqual(content[done + 1], paragraph(text(DONE_DECISION)));
  assert.deepEqual(content[done + 2], paragraph(text(DONE_CLOSE)));
  assert.equal(headingOf(content[done + 3]), "Reference");
  const bare = renderDescription(itemOf()).content;
  assert.ok(bare.some((n) => JSON.stringify(n) === JSON.stringify(paragraph(text("The chain records no control.")))));
});

test("the reference: the origin with version and chain, then the key with code marks on the key and on meta.id, then the marker", () => {
  const content = fixtureDescription().content;
  const reference = content.findIndex((n) => headingOf(n) === "Reference");
  assert.deepEqual(content[reference + 1].content, [
    text('From the FMEA "Checkout service DFMEA", version 1, chain ch-2, action act-1.'),
    text(" "),
    text("Open the chain in the report", [{ type: "link", attrs: { href: "https://acme.example/checkout-fmea.html#row-ch-2" } }]),
  ]);
  assert.deepEqual(content[reference + 2].content, [
    text("Key: "),
    text("fmea-checkout-2026/ch-2/act-1", [{ type: "code" }]),
    text(". In the analysis whose "),
    text("meta.id", [{ type: "code" }]),
    text(" is fmea-checkout-2026, the chain is ch-2 and the action is its action act-1."),
  ]);
  assert.equal(reference + 4, content.length);
  assert.equal(readMarker(fixtureDescription())?.key, "fmea-checkout-2026/ch-2/act-1");
});

test("the origin paragraph carries the link to the chain only when the item has a url, and it is the only link", () => {
  const withUrl = renderDescription(itemOf("x", { ...config, record_url: "https://r.example/x" }));
  const origin = withUrl.content.at(-3)?.content ?? [];
  assert.deepEqual(origin, [
    text('From the FMEA "Minimal", version 1, chain ch-1, action act-1.'),
    text(" "),
    text("Open the chain in the report", [{ type: "link", attrs: { href: "https://r.example/x#row-ch-1" } }]),
  ]);
  assert.equal(marksOf(withUrl).filter((mark) => mark.type === "link").length, 1);
  const without = renderDescription(itemOf("x"));
  assert.deepEqual(without.content.at(-3)?.content, [text('From the FMEA "Minimal", version 1, chain ch-1, action act-1.')]);
  assert.equal(marksOf(without).filter((mark) => mark.type === "link").length, 0);
});

test("the marker is the last paragraph: one text node failwise:key=<key> text=<hash> with the code mark", () => {
  const item = itemOf();
  const last = renderDescription(item).content.at(-1);
  assert.equal(last?.type, "paragraph");
  assert.equal(last?.content?.length, 1);
  const marker = last?.content?.[0];
  assert.match(marker?.text ?? "", MARKER);
  assert.equal(marker?.text, `failwise:key=${item.key} text=${item.text}`);
  assert.deepEqual(marker?.marks, [{ type: "code" }]);
});

test("a CR, a CRLF, an LF, a tab and a NUL in the action become one space each and the text is trimmed", () => {
  const raw = " a\rb\r\nc\nd\te\u0000f ";
  assert.deepEqual(renderDescription(itemOf(raw)).content[0].content, [text("a b c d e f")]);
  assert.equal(plain(raw), "a b c d e f");
  assert.equal(plain("\u007fdel\u001f"), "del");
});

test("a URL, an at-sign, a hash reference and angle brackets in the action stay text with no mark", () => {
  const action = "See https://example.com/x and ask @someone; refs #12 and <b>bold</b>";
  assert.deepEqual(renderDescription(itemOf(action)).content[0].content, [{ type: "text", text: action }]);
});

test("renderSummary collapses whitespace and cuts at 255 code points, and a line break never survives", () => {
  const content = itemOf().content;
  const long = renderSummary({ ...content, title: "é".repeat(300) });
  assert.equal(Array.from(long).length, 255);
  assert.equal(long, "é".repeat(255));
  assert.equal(renderSummary({ ...content, title: "a\nb  c" }), "a b c");
  assert.equal(renderSummary({ ...content, title: " a\r\n\tb\r" }), "a b");
  assert.equal(renderSummary({ ...content, title: "😀".repeat(256) }), "😀".repeat(255));
});

test("renderSummary trims the end after the cut, so a space at the 255th code point never ends the summary", () => {
  const content = itemOf().content;
  assert.equal(renderSummary({ ...content, title: `${"a".repeat(254)} bbbbb` }), "a".repeat(254));
  for (const head of ["x".repeat(254), "é".repeat(254), "😀".repeat(254)]) {
    const summary = renderSummary({ ...content, title: `${head} more text after the cut` });
    assert.ok(!summary.endsWith(" "), JSON.stringify(summary));
    assert.ok(Array.from(summary).length <= 255);
  }
});

test("renderSummary makes NUL, U+0001, ESC and DEL a space each, collapses the whitespace, and leaves no control character", () => {
  const [nul, one, esc, del] = [0x00, 0x01, 0x1b, 0x7f].map((code) => String.fromCharCode(code));
  const summary = renderSummary({ ...itemOf().content, title: `${del}a${nul}b${one}c${esc}${esc}d ${del} e${nul}` });
  assert.equal(summary, "a b c d e");
  assert.ok(!Array.from(summary).some((ch) => (ch.codePointAt(0) ?? 0) <= 0x1f || ch.codePointAt(0) === 0x7f), JSON.stringify(summary));
});

test("renderSummary makes U+0080, U+0085, U+009F and U+2028 a space each and collapses the whitespace", () => {
  const [pad, nel, apc, lsep] = [0x80, 0x85, 0x9f, 0x2028].map((code) => String.fromCharCode(code));
  assert.equal(renderSummary({ ...itemOf().content, title: `${pad}a${nel}b${apc}${apc}c ${lsep} d${nel}` }), "a b c d");
});

test("readMarker reads the key and text from the last paragraph, with and without the code mark", () => {
  const item = itemOf();
  assert.deepEqual(readMarker(renderDescription(item)), { key: item.key, text: item.text });
  assert.deepEqual(readMarker(doc(paragraph(text("body")), paragraph(text(MARKER_TEXT)))), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(MARKER_TEXT, [{ type: "code" }])))), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(`  ${MARKER_TEXT} `)))), EXPECTED);
});

test("readMarker ignores attrs, a trailing empty paragraph, and a trailing paragraph of whitespace and a hard break", () => {
  const withAttrs: AdfNode = { type: "paragraph", attrs: { localId: "x" }, content: [{ ...text(MARKER_TEXT), attrs: { y: 1 } }] };
  assert.deepEqual(readMarker(doc(withAttrs)), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(MARKER_TEXT)), paragraph())), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(MARKER_TEXT)), { type: "paragraph" })), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(MARKER_TEXT)), paragraph(text("  \t"), { type: "hardBreak" }), paragraph())), EXPECTED);
  assert.deepEqual(readMarker(doc(paragraph(text(MARKER_TEXT), text(" "), { type: "hardBreak" }))), EXPECTED);
});

test("readMarker finds the marker after the recorded browser edit: localId on every paragraph and two hardBreak nodes after the marker in its paragraph", () => {
  const edited = doc(
    { type: "paragraph", attrs: { localId: "afe9c307238a" }, content: [text(DONE_CLOSE)] },
    {
      type: "paragraph",
      attrs: { localId: "ebe19c2c611c" },
      content: [text("failwise:key=checkout-fmea/ch-2/act-1 text=0123456789ab", [{ type: "code" }]), { type: "hardBreak" }, { type: "hardBreak" }],
    },
  );
  assert.deepEqual(readMarker(edited), { key: "checkout-fmea/ch-2/act-1", text: "0123456789ab" });
});

test("readMarker gives null for null, a forged marker inside the action text, a last paragraph with two non-blank nodes, a hash of the wrong length, a key that is not three plain ids, and a last node that is not a paragraph", () => {
  assert.equal(readMarker(null), null);
  assert.equal(readMarker(doc()), null);
  const forged = renderDescription(itemOf(MARKER_TEXT));
  assert.equal(readMarker(forged)?.key, "fmea-min/ch-1/act-1");
  assert.equal(readMarker(doc(...forged.content.slice(0, -1))), null);
  assert.equal(readMarker(doc(paragraph(text(`see ${MARKER_TEXT}`)))), null);
  assert.equal(readMarker(doc(paragraph(text(MARKER_TEXT), text("edited")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/c "), text("text=0123456789ab")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/c text=0123456789a")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/c text=0123456789abc")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/c text=0123456789AB")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b text=0123456789ab")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/c/d text=0123456789ab")))), null);
  assert.equal(readMarker(doc(paragraph(text("failwise:key=a/b/C! text=0123456789ab")))), null);
  assert.equal(readMarker(doc(paragraph(text(MARKER_TEXT)), { type: "bulletList", content: [] })), null);
  assert.equal(readMarker(doc(paragraph(text(MARKER_TEXT)), paragraph(text("after")))), null);
  assert.equal(readMarker(doc(paragraph({ type: "hardBreak" }, text(MARKER_TEXT)))), null);
});

test("readMarker gives null, never a throw, for nodes that are not objects or content that is not an array", () => {
  const odd = { version: 1, type: "doc", content: [null, 7, { type: "paragraph", content: "x" }] } as unknown as AdfDoc;
  assert.equal(readMarker(odd), null);
  const oddText = { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: 5 }, null] }] } as unknown as AdfDoc;
  assert.equal(readMarker(oddText), null);
});

test("isAdfDocument holds for an object whose type is doc and whose content is an array, and nothing else", () => {
  assert.ok(isAdfDocument({ type: "doc", content: [] }));
  assert.ok(isAdfDocument({ version: 1, type: "doc", content: [paragraph()] }));
  assert.ok(!isAdfDocument(null));
  assert.ok(!isAdfDocument("doc"));
  assert.ok(!isAdfDocument([]));
  assert.ok(!isAdfDocument({ type: "paragraph", content: [] }));
  assert.ok(!isAdfDocument({ type: "doc", content: {} }));
  assert.ok(!isAdfDocument({ type: "doc" }));
});
