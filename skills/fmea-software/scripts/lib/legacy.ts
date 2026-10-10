// The pre-schema gates for a v1 document (element-kinds spec s3) and a v2 document (multi-codebase
// spec s7): one KIND_LEGACY or DEPENDENCY_LEGACY issue naming the migration, in place of the schema
// lines such a document would otherwise produce. Run before checkSchema by validateDocument, so
// validate.ts, render.ts and track.ts refuse both the same way.

import type { Issue } from "./codes.ts";
import { ptr } from "./pointer.ts";

const REMOVED_KINDS: readonly string[] = ["external_dependency", "security_component"];
const LEGACY_PREFIXES: readonly string[] = ["cat-external_dependency-", "cat-security_component-"];

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isLegacyId = (v: unknown): v is string => typeof v === "string" && LEGACY_PREFIXES.some((p) => v.startsWith(p));

function issue(code: "KIND_LEGACY" | "DEPENDENCY_LEGACY", message: string, pointer: string): Issue[] {
  return [{ code, rule: "format-legacy", message, pointer }];
}

function v1(reason: string, pointer: string): Issue[] {
  return issue("KIND_LEGACY", `document predates schema v2 (${reason}); migrate it through the update mode as SKILL.md describes under "Migrate a v1 document"`, pointer);
}

function v2(reason: string, pointer: string): Issue[] {
  return issue("DEPENDENCY_LEGACY", `document predates schema v3 (${reason}); a new analysis adds the top-level dependencies array, empty when nothing depends on anything, and an analysis written against 0.3.x to 0.5.x is migrated through the update mode as SKILL.md describes under "Migrate a v2 document"`, pointer);
}

/** The first v1 trait of one element, in the order s3 fixes: no boundary, no security_relevant, a
 *  removed kind, then a catalog source whose ref uses a removed kind's row-id prefix. */
function elementIssue(e: Obj, i: number): Issue[] {
  const id = String(e.id);
  if (!("boundary" in e)) return v1(`element ${id} has no boundary`, ptr("elements", i));
  if (!("security_relevant" in e)) return v1(`element ${id} has no security_relevant`, ptr("elements", i));
  if (typeof e.kind === "string" && REMOVED_KINDS.includes(e.kind)) return v1(`element ${id} has kind ${e.kind}`, ptr("elements", i, "kind"));
  const sources = Array.isArray(e.sources) ? e.sources : [];
  for (let j = 0; j < sources.length; j++) {
    const s: unknown = sources[j];
    if (isObject(s) && s.kind === "catalog" && isLegacyId(s.ref)) return v1(`catalog ref ${s.ref} uses a removed kind`, ptr("elements", i, "sources", j, "ref"));
  }
  return [];
}

function chainIssue(c: unknown, i: number): Issue[] {
  const refs = isObject(c) && Array.isArray(c.catalog_refs) ? c.catalog_refs : [];
  for (let j = 0; j < refs.length; j++) {
    const r: unknown = refs[j];
    if (isObject(r) && isLegacyId(r.id)) return v1(`catalog ref ${r.id} uses a removed kind`, ptr("chains", i, "catalog_refs", j, "id"));
  }
  return [];
}

function v1Issues(raw: Obj, elements: Obj[]): Issue[] {
  for (let i = 0; i < elements.length; i++) {
    const found = elementIssue(elements[i], i);
    if (found.length > 0) return found;
  }
  const chains: unknown[] = Array.isArray(raw.chains) ? raw.chains : [];
  for (let i = 0; i < chains.length; i++) {
    const found = chainIssue(chains[i], i);
    if (found.length > 0) return found;
  }
  return [];
}

function v2Issues(raw: Obj, elements: Obj[]): Issue[] {
  if (!("dependencies" in raw)) return v2("no top-level dependencies array", ptr("dependencies"));
  const i = elements.findIndex((e) => "dependency" in e);
  return i === -1 ? [] : v2(`element ${String(elements[i].id)} has a dependency block`, ptr("elements", i, "dependency"));
}

/** At most one issue: the first v1 trait in document order, elements (with their sources) before
 *  chains, as KIND_LEGACY; failing that, the first v2 trait, a missing top-level dependencies key and
 *  then an element dependency key in document order, as DEPENDENCY_LEGACY. A top level not shaped
 *  like an analysis, an object whose `elements` is an array of objects, gives none and is left to the
 *  schema stage. */
export function legacyIssues(raw: unknown): Issue[] {
  if (!isObject(raw) || !Array.isArray(raw.elements) || !raw.elements.every(isObject)) return [];
  const elements: Obj[] = raw.elements;
  const v1Found = v1Issues(raw, elements);
  return v1Found.length > 0 ? v1Found : v2Issues(raw, elements);
}
