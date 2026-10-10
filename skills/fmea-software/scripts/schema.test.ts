// Tests for lib/schema.ts: one case per supported keyword against a tiny inline schema, the
// minimal and golden documents passing, and the drift test that ties the interpreter to the
// schema file (§9: a test walks the schema's required lists, enums, formats, and patterns and
// fails on drift). The drift test derives its violations from two documents — the golden
// fixture and a second document built here — because the golden alone cannot instantiate every
// constrained node of the schema.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ScriptError } from "./lib/codes.ts";
import type { Issue } from "./lib/codes.ts";
import { checkSchema, loadSchema, SCHEMA_PATH, SUPPORTED_FORMATS, SUPPORTED_KEYWORDS, forEachSchemaNode } from "./lib/schema.ts";
import type { SchemaNode } from "./lib/schema.ts";
import { ptr } from "./lib/pointer.ts";
import { clone, loadFixture, minimalDoc, rating } from "./test-helpers.ts";
import type { Computed, FmeaDocument, HistoryEntry, Stale } from "./lib/types.ts";

// The pointers of the issues checkSchema reports for doc against schema, sorted.
function pointers(doc: unknown, schema: SchemaNode): string[] {
  return checkSchema(doc, schema).map((i) => i.pointer).sort();
}

function assertIssueShape(issues: Issue[]): void {
  for (const i of issues) {
    assert.equal(i.code, "SCHEMA");
    assert.equal(i.rule, "schema");
    assert.ok(i.message.length > 0);
    assert.equal(typeof i.pointer, "string");
  }
}

test("type: a single type name", () => {
  const schema: SchemaNode = { type: "string" };
  assert.deepEqual(pointers("x", schema), []);
  const issues = checkSchema(5, schema);
  assertIssueShape(issues);
  assert.deepEqual(issues.map((i) => i.pointer), [""]);
  assert.match(issues[0].message, /expected type string, got integer/);
});

test("type: an array of type names accepts any of them", () => {
  const schema: SchemaNode = { type: ["string", "null"] };
  assert.deepEqual(pointers("x", schema), []);
  assert.deepEqual(pointers(null, schema), []);
  assert.deepEqual(pointers(1, schema), [""]);
});

test("type: integer is distinct from number", () => {
  assert.deepEqual(pointers(1.5, { type: "integer" }), [""]);
  assert.deepEqual(pointers(1.5, { type: "number" }), []);
  assert.deepEqual(pointers(2, { type: "integer" }), []);
  assert.deepEqual(pointers(2, { type: "number" }), []);
});

test("type: object, array, boolean, null", () => {
  assert.deepEqual(pointers([], { type: "object" }), [""]);
  assert.deepEqual(pointers(null, { type: "object" }), [""]);
  assert.deepEqual(pointers({}, { type: "object" }), []);
  assert.deepEqual(pointers({}, { type: "array" }), [""]);
  assert.deepEqual(pointers([], { type: "array" }), []);
  assert.deepEqual(pointers(0, { type: "boolean" }), [""]);
  assert.deepEqual(pointers(false, { type: "boolean" }), []);
  assert.deepEqual(pointers(0, { type: "null" }), [""]);
  assert.deepEqual(pointers(null, { type: "null" }), []);
});

test("required: one issue per missing property, at the object's pointer", () => {
  const schema: SchemaNode = { type: "object", required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "string" } } };
  assert.deepEqual(pointers({ a: "x", b: "y" }, schema), []);
  const issues = checkSchema({ a: "x" }, schema);
  assert.deepEqual(issues.map((i) => i.pointer), [""]);
  assert.match(issues[0].message, /missing required property "b"/);
  assert.equal(checkSchema({}, schema).length, 2);
});

test("properties: each present property is checked at its own pointer", () => {
  const schema: SchemaNode = { type: "object", properties: { a: { type: "string" }, n: { type: "object", properties: { deep: { type: "integer" } } } } };
  assert.deepEqual(pointers({ a: 1, n: { deep: "no" } }, schema), ["/a", "/n/deep"]);
  assert.deepEqual(pointers({}, schema), []);
});

test("additionalProperties: false reports the offending key's pointer", () => {
  const schema: SchemaNode = { type: "object", additionalProperties: false, properties: { a: { type: "string" } } };
  const issues = checkSchema({ a: "x", extra: 1, "we/ird": 2 }, schema);
  assert.deepEqual(issues.map((i) => i.pointer).sort(), ["/extra", "/we~1ird"]);
  assert.match(issues[0].message, /unexpected property/);
});

test("issues come out in a fixed order: missing required, then unexpected keys, then declared properties", () => {
  const schema: SchemaNode = { type: "object", additionalProperties: false, required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "string" } } };
  assert.deepEqual(checkSchema({ a: 1, extra: 2 }, schema).map((i) => i.pointer), ["", "/extra", "/a"]);
  assert.deepEqual(checkSchema([1, "x", 3, "y"], { type: "array", items: { type: "integer" } }).map((i) => i.pointer), ["/1", "/3"]);
});

test("items: every element is checked at its index", () => {
  const schema: SchemaNode = { type: "array", items: { type: "integer" } };
  assert.deepEqual(pointers([1, "x", 3, 4.5], schema), ["/1", "/3"]);
});

test("minItems", () => {
  const schema: SchemaNode = { type: "array", minItems: 1 };
  assert.deepEqual(pointers([], schema), [""]);
  assert.deepEqual(pointers([0], schema), []);
});

