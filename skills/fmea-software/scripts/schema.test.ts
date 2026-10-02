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
import type { Computed, HistoryEntry, Stale } from "./lib/types.ts";

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
  assert.equal(schema.$id, "urn:fmea-software:schema:fmea:v1");
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
  const doc = minimalDoc();
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
  return doc as unknown as Record<string, unknown>;
}

// Derives one violating copy of `doc` per required entry, enum, pattern, format and minLength the
// schema declares at a location `doc` instantiates — delete the required property, set the enum to
// a value outside it, set the patterned string to "!!", set the date to 2026-02-30, empty the
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
        setAt(copy, at, "!!");
        expectIssueAt(copy, at, schemaPointer, `setting the patterned string at ${at} (schema ${schemaPointer}) to "!!"`);
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
  // never lower it by more than the change accounts for.
  assert.ok(derived >= 1150, `expected at least 1150 derived violations, ran ${derived}`);

  // The `minLength` share keeps its own floor, because it names what went. Deleting `minLength`
  // from `#/$defs/nonEmptyString` in the schema file drops the total to 958 and stops
  // `constrainedNodes()` listing the node, so the coverage assertion above stays green; the
  // assertion above this one now fails too, but as a bare shortfall, while this one says which
  // share vanished, which is the drift this test's name claims to catch. Against the old floor of
  // 883 it was the only assertion that failed at all.
  assert.ok(minLengthDerived >= 248, `expected at least 248 derived minLength violations, ran ${minLengthDerived}`);
});
