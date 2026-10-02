// A hand-coded interpreter for the subset of JSON Schema draft 2020-12 that
// schemas/fmea.schema.json uses. The plugin ships no dependencies (§9), so the schema is
// enforced by this module rather than by a validator library; schema.test.ts walks the schema
// file and fails when it grows a keyword, a format, or a $ref this interpreter cannot enforce,
// which is the drift guard §9 asks for.

import { join } from "node:path";
import { ScriptError } from "./codes.ts";
import type { Issue } from "./codes.ts";
import { isCalendarDate, isRfc3339DateTime } from "./dates.ts";
import { readJsonFile } from "./io.ts";
import { ptr } from "./pointer.ts";

export const SCHEMA_PATH: string = join(import.meta.dirname, "..", "..", "schemas", "fmea.schema.json");

// Exactly the keywords this interpreter enforces or knowingly ignores. A keyword outside this
// list in the schema file is a bug, not a document error, so it raises INTERNAL.
export const SUPPORTED_KEYWORDS: readonly string[] = [
  "$schema", "$id", "$defs", "$ref", "title", "description", "type", "properties", "required",
  "additionalProperties", "items", "minItems", "enum", "const", "pattern", "format", "minimum",
  "maximum", "minLength",
];

export const SUPPORTED_FORMATS: readonly string[] = ["date", "date-time"];

export interface SchemaNode { [k: string]: unknown }

const DEFS_PREFIX = "#/$defs/";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The JSON Schema type name of a value. `integer` is reported separately from `number` so a
// schema can demand a whole number; typeMatches lets an integer satisfy `number`.
function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function loadSchema(path?: string): SchemaNode {
  return readJsonFile(path ?? SCHEMA_PATH) as SchemaNode;
}

// Every schema node reachable from `schema` through $defs, properties, and items, with the
// JSON pointer of the node inside the schema document. The root is visited with the pointer "".
export function forEachSchemaNode(schema: SchemaNode, visit: (schemaPointer: string, node: SchemaNode) => void): void {
  const walk = (node: SchemaNode, pointer: string): void => {
    visit(pointer, node);
    const defs = node.$defs;
    if (isObject(defs)) {
      for (const [name, sub] of Object.entries(defs)) if (isObject(sub)) walk(sub, `${pointer}/$defs${ptr(name)}`);
    }
    const properties = node.properties;
    if (isObject(properties)) {
      for (const [name, sub] of Object.entries(properties)) if (isObject(sub)) walk(sub, `${pointer}/properties${ptr(name)}`);
    }
    const items = node.items;
    if (isObject(items)) walk(items, `${pointer}/items`);
  };
  walk(schema, "");
}

function resolveRef(root: SchemaNode, ref: unknown): SchemaNode {
  if (typeof ref === "string" && ref.startsWith(DEFS_PREFIX)) {
    const defs = root.$defs;
    const name = ref.slice(DEFS_PREFIX.length);
    if (isObject(defs) && isObject(defs[name])) return defs[name] as SchemaNode;
  }
  throw new ScriptError("INTERNAL", `unresolved $ref ${JSON.stringify(ref)} in the schema`);
}

// Rejects a schema node this interpreter cannot enforce. Raised as INTERNAL because it means
// the schema file and this module have drifted apart, not that the document is wrong.
function assertNodeSupported(node: SchemaNode): void {
  for (const key of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.includes(key)) throw new ScriptError("INTERNAL", `unsupported keyword ${JSON.stringify(key)} in the schema`);
  }
  if (node.format !== undefined && !SUPPORTED_FORMATS.includes(node.format as string)) {
    throw new ScriptError("INTERNAL", `unsupported format ${JSON.stringify(node.format)} in the schema`);
  }
  if (node.additionalProperties !== undefined && node.additionalProperties !== false) {
    throw new ScriptError("INTERNAL", "unsupported additionalProperties in the schema: only false is enforced");
  }
}

// Appends one SCHEMA issue at an instance location. checkNode builds it over its `out` list
// and hands it to the keyword helpers below.
type Push = (at: string, message: string) => void;

// enum and const: the value must equal a listed member, or the one constant.
function checkEnumConst(value: unknown, node: SchemaNode, pointer: string, push: Push): void {
  if (node.enum !== undefined) {
    const members = node.enum as unknown[];
    if (!members.some((m) => sameValue(m, value))) {
      push(pointer, `value ${JSON.stringify(value)} is not one of ${members.map((m) => JSON.stringify(m)).join(", ")}`);
    }
  }

  if (node.const !== undefined && !sameValue(node.const, value)) {
    push(pointer, `value ${JSON.stringify(value)} must be ${JSON.stringify(node.const)}`);
  }
}