test("enum: value must equal one member", () => {
  const schema: SchemaNode = { enum: ["open", "closed"] };
  assert.deepEqual(pointers("open", schema), []);
  assert.deepEqual(pointers("ajar", schema), [""]);
  assert.deepEqual(pointers(1, schema), [""]);
});

test("const", () => {
  const schema: SchemaNode = { const: "threat-model" };
  assert.deepEqual(pointers("threat-model", schema), []);
  assert.deepEqual(pointers("other", schema), [""]);
});

test("pattern: an ECMAScript regular expression over strings only", () => {
  const schema: SchemaNode = { type: "string", pattern: "^cat-[a-z]+-[0-9]{2}$" };
  assert.deepEqual(pointers("cat-service-01", schema), []);
  assert.deepEqual(pointers("cat-service-1", schema), [""]);
  assert.deepEqual(pointers("!!", schema), [""]);
});

test("format date and date-time use the calendar checks", () => {
  assert.deepEqual(pointers("2026-02-28", { type: "string", format: "date" }), []);
  assert.deepEqual(pointers("2026-02-30", { type: "string", format: "date" }), [""]);
  assert.deepEqual(pointers("2026-09-07T10:00:00Z", { type: "string", format: "date-time" }), []);
  assert.deepEqual(pointers("2026-09-07", { type: "string", format: "date-time" }), [""]);
  assert.deepEqual(pointers("2026-02-30", { type: "string", format: "date-time" }), [""]);
});

test("format on a non-string is not checked (the type keyword reports it)", () => {
  const issues = checkSchema(5, { type: "string", format: "date" });
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /expected type string/);
});

test("minimum and maximum over numbers", () => {
  const schema: SchemaNode = { type: "integer", minimum: 1, maximum: 10 };
  assert.deepEqual(pointers(1, schema), []);
  assert.deepEqual(pointers(10, schema), []);
  assert.deepEqual(pointers(0, schema), [""]);
  assert.deepEqual(pointers(11, schema), [""]);
});

test("minLength counts code points", () => {
  const schema: SchemaNode = { type: "string", minLength: 1 };
  assert.deepEqual(pointers("", schema), [""]);
  assert.deepEqual(pointers("\u{1F600}", schema), []);
  // One code point, two UTF-16 units: counting units would accept this string.
  assert.deepEqual(pointers("\u{1F600}", { type: "string", minLength: 2 }), [""]);
});

test("$ref resolves #/$defs/<name> and sibling keywords still apply", () => {
  const schema: SchemaNode = {
    $defs: { nonEmpty: { type: "string", minLength: 1 } },
    type: "object",
    properties: { a: { $ref: "#/$defs/nonEmpty" }, b: { $ref: "#/$defs/nonEmpty", pattern: "^x" } },
  };
  assert.deepEqual(pointers({ a: "ok", b: "xy" }, schema), []);
  assert.deepEqual(pointers({ a: "", b: "yz" }, schema), ["/a", "/b"]);
});

test("an unresolved $ref, an unsupported keyword, format, or additionalProperties throw INTERNAL", () => {
  const internal = (fn: () => unknown, re: RegExp) => assert.throws(fn, (err: unknown) => err instanceof ScriptError && err.code === "INTERNAL" && re.test(err.message));
  internal(() => checkSchema("x", { $ref: "#/$defs/missing" }), /unresolved \$ref/);
  internal(() => checkSchema("x", { $ref: "#/properties/a" }), /unresolved \$ref/);
  internal(() => checkSchema("x", { type: "string", maxLength: 3 }), /unsupported keyword "maxLength"/);
  internal(() => checkSchema("x", { type: "string", format: "email" }), /unsupported format "email"/);
  internal(() => checkSchema({}, { type: "object", additionalProperties: { type: "integer" } }), /unsupported additionalProperties/);
});

test("annotation keywords are accepted and ignored", () => {
  const schema: SchemaNode = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "urn:x", title: "t", description: "d", type: "string" };
  assert.deepEqual(pointers("x", schema), []);
});

test("SUPPORTED_KEYWORDS and SUPPORTED_FORMATS are the contract lists", () => {
  assert.deepEqual([...SUPPORTED_KEYWORDS], ["$schema", "$id", "$defs", "$ref", "title", "description", "type", "properties", "required", "additionalProperties", "items", "minItems", "enum", "const", "pattern", "format", "minimum", "maximum", "minLength"]);
  assert.deepEqual([...SUPPORTED_FORMATS], ["date", "date-time"]);
});

test("loadSchema reads the shipped schema file", () => {
  assert.match(SCHEMA_PATH, /schemas\/fmea\.schema\.json$/);
  const schema = loadSchema();
  assert.equal(schema.$id, "urn:fmea-software:schema:fmea:v3");
  assert.throws(() => loadSchema("/nonexistent.schema.json"), (err: unknown) => err instanceof ScriptError && err.code === "IO_READ");
});

test("forEachSchemaNode visits the root and every node under $defs, properties, and items", () => {
  const schema: SchemaNode = {
    $defs: { d: { type: "array", items: { type: "string" } } },
    type: "object",
    properties: { a: { type: "object", additionalProperties: false, properties: { b: { type: "string" } } } },
  };
  const seen: string[] = [];
  forEachSchemaNode(schema, (sp) => seen.push(sp));
  assert.deepEqual(seen.sort(), ["", "/$defs/d", "/$defs/d/items", "/properties/a", "/properties/a/properties/b"]);
});

test("minimalDoc() yields no schema issues", () => {
  assert.deepEqual(checkSchema(minimalDoc()), []);
});

