// The document's structure, read once for every module that needs it: here, which elements are
// providers; the shared index and the parent walk join it later. Not an entry point.
import type { FmeaDocument } from "./types.ts";

/** The ids that are the `to` of at least one edge, whatever the edge's `from`: the providers. */
export function providerIds(doc: FmeaDocument): Set<string> {
  return new Set(doc.dependencies.map((e) => e.to));
}