// The string keywords pattern, format and minLength, each skipped when the value is no string.
function checkStringKeywords(value: unknown, node: SchemaNode, pointer: string, push: Push): void {
  if (typeof node.pattern === "string" && typeof value === "string" && !new RegExp(node.pattern, "u").test(value)) {
    push(pointer, `value ${JSON.stringify(value)} does not match pattern ${node.pattern}`);
  }

  if (typeof node.format === "string" && typeof value === "string") {
    if (node.format === "date" && !isCalendarDate(value)) push(pointer, `value ${JSON.stringify(value)} is not a calendar date (YYYY-MM-DD)`);
    if (node.format === "date-time" && !isRfc3339DateTime(value)) push(pointer, `value ${JSON.stringify(value)} is not an RFC 3339 date-time`);
  }

  if (typeof node.minLength === "number" && typeof value === "string" && Array.from(value).length < node.minLength) {
    push(pointer, `value ${JSON.stringify(value)} is shorter than the minimum length ${node.minLength}`);
  }
}

// The number keywords minimum and maximum, each skipped when the value is no number.
function checkNumberKeywords(value: unknown, node: SchemaNode, pointer: string, push: Push): void {
  if (typeof node.minimum === "number" && typeof value === "number" && value < node.minimum) {
    push(pointer, `value ${value} is below the minimum ${node.minimum}`);
  }

  if (typeof node.maximum === "number" && typeof value === "number" && value > node.maximum) {
    push(pointer, `value ${value} is above the maximum ${node.maximum}`);
  }
}

function checkMinItems(value: unknown, node: SchemaNode, pointer: string, push: Push): void {
  if (typeof node.minItems === "number" && Array.isArray(value) && value.length < node.minItems) {
    push(pointer, `array has ${value.length} item(s), fewer than the minimum ${node.minItems}`);
  }
}

// A missing required property is reported at the containing object.
function checkRequired(value: Record<string, unknown>, node: SchemaNode, pointer: string, push: Push): void {
  if (Array.isArray(node.required)) {
    for (const key of node.required as string[]) {
      if (!(key in value)) push(pointer, `missing required property ${JSON.stringify(key)}`);
    }
  }
}

// additionalProperties is only ever false (assertNodeSupported); an unexpected property is
// reported at its own key.
function checkAdditionalProperties(value: Record<string, unknown>, node: SchemaNode, pointer: string, push: Push): void {
  const properties = isObject(node.properties) ? node.properties : undefined;
  if (node.additionalProperties === false) {
    const known = properties ? Object.keys(properties) : [];
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) push(pointer + ptr(key), `unexpected property ${JSON.stringify(key)}`);
    }
  }
}

// Recurses into every declared property the value has.
function checkProperties(value: Record<string, unknown>, node: SchemaNode, pointer: string, root: SchemaNode, out: Issue[]): void {
  const properties = isObject(node.properties) ? node.properties : undefined;
  if (properties) {
    for (const [key, sub] of Object.entries(properties)) {
      if (isObject(sub) && key in value) checkNode(value[key], sub, pointer + ptr(key), root, out);
    }
  }
}

// Validates one value against one schema node, appending an Issue per violation. The pointer
// of an issue is the instance location the violation sits at: the value itself for type,
// enum, const, pattern, format, minimum, maximum, minLength and minItems; the containing
// object for a missing required property; the offending key for an unexpected property.
function checkNode(value: unknown, node: SchemaNode, pointer: string, root: SchemaNode, out: Issue[]): void {
  assertNodeSupported(node);

  const push = (at: string, message: string): void => {
    out.push({ code: "SCHEMA", rule: "schema", message, pointer: at });
  };

  if (node.$ref !== undefined) checkNode(value, resolveRef(root, node.$ref), pointer, root, out);

  if (node.type !== undefined) {
    const expected = Array.isArray(node.type) ? (node.type as string[]) : [node.type as string];
    const actual = jsonType(value);
    if (!expected.some((e) => typeMatches(e, actual))) {
      push(pointer, `expected type ${expected.join(" or ")}, got ${actual}`);
      return; // the value is the wrong shape; every other keyword would report the same fault again
    }
  }

  checkEnumConst(value, node, pointer, push);
  checkStringKeywords(value, node, pointer, push);
  checkNumberKeywords(value, node, pointer, push);
  checkMinItems(value, node, pointer, push);

  if (isObject(value)) {
    checkRequired(value, node, pointer, push);
    checkAdditionalProperties(value, node, pointer, push);
    checkProperties(value, node, pointer, root, out);
  }

  if (Array.isArray(value) && isObject(node.items)) {
    value.forEach((entry, i) => checkNode(entry, node.items as SchemaNode, pointer + ptr(i), root, out));
  }
}

// Every schema violation in `doc`, one Issue per violation, in document order. `schema`
// defaults to the shipped schema file.
export function checkSchema(doc: unknown, schema?: SchemaNode): Issue[] {
  const root = schema ?? loadSchema();
  const issues: Issue[] = [];
  checkNode(doc, root, "", root, issues);
  return issues;
}