// The schema issues for minimalDoc() with its one element changed by edit.
function elementIssues(edit: (element: Record<string, unknown>) => void): Issue[] {
  const doc = minimalDoc();
  edit(doc.elements[0] as unknown as Record<string, unknown>);
  return checkSchema(doc);
}

test("the kind enum is the five roles and rejects the two removed kinds", () => {
  for (const kind of ["external_dependency", "security_component"]) {
    const issues = elementIssues((e) => { e.kind = kind; });
    assert.deepEqual(issues.map((i) => i.pointer), ["/elements/0/kind"], kind);
    assert.match(issues[0].message, /is not one of/);
  }
  for (const kind of ["datastore", "event_stream", "interface", "component", "service"]) {
    assert.deepEqual(elementIssues((e) => { e.kind = kind; }), [], kind);
  }
});

test("boundary and security_relevant are required on every element and boundary is the three-value enum", () => {
  assert.deepEqual(elementIssues((e) => { delete e.boundary; }).map((i) => i.pointer), ["/elements/0"]);
  assert.deepEqual(elementIssues((e) => { delete e.security_relevant; }).map((i) => i.pointer), ["/elements/0"]);
  for (const boundary of ["in_scope", "owned_outside", "third_party"]) {
    assert.deepEqual(elementIssues((e) => { e.boundary = boundary; }), [], boundary);
  }
  assert.deepEqual(elementIssues((e) => { e.boundary = "external"; }).map((i) => i.pointer), ["/elements/0/boundary"]);
});

test("security_rationale is an optional non-empty string", () => {
  assert.deepEqual(elementIssues((e) => { delete e.security_rationale; }), []);
  assert.deepEqual(elementIssues((e) => { e.security_rationale = ""; }).map((i) => i.pointer), ["/elements/0/security_rationale"]);
  assert.deepEqual(elementIssues((e) => { e.security_rationale = "trusted to verify the token"; }), []);
});

test("a catalog ref id takes the dependency and security prefixes and rejects the removed ones", () => {
  const withRef = (id: string): string[] => {
    const doc = minimalDoc();
    doc.chains[0].catalog_refs = [{ id, provenance: "skill-authored" }];
    return checkSchema(doc).map((i) => i.pointer);
  };
  assert.deepEqual(withRef("cat-dependency-01"), []);
  assert.deepEqual(withRef("cat-security-01"), []);
  assert.deepEqual(withRef("cat-external_dependency-01"), ["/chains/0/catalog_refs/0/id"]);
  assert.deepEqual(withRef("cat-security_component-01"), ["/chains/0/catalog_refs/0/id"]);
});

test("a chain may carry post_priority beside post_ratings, in the shape of priority", () => {
  const doc = minimalDoc();
  doc.chains[0].post_ratings = { S: rating(4), O: rating(3), D: rating(2) };
  doc.chains[0].post_priority = { value: "M", table: "priority-fmea-software-v1", rpn: 24 };
  assert.deepEqual(checkSchema(doc), []);
  const missing = clone(doc);
  delete (missing.chains[0].post_priority as unknown as Record<string, unknown>).rpn;
  assert.deepEqual(checkSchema(missing).map((i) => i.pointer), ["/chains/0/post_priority"]);
  const extra = clone(doc);
  (extra.chains[0].post_priority as unknown as Record<string, unknown>).weight = 1;
  assert.deepEqual(checkSchema(extra).map((i) => i.pointer), ["/chains/0/post_priority/weight"]);
});

test("the top level is five authored parts in order, with dependencies required between functions and chains and computed after them", () => {
  const schema = loadSchema();
  assert.deepEqual(schema.required, ["meta", "elements", "functions", "dependencies", "chains"]);
  assert.deepEqual(Object.keys(schema.properties as object), ["meta", "elements", "functions", "dependencies", "chains", "computed"]);
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  const issues = checkSchema(doc);
  assert.deepEqual(issues.map((i) => i.pointer), [""]);
  assert.match(issues[0].message, /missing required property "dependencies"/);
});

test("an element that carries a dependency key is refused at the key", () => {
  const issues = elementIssues((e) => { e.dependency = { strength: "strong" }; });
  assert.deepEqual(issues.map((i) => i.pointer), ["/elements/0/dependency"]);
  assert.match(issues[0].message, /unexpected property "dependency"/);
});

// minimalDoc() with `dependencies` set to `edges`; the schema checks shape only, so the ends need not resolve.
function edgeIssues(...edges: unknown[]): string[] {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  doc.dependencies = edges;
  return checkSchema(doc).map((i) => i.pointer);
}

test("a dependency edge is closed, requires from, to and strength, and takes sla and limits as free text", () => {
  const edge = { from: "svc", to: "svc.db", strength: "weak", sla: "99.9% monthly", limits: "10 rps" };
  assert.deepEqual(edgeIssues(edge, { from: "svc.db", to: "svc", strength: "strong" }), []);
  for (const key of ["from", "to", "strength"]) {
    const missing: Record<string, unknown> = { ...edge };
    delete missing[key];
    assert.deepEqual(edgeIssues(missing), ["/dependencies/0"], key);
  }
  assert.deepEqual(edgeIssues({ ...edge, consumer: "svc" }), ["/dependencies/0/consumer"]);
  assert.deepEqual(edgeIssues({ ...edge, strength: "critical" }), ["/dependencies/0/strength"]);
  assert.deepEqual(edgeIssues({ ...edge, from: "Svc" }), ["/dependencies/0/from"]);
  assert.deepEqual(edgeIssues({ ...edge, to: "svc..db" }), ["/dependencies/0/to"]);
});

