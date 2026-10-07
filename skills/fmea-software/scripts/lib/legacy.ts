// The pre-schema gate for a v1 document (spec s3): one KIND_LEGACY issue naming the migration, in
// place of the schema lines a v1 document would otherwise produce. Run before checkSchema by
// validateDocument, so validate.ts, render.ts and track.ts refuse a v1 document the same way.

import type { Issue } from "./codes.ts";
import { ptr } from "./pointer.ts";

const REMOVED_KINDS: readonly string[] = ["external_dependency", "security_component"];
const LEGACY_PREFIXES: readonly string[] = ["cat-external_dependency-", "cat-security_component-"];

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isLegacyId = (v: unknown): v is string => typeof v === "string" && LEGACY_PREFIXES.some((p) => v.startsWith(p));

function issue(reason: string, pointer: string): Issue[] {
  return [{
    code: "KIND_LEGACY",
    rule: "format-legacy",
    message: `document predates schema v2 (${reason}); migrate it through the update mode as SKILL.md describes under "Migrate a v1 document"`,
    pointer,
  }];
}

/** The first v1 trait of one element, in the order s3 fixes: no boundary, no security_relevant, a
 *  removed kind, then a catalog source whose ref uses a removed kind's row-id prefix. */
function elementIssue(e: Obj, i: number): Issue[] {
  const id = String(e.id);
  if (!("boundary" in e)) return issue(`element ${id} has no boundary`, ptr("elements", i));
  if (!("security_relevant" in e)) return issue(`element ${id} has no security_relevant`, ptr("elements", i));
  if (typeof e.kind === "string" && REMOVED_KINDS.includes(e.kind)) return issue(`element ${id} has kind ${e.kind}`, ptr("elements", i, "kind"));
  const sources = Array.isArray(e.sources) ? e.sources : [];
  for (let j = 0; j < sources.length; j++) {
    const s: unknown = sources[j];
    if (isObject(s) && s.kind === "catalog" && isLegacyId(s.ref)) return issue(`catalog ref ${s.ref} uses a removed kind`, ptr("elements", i, "sources", j, "ref"));
  }
  return [];
}

function chainIssue(c: unknown, i: number): Issue[] {
  const refs = isObject(c) && Array.isArray(c.catalog_refs) ? c.catalog_refs : [];
  for (let j = 0; j < refs.length; j++) {
    const r: unknown = refs[j];
    if (isObject(r) && isLegacyId(r.id)) return issue(`catalog ref ${r.id} uses a removed kind`, ptr("chains", i, "catalog_refs", j, "id"));
  }
  return [];
}

/** At most one KIND_LEGACY issue: the first v1 trait in document order, elements (with their
 *  sources) before chains. A top level not shaped like an analysis, an object whose `elements` is an
 *  array of objects, gives none and is left to the schema stage. */
export function legacyIssues(raw: unknown): Issue[] {
  if (!isObject(raw) || !Array.isArray(raw.elements) || !raw.elements.every(isObject)) return [];
  const elements: Obj[] = raw.elements;
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
