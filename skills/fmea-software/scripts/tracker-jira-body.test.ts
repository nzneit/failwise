import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdfDocument, readMarker, renderDescription, renderSummary } from "./lib/tracker/jira-body.ts";
import type { AdfDoc, AdfMark, AdfNode } from "./lib/tracker/jira-body.ts";
import { plain } from "./lib/tracker/text.ts";
import { CLOSING_LINE } from "./lib/tracker/provider.ts";
import { actionRefs, buildItem } from "./lib/tracker/items.ts";
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

test("the description is a doc of version 1 with the five parts in order, and only the node and mark types of §9", () => {
  const description = renderDescription(itemOf("Add a retry budget", { ...config, record_url: "https://r.example/x" }));
  assert.equal(description.version, 1);
  assert.equal(description.type, "doc");
  assert.ok(isAdfDocument(description));
  assert.deepEqual(description.content.map((node) => node.type), ["paragraph", "bulletList", "paragraph", "paragraph", "paragraph"]);
  for (const node of nodesOf(description.content)) assert.ok(["paragraph", "bulletList", "listItem", "text"].includes(node.type), node.type);
  for (const mark of marksOf(description)) assert.ok(["strong", "link", "code"].includes(mark.type), mark.type);
  assert.deepEqual(description.content[0].content, [text("Add a retry budget")]);
  const items = description.content[1].content ?? [];
  assert.equal(items.length, 7);
  assert.ok(items.every((item) => item.type === "listItem" && item.content?.length === 1 && item.content[0].type === "paragraph"));
  assert.deepEqual(items[0].content?.[0].content, [text("Failure mode", [{ type: "strong" }]), text(": stops serving")]);
  assert.deepEqual(
    items.map((item) => item.content?.[0].content?.[0].text),
    ["Failure mode", "End effect", "Causes", "Row priority", "Owner", "Target date", "Status when created"],
  );
  assert.deepEqual(description.content[3].content, [text(CLOSING_LINE)]);
});

test("the origin paragraph carries the link to the row only when the item has a url, and it is the only link", () => {
  const withUrl = renderDescription(itemOf("x", { ...config, record_url: "https://r.example/x" }));
  const origin = withUrl.content[2].content ?? [];
  assert.deepEqual(origin, [
    text('From the FMEA "Minimal", row ch-1, action act-1.'),
    text(" "),
    text("Open the row in the report", [{ type: "link", attrs: { href: "https://r.example/x#row-ch-1" } }]),
  ]);
  assert.equal(marksOf(withUrl).filter((mark) => mark.type === "link").length, 1);
  const without = renderDescription(itemOf("x"));
  assert.deepEqual(without.content[2].content, [text('From the FMEA "Minimal", row ch-1, action act-1.')]);
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

test("renderSummary makes NUL, U+0001, ESC and DEL a space each, collapses the whitespace, and leaves no control character", () => {
  const [nul, one, esc, del] = [0x00, 0x01, 0x1b, 0x7f].map((code) => String.fromCharCode(code));
  const summary = renderSummary({ ...itemOf().content, title: `${del}a${nul}b${one}c${esc}${esc}d ${del} e${nul}` });
  assert.equal(summary, "a b c d e");
  assert.ok(!Array.from(summary).some((ch) => (ch.codePointAt(0) ?? 0) <= 0x1f || ch.codePointAt(0) === 0x7f), JSON.stringify(summary));
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
    { type: "paragraph", attrs: { localId: "afe9c307238a" }, content: [text(CLOSING_LINE)] },
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