function codebaseIssues(codebases: unknown): string[] {
  const doc = minimalDoc();
  (doc.meta as unknown as Record<string, unknown>).codebases = codebases;
  return checkSchema(doc).map((i) => i.pointer);
}

test("meta.codebases is optional, never empty, and each entry is closed with an id, a name and an owner/repo repo", () => {
  const entry = { id: "checkout", name: "Checkout service", repo: "acme/checkout" };
  assert.deepEqual(codebaseIssues([entry, { ...entry, id: "web", path: "apps/web" }]), []);
  assert.deepEqual(codebaseIssues([]), ["/meta/codebases"]);
  for (const key of ["id", "name", "repo"]) {
    const missing: Record<string, unknown> = { ...entry };
    delete missing[key];
    assert.deepEqual(codebaseIssues([missing]), ["/meta/codebases/0"], key);
  }
  for (const repo of ["acme", "acme/checkout/web", "acme/checkout@abc", "acme:x/checkout", "acme/check out", "/checkout"]) {
    assert.deepEqual(codebaseIssues([{ ...entry, repo }]), ["/meta/codebases/0/repo"], repo);
  }
  assert.deepEqual(codebaseIssues([{ ...entry, id: "-x" }]), ["/meta/codebases/0/id"]);
  assert.deepEqual(codebaseIssues([{ ...entry, path: "" }]), ["/meta/codebases/0/path"]);
  assert.deepEqual(codebaseIssues([{ ...entry, commit: "a".repeat(40) }]), ["/meta/codebases/0/commit"]);
});

test("elements[].codebase and causes[].chain are optional plain ids", () => {
  assert.deepEqual(elementIssues((e) => { e.codebase = "checkout"; }), []);
  assert.deepEqual(elementIssues((e) => { e.codebase = ""; }).map((i) => i.pointer), ["/elements/0/codebase"]);
  const doc = minimalDoc();
  doc.chains[0].causes[0].chain = "ch-2";
  assert.deepEqual(checkSchema(doc), []);
  doc.chains[0].causes[0].chain = "-ch-2";
  assert.deepEqual(checkSchema(doc).map((i) => i.pointer), ["/chains/0/causes/0/chain"]);
});

function citedIssues(cited: unknown): Issue[] {
  const doc = minimalDoc();
  Object.assign(doc.chains[0].causes[0], { chain: "ch-2", cited_o: cited });
  return checkSchema(doc);
}

test("causes[].cited_o is a closed object: value 1 to 10, evidence_kind required, evidence_ref optional and non-empty", () => {
  const cited = { value: 6, evidence_kind: "observed_incident", evidence_ref: "INC-2026-0314" };
  const at = (c: unknown): string[] => citedIssues(c).map((i) => i.pointer);
  assert.deepEqual(citedIssues(cited), []);
  assert.deepEqual(citedIssues({ value: 6, evidence_kind: "estimate" }), []);
  const zero = citedIssues({ ...cited, value: 0 });
  assert.deepEqual(zero.map((i) => i.pointer), ["/chains/0/causes/0/cited_o/value"]);
  assert.match(zero[0].message, /value 0 is below the minimum 1/);
  const eleven = citedIssues({ ...cited, value: 11 });
  assert.deepEqual(eleven.map((i) => i.pointer), ["/chains/0/causes/0/cited_o/value"]);
  assert.match(eleven[0].message, /value 11 is above the maximum 10/);
  const noKind = citedIssues({ value: 6, evidence_ref: "INC-2026-0314" });
  assert.deepEqual(noKind.map((i) => i.pointer), ["/chains/0/causes/0/cited_o"]);
  assert.match(noKind[0].message, /missing required property "evidence_kind"/);
  assert.deepEqual(at({ ...cited, rationale: "x" }), ["/chains/0/causes/0/cited_o/rationale"]);
  assert.deepEqual(at({ ...cited, evidence_kind: "guess" }), ["/chains/0/causes/0/cited_o/evidence_kind"]);
  assert.deepEqual(at({ ...cited, evidence_ref: "" }), ["/chains/0/causes/0/cited_o/evidence_ref"]);
});

test("the v3 properties sit where the plan places them and each new description names the rule that governs it", () => {
  const schema = loadSchema();
  const defs = schema.$defs as Record<string, SchemaNode>;
  const props = (def: string): Record<string, SchemaNode> => defs[def].properties as Record<string, SchemaNode>;
  const text = (node: SchemaNode): string => String(node.description);
  assert.ok(!("dependency" in defs));
  assert.deepEqual(Object.keys(props("meta")).slice(5, 7), ["boundary", "codebases"]);
  assert.deepEqual(Object.keys(props("element")).slice(-3), ["security_rationale", "codebase", "sources"]);
  assert.deepEqual(Object.keys(props("cause")), ["text", "origin", "adversarial", "chain", "cited_o"]);
  const cases: [string, SchemaNode, string[]][] = [
    ["dependencies", (schema.properties as Record<string, SchemaNode>).dependencies, ["element-dependency-required"]],
    ["dependencyEdge", defs.dependencyEdge, ["F-WS3-01", "dependency-pair-unique"]],
    ["dependencyEdge.from", props("dependencyEdge").from, ["dependency-from-resolves"]],
    ["dependencyEdge.to", props("dependencyEdge").to, ["dependency-to-resolves", "dependency-self"]],
    ["codebase.id", props("codebase").id, ["codebase-id-unique"]],
    ["element.codebase", props("element").codebase, ["element-codebase-resolves"]],
    ["cause.chain", props("cause").chain, ["cause-chain-resolves", "cause-chain-self", "cause-chain-cycle"]],
    ["cause.cited_o", props("cause").cited_o, ["linked-cause-occurrence-drift"]],
    ["citedOccurrence", defs.citedOccurrence, ["linked-cause-occurrence-drift"]],
  ];
  for (const [where, node, ids] of cases) for (const id of ids) assert.ok(text(node).includes(id), `${where} does not name ${id}`);
  assert.ok(text(props("cause").cited_o).includes("written only when the consumer's O is rated, re-rated or re-scored and removed with the link"));
  assert.ok(!text(defs.dependencyEdge).includes("analysed system"));
  assert.ok(text(defs.elementBoundary).endsWith("An element whose boundary is not in_scope is the `to` of at least one edge in dependencies[] (invariant element-dependency-required)."));
  assert.ok(text(props("element").parent).endsWith("Derivable from id; the report's tree and the ancestor walk of the lints read it."));
  assert.ok(text(schema).includes("Five parts are authored (meta, elements, functions, dependencies, chains)"));
  assert.ok(!text(schema).includes("fifth part"));
});

// `minimalDoc()` plus a tracker target and one action carrying a link, in the shapes of the
// work tracking design's §5.2 and §5.3: every optional field present, so each new node is instantiated.
function trackedDoc(): FmeaDocument {
  const doc = minimalDoc();
  doc.meta.tracker = { provider: "github", project: "acme/risk", label: "failwise", host: "github.example.com", record_url: "https://reports.example.com/fmea/checkout" };
  doc.chains[0].actions = [{
    id: "act-1", description: "add a retry budget", owner: "T. Tester", status: "Open", target_date: "2026-10-01",
    tracker: {
      provider: "github", id: "I_kwDOAAAA1", key: "acme/risk#12", url: "https://github.example.com/acme/risk/issues/12", linked: "2026-10-02",
      observed: { state: "closed", detail: "closed as completed", date: "2026-10-03", closed_date: "2026-10-03" },
    },
  }];
  return doc;
}

test("meta.tracker and actions[].tracker validate in the shapes of §5.2 and §5.3", () => {
  assert.deepEqual(checkSchema(trackedDoc()), []);
});

/** trackedDoc() on a Jira target: every Jira field present, and the link a Jira link. */
function jiraDoc(): FmeaDocument {
  const doc = trackedDoc();
  doc.meta.tracker = { provider: "jira", project: "FAILW", label: "failwise", host: "jira.example.com", type: "Task", parent: "FAILW-4", states: { done: ["Done", "Closed"], dropped: ["Won't Do"] } };
  doc.chains[0].actions[0].tracker = { provider: "jira", id: "10019", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5", linked: "2026-10-07", observed: { state: "done", detail: "Done, resolution Done", date: "2026-10-07", closed_date: "2026-10-07" } };
  return doc;
}

test("a Jira meta.tracker with type, parent and states, and a Jira link with observed, validate", () => {
  assert.deepEqual(checkSchema(jiraDoc()), []);
});

test("a parent outside its grammar, a type with a control character or a leading -, and a states name that is empty or holds a control character, are schema issues", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ parent: "failw-4" }, "/meta/tracker/parent"],
    [{ parent: "FAILW-0" }, "/meta/tracker/parent"],
    [{ type: "-Task" }, "/meta/tracker/type"],
    [{ type: "Ta\tsk" }, "/meta/tracker/type"],
    [{ states: { done: [""] } }, "/meta/tracker/states/done/0"],
    [{ states: { dropped: ["Won't\u0000Do"] } }, "/meta/tracker/states/dropped/0"],
  ];
  for (const [patch, pointer] of cases) {
    const doc = jiraDoc();
    Object.assign(doc.meta.tracker as unknown as Record<string, unknown>, patch);
    assert.deepEqual(checkSchema(doc).map((i) => i.pointer), [pointer], JSON.stringify(patch));
  }
});

test("states with one key only, with an empty list, and with no key validate", () => {
  for (const states of [{ done: [] }, { dropped: ["Cancelled"] }, {}]) {
    const doc = jiraDoc();
    (doc.meta.tracker as unknown as Record<string, unknown>).states = states;
    assert.deepEqual(checkSchema(doc), [], JSON.stringify(states));
  }
});

test("a tracker provider other than github or jira, an http url and a record_url with a query are schema issues", () => {
  const doc = trackedDoc();
  const meta = doc.meta.tracker as unknown as Record<string, unknown>;
  const link = doc.chains[0].actions[0].tracker as unknown as Record<string, unknown>;
  meta.provider = "gitlab";
  meta.record_url = "https://a.example/r?x=1";
  meta.host = "bad host";
  link.url = "http://x/1";
  assert.deepEqual(pointers(doc, loadSchema()), [
    "/chains/0/actions/0/tracker/url",
    "/meta/tracker/host",
    "/meta/tracker/provider",
    "/meta/tracker/record_url",
  ]);
});

// ---- the drift test (§9: a test walks the schema's required lists, enums, formats, and
// patterns and fails on drift). Violations are derived from the golden fixture and from the
// second document below, so the tests also prove both documents still validate.

// Reads the value at a JSON pointer, "" being the document itself.
function valueAt(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  let node: unknown = root;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    node = Array.isArray(node) ? node[Number(key)] : (node as Record<string, unknown>)[key];
  }
  return node;
}

// Replaces the value at a JSON pointer. The pointer is never "" in this test: every mutated
// location is a property or an array element.
function setAt(root: unknown, pointer: string, value: unknown): void {
  const cut = pointer.lastIndexOf("/");
  const parent = valueAt(root, pointer.slice(0, cut));
  const key = pointer.slice(cut + 1).replace(/~1/g, "/").replace(/~0/g, "~");
  if (Array.isArray(parent)) parent[Number(key)] = value;
  else (parent as Record<string, unknown>)[key] = value;
}

function deleteAt(root: unknown, pointer: string, key: string): void {
  delete (valueAt(root, pointer) as Record<string, unknown>)[key];
}

// Walks the schema and the golden document together from the root, descending `properties`
// into object keys and `items` into every array index and following `$ref`, and returns the
// document pointers each schema node governs. A $ref'd definition collects its locations under
// its own schema pointer (/$defs/<name>), which is where its keywords live.
function instanceLocations(schema: SchemaNode, doc: unknown): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const record = (schemaPointer: string, instancePointer: string): void => {
    const list = found.get(schemaPointer);
    if (list) list.push(instancePointer);
    else found.set(schemaPointer, [instancePointer]);
  };
  const walk = (node: SchemaNode, schemaPointer: string, value: unknown, instancePointer: string): void => {
    if (typeof node.$ref === "string") {
      const name = node.$ref.slice("#/$defs/".length);
      const target = (schema.$defs as Record<string, SchemaNode>)[name];
      walk(target, `/$defs${ptr(name)}`, value, instancePointer);
      return;
    }
    record(schemaPointer, instancePointer);
    const properties = node.properties as Record<string, SchemaNode> | undefined;
    if (properties && value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, sub] of Object.entries(properties)) {
        if (key in (value as Record<string, unknown>)) {
          walk(sub, `${schemaPointer}/properties${ptr(key)}`, (value as Record<string, unknown>)[key], instancePointer + ptr(key));
        }
      }
    }
    const items = node.items as SchemaNode | undefined;
    if (items && Array.isArray(value)) {
      value.forEach((entry, i) => walk(items, `${schemaPointer}/items`, entry, instancePointer + ptr(i)));
    }
  };
  walk(schema, "", doc, "");
  return found;
}

test("the schema file uses only supported keywords and formats, and every $ref resolves", () => {
  const schema = loadSchema();
  const defs = schema.$defs as Record<string, unknown>;
  forEachSchemaNode(schema, (schemaPointer, node) => {
    for (const key of Object.keys(node)) {
      assert.ok(SUPPORTED_KEYWORDS.includes(key), `${schemaPointer}: unsupported keyword "${key}"`);
    }
    if (node.format !== undefined) {
      assert.ok(SUPPORTED_FORMATS.includes(node.format as string), `${schemaPointer}: unsupported format "${node.format as string}"`);
    }
    if (node.additionalProperties !== undefined) {
      assert.equal(node.additionalProperties, false, `${schemaPointer}: only additionalProperties false is enforced`);
    }
    if (node.$ref !== undefined) {
      const ref = node.$ref as string;
      assert.ok(ref.startsWith("#/$defs/"), `${schemaPointer}: $ref ${ref} is not a #/$defs/ reference`);
      assert.ok(ref.slice("#/$defs/".length) in defs, `${schemaPointer}: $ref ${ref} does not resolve`);
    }
  });
});

test("the golden fixture validates against the shipped schema", () => {
  assert.deepEqual(checkSchema(loadFixture("checkout-service.fmea.json")), []);
});

// Every schema pointer whose node carries a `required` list, an `enum`, a `pattern`, a
// `format` or a `minLength` — the nodes §10's "validator parity with the schema file" is about.
// `minLength` is `#/$defs/nonEmptyString`, the sole enforcement of §6's "every rating has a
// non-empty rationale" and of the non-empty `handoff.reason` and `adversary_cause`. A node in this
// list that no derivation document instantiates is never derived from, so a regression there
// would ship unnoticed.
function constrainedNodes(schema: SchemaNode): string[] {
  const out: string[] = [];
  forEachSchemaNode(schema, (schemaPointer, node) => {
    if (Array.isArray(node.required) || node.enum !== undefined || node.pattern !== undefined || node.format !== undefined || node.minLength !== undefined) out.push(schemaPointer);
  });
  return out.sort();
}

// A second derivation document. Contract §H fixes `history: []` on meta and on every chain and
// `stale: {flag: false}` on every chain, so no instance location in the golden fixture ever
// reaches /$defs/historyEntry or /$defs/stale/properties/reason. Until Task 26 fills `computed`
// on the golden it also cannot reach /$defs/computed, /$defs/computed/properties/validated_at —
// the schema file's only `format: "date-time"` node, which is the RFC 3339 pin of §6 —
// /$defs/lint, or /$defs/lint/properties/severity. This document instantiates all six, so the
// pair's reach into the schema does not depend on whether Task 26 has already run.
function derivationDoc(): Record<string, unknown> {
  const doc = trackedDoc();
  Object.assign(doc.meta.tracker as unknown as Record<string, unknown>, { type: "Task", parent: "ACME-1", states: { done: ["Done"], dropped: ["Won't Do"] } });
  doc.chains[0].actions.push({
    id: "act-2", description: "add a circuit breaker", owner: "T. Tester", status: "Open", target_date: "2026-10-01",
    tracker: { provider: "jira", id: "10019", key: "ACME-5", url: "https://jira.example.com/browse/ACME-5", linked: "2026-10-07" },
  });
  const metaHistory: HistoryEntry[] = [{ version: 1, date: "2026-09-01", change: "created" }];
  const chainHistory: HistoryEntry[] = [{ version: 1, date: "2026-09-01", change: "rated" }];
  const stale: Stale = { flag: true, reason: "element-changed", since_version: 2 };
  const computed: Computed = {
    quality_score: 88,
    lints: [{ rule: "rating-provisional", severity: "warning", pointer: "/chains/0/ratings/S", message: "provisional" }],
    validated_at: "2026-09-07T10:00:00Z",
    validator_version: "0.1.0",
  };
  doc.meta.history = metaHistory;
  doc.chains[0].history = chainHistory;
  doc.chains[0].stale = stale;
  doc.computed = computed;
  // meta.codebases, an element codebase, a linked cause and its cited_o. The golden fixture reaches
  // /$defs/codebase and /$defs/citedOccurrence too from step 3 on; these stay so that the
  // derivation document covers them whatever the golden carries.
  (doc.meta as unknown as Record<string, unknown>).codebases = [{ id: "svc-repo", name: "Service repository", repo: "acme/svc", path: "services/svc" }];
  doc.elements[0].codebase = "svc-repo";
  Object.assign(doc.chains[0].causes[0], { chain: "ch-2", cited_o: { value: 6, evidence_kind: "observed_incident", evidence_ref: "INC-1" } });
  return doc as unknown as Record<string, unknown>;
}

// "!!" violates every pattern but the control-character ones, which a control character violates.
function violatingString(pattern: string): string {
  return new RegExp(pattern).test("!!") ? String.fromCharCode(1) : "!!";
}

// Derives one violating copy of `doc` per required entry, enum, pattern, format and minLength the
// schema declares at a location `doc` instantiates — delete the required property, set the enum to
// a value outside it, set the patterned string to "!!" (a control character where "!!" matches), set the date to 2026-02-30, empty the
// non-empty string — and asserts
// checkSchema reports an issue at that instance pointer. Returns how many copies it ran, how many
// of those came from the `minLength` branch, and which schema nodes they came from. The separate
// `minLength` tally is what pins §6's non-empty-rationale rule to the schema file: the total alone
// is too coarse to notice the whole keyword going missing.
function deriveViolations(schema: SchemaNode, doc: unknown, label: string): { derived: number; minLengthDerived: number; covered: Set<string> } {
  const locations = instanceLocations(schema, doc);
  const covered = new Set<string>();
  let derived = 0;
  let minLengthDerived = 0;

  const expectIssueAt = (copy: unknown, at: string, schemaPointer: string, what: string): void => {
    const issues = checkSchema(copy, schema);
    assert.ok(issues.some((i) => i.pointer === at), `${label}: ${what} produced no schema issue at ${at}`);
    covered.add(schemaPointer);
    derived++;
  };

  forEachSchemaNode(schema, (schemaPointer, node) => {
    for (const at of locations.get(schemaPointer) ?? []) {
      if (Array.isArray(node.required)) {
        for (const key of node.required as string[]) {
          const copy = clone(doc);
          deleteAt(copy, at, key);
          expectIssueAt(copy, at, schemaPointer, `deleting required property "${key}" at ${at} (schema ${schemaPointer})`);
        }
      }
      if (node.enum !== undefined) {
        const copy = clone(doc);
        setAt(copy, at, "__not_in_enum__");
        expectIssueAt(copy, at, schemaPointer, `setting the enum at ${at} (schema ${schemaPointer}) to a value outside it`);
      }
      if (node.pattern !== undefined) {
        const copy = clone(doc);
        const violating = violatingString(node.pattern as string);
        setAt(copy, at, violating);
        expectIssueAt(copy, at, schemaPointer, `setting the patterned string at ${at} (schema ${schemaPointer}) to ${JSON.stringify(violating)}`);
      }
      if (node.format !== undefined) {
        const copy = clone(doc);
        setAt(copy, at, "2026-02-30");
        expectIssueAt(copy, at, schemaPointer, `setting the ${node.format as string} at ${at} (schema ${schemaPointer}) to 2026-02-30`);
      }
      if (node.minLength !== undefined) {
        const copy = clone(doc);
        setAt(copy, at, "");
        expectIssueAt(copy, at, schemaPointer, `setting the minLength string at ${at} (schema ${schemaPointer}) to ""`);
        minLengthDerived++;
      }
    }
  });

  return { derived, minLengthDerived, covered };
}

test("every constrained schema node the golden fixture cannot reach is reached by the derivation document", () => {
  const schema = loadSchema();
  const golden = loadFixture<Record<string, unknown>>("checkout-service.fmea.json");
  const derivation = derivationDoc();
  assert.deepEqual(checkSchema(derivation), [], "the derivation document must itself validate");
  const constrained = constrainedNodes(schema);
  const goldenReach = instanceLocations(schema, golden);
  const derivationReach = instanceLocations(schema, derivation);

  // Derived, never listed. Which constrained nodes the golden fixture misses depends on how far
  // the plan has run — Task 26 fills `computed` on it, which brings /$defs/computed,
  // /$defs/computed/properties/validated_at, /$defs/lint and /$defs/lint/properties/severity
  // into its reach — and the pair's obligation is the same either way: whatever the golden
  // cannot reach, the derivation document must.
  const unreached = constrained.filter((p) => !goldenReach.has(p));
  assert.deepEqual(
    unreached.filter((p) => !derivationReach.has(p)),
    [],
    "these constrained schema nodes are instantiated by neither document; extend derivationDoc() to reach them",
  );

  // Two of them are unreachable from the golden under every version of the plan, because
  // plan reference §H fixes `history: []` on meta and on every chain and `stale: {flag: false}` on
  // every chain. Pinning them stops the assertion above from passing vacuously if
  // instanceLocations() ever stops descending and `unreached` collapses to nothing.
  for (const pointer of ["/$defs/historyEntry", "/$defs/stale/properties/reason"]) {
    assert.ok(unreached.includes(pointer), `${pointer} is constrained and, by plan reference §H, unreachable from the golden fixture, but was reported as reached`);
  }
  // From step 3 the golden carries meta.codebases, two element codebases and ch-9's linked cause
  // with its cited_o, so these four are in its reach; derivationDoc() still reaches them too.
  for (const pointer of ["/$defs/codebase", "/$defs/codebase/properties/repo", "/$defs/citedOccurrence", "/$defs/citedOccurrence/properties/evidence_kind"]) {
    assert.ok(!unreached.includes(pointer), `${pointer} is reached by the golden fixture from step 3 on`);
  }
});

test("drift: every required list, enum, pattern, format, and minLength in the schema file is enforced", () => {
  const schema = loadSchema();
  const golden = loadFixture<Record<string, unknown>>("checkout-service.fmea.json");
  const fromGolden = deriveViolations(schema, golden, "golden fixture");
  const fromDerivation = deriveViolations(schema, derivationDoc(), "derivation document");
  const derived = fromGolden.derived + fromDerivation.derived;
  const minLengthDerived = fromGolden.minLengthDerived + fromDerivation.minLengthDerived;

  // Parity is only as wide as the two documents reach: a constrained schema node neither of
  // them instantiates is never derived from, and a regression there would pass silently.
  assert.deepEqual(
    constrainedNodes(schema).filter((p) => !fromGolden.covered.has(p) && !fromDerivation.covered.has(p)),
    [],
    "these constrained schema nodes were never derived from; extend derivationDoc() to instantiate them",
  );

  // 1,206 derivations with the schema of Tasks 4 and 12, the golden fixture with the `computed`
  // block Task 26 fills, and the derivation document above: 1,067 from the golden, 139 from the
  // derivation document. The golden's share includes the three the `post_priority` block on ch-3
  // adds, that row being the fixture's one post-action row: `post_priority` $refs the same
  // definition as `priority`, so it derives one violation per entry of that definition's required
  // list. 248 of the total are the `minLength` derivations Task 28's review added (221 from the
  // golden, 27 from the derivation document), which is the count that would vanish if
  // `#/$defs/nonEmptyString` lost its `minLength`. The floor is 1,150, just under that total,
  // which is where the file's own rule puts it: close enough that losing $ref following, or
  // losing the descent into array elements, fails this test instead of quietly shrinking its
  // reach. It stood at 883 while the reach was narrower, and Task 26's `computed` fill and Task
  // 28's review grew the total past it by more than a quarter, which is slack the rule does not
  // allow. If the schema or either document changes the count legitimately, move the floor —
  // never lower it by more than the change accounts for. The tracker target, link and observed
  // state added 35 derivations, all from the derivation document (1,241 in all), so the floor is
  // 1,185. Measured before schema v3, the total was 1,338 (1,137 from the golden, 201 from the
  // derivation document), not the 1,241 counted above: the documents grew after that count without
  // its being redone. The floor keeps its convention of the total less 56. Schema v3 moved the
  // count by 23. The golden lost its two dependency blocks (-4, one required entry and one enum
  // each), gained the root's fifth required entry (+1) and two edges (+12, three required entries,
  // two elementId patterns and one enum each). The derivation document gained its fifth root entry
  // (+1), a codebase entry with a path (+7: three required entries, two patterns, two minLength),
  // an element codebase (+1) and a linked cause with a cited O (+5: a plainId pattern, two required
  // entries, one enum, one minLength). The total is 1,361, so the floor is 1,305. The enriched golden
  // of step 3 adds 111 derivations: 12 from the two `meta.codebases` entries, 2 from the two
  // element `codebase` ids, 6 from the order-store edge, 70 from `ch-9` and 21 from its three
  // `rating-provisional` findings in `computed`. 20 of them are `minLength` (2 from the codebase
  // names, 12 from `ch-9`, 6 from the findings). The total is 1,472, so the floor is 1,416.
  assert.ok(derived >= 1416, `expected at least 1416 derived violations, ran ${derived}`);

  // The `minLength` share keeps its own floor, because it names what went. Deleting `minLength`
  // from `#/$defs/nonEmptyString` in the schema file drops the total to 958 and stops
  // `constrainedNodes()` listing the node, so the coverage assertion above stays green; the
  // assertion above this one now fails too, but as a bare shortfall, while this one says which
  // share vanished, which is the drift this test's name claims to catch. Against the old floor of
  // 883 it was the only assertion that failed at all.
  // The tracker nodes add six of them (254 counted; measured before schema v3, 268: 231 from the
  // golden and 37 from the derivation document). Schema v3 adds three, all from the derivation
  // document: the codebase's name and path and the cited O's evidence_ref, so the total and the
  // floor are 271. The enriched golden of step 3 adds 111 derivations: 12 from the two
  // `meta.codebases` entries, 2 from the two element `codebase` ids, 6 from the order-store edge,
  // 70 from `ch-9` and 21 from its three `rating-provisional` findings in `computed`. 20 of them
  // are `minLength` (2 from the codebase names, 12 from `ch-9`, 6 from the findings), so the total
  // and the floor are 291.
  assert.ok(minLengthDerived >= 291, `expected at least 291 derived minLength violations, ran ${minLengthDerived}`);
});
