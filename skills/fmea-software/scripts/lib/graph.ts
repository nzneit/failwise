// The document's structure, read once for every module that needs it: which elements are
// providers, the first-occurrence index of elements, functions and chains, the parent walk and the
// lineage it gives, the element of a chain, the resolved cause links, the edge-join predicate, the
// effective codebase of each element and its root. Not an entry point.
import type { Chain, Codebase, DependencyEdge, Element, FmeaDocument } from "./types.ts";

/** The ids that are the `to` of at least one edge, whatever the edge's `from`: the providers. */
export function providerIds(doc: FmeaDocument): Set<string> {
  return new Set(doc.dependencies.map((e) => e.to));
}

/** Each id's first position in its list, and each element's ancestors, nearest first. */
export interface DocIndex {
  element: ReadonlyMap<string, number>;
  fn: ReadonlyMap<string, number>;
  chain: ReadonlyMap<string, number>;
  ancestors: readonly (readonly number[])[];
}

/** Each id mapped to the position of its first occurrence; a later duplicate never overwrites it. */
function firstIndex(ids: string[]): Map<string, number> {
  const map = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!map.has(id)) map.set(id, i);
  });
  return map;
}

/** The elements `parent` leads to from element `i`, nearest first, ending at a null parent, a parent
 *  that names no element, or an element the walk has already met. */
function walkParents(elements: Element[], element: ReadonlyMap<string, number>, i: number): number[] {
  const seen = new Set<string>([elements[i].id]);
  const out: number[] = [];
  let parent = elements[i].parent;
  while (parent !== null && !seen.has(parent)) {
    const at = element.get(parent);
    if (at === undefined) break;
    seen.add(parent);
    out.push(at);
    parent = elements[at].parent;
  }
  return out;
}

export function indexDocument(doc: FmeaDocument): DocIndex {
  const element = firstIndex(doc.elements.map((e) => e.id));
  return {
    element,
    fn: firstIndex(doc.functions.map((f) => f.id)),
    chain: firstIndex(doc.chains.map((c) => c.id)),
    ancestors: doc.elements.map((_, i) => walkParents(doc.elements, element, i)),
  };
}

/** Element `of` is on element `el`'s parent walk. */
export function isDescendantOf(index: DocIndex, el: number, of: number): boolean {
  return index.ancestors[el].includes(of);
}

/** The two elements are the same, or one is an ancestor of the other. */
export function sameLineage(index: DocIndex, a: number, b: number): boolean {
  return a === b || isDescendantOf(index, a, b) || isDescendantOf(index, b, a);
}

/** The element of chain `chain`, through the first function of its id; undefined when the function
 *  or its element does not resolve. */
export function chainElement(doc: FmeaDocument, index: DocIndex, chain: number): number | undefined {
  const fn = index.fn.get(doc.chains[chain].function);
  return fn === undefined ? undefined : index.element.get(doc.functions[fn].element);
}

/** A cause of chain `chain` whose `chain` resolves to the first chain `provider` of that id. */
export interface ResolvedLink { chain: number; cause: number; provider: number }

/** Every cause link that resolves to another chain, in chain and cause order. */
export function resolvedLinks(doc: FmeaDocument, index: DocIndex): ResolvedLink[] {
  const out: ResolvedLink[] = [];
  doc.chains.forEach((c, chain) => {
    c.causes.forEach((cause, i) => {
      const provider = cause.chain === undefined ? undefined : index.chain.get(cause.chain);
      if (provider !== undefined && provider !== chain) out.push({ chain, cause: i, provider });
    });
  });
  return out;
}

/** The edge runs from the consumer, an ancestor or a descendant of it, to the provider or an
 *  ancestor of it. */
export function edgeJoins(index: DocIndex, edge: DependencyEdge, consumer: number, provider: number): boolean {
  const from = index.element.get(edge.from);
  const to = index.element.get(edge.to);
  if (from === undefined || to === undefined) return false;
  return sameLineage(index, from, consumer) && (to === provider || isDescendantOf(index, provider, to));
}

/** The codebase element `i` inherits: from the nearest ancestor that sets one, unless an outside
 *  ancestor comes first. */
function inheritedCodebase(doc: FmeaDocument, index: DocIndex, byId: ReadonlyMap<string, Codebase>, i: number): Codebase | undefined {
  for (const a of index.ancestors[i]) {
    const ancestor = doc.elements[a];
    if (ancestor.boundary !== "in_scope") return undefined;
    if (ancestor.codebase !== undefined) return byId.get(ancestor.codebase);
  }
  return undefined;
}

/** Each element's codebase: its own when it sets one, none when it is outside the scope, else the
 *  one it inherits through in-scope ancestors. An id that names no entry gives none. */
export function effectiveCodebases(doc: FmeaDocument, index: DocIndex): (Codebase | undefined)[] {
  const byId = new Map<string, Codebase>();
  for (const cb of doc.meta.codebases ?? []) if (!byId.has(cb.id)) byId.set(cb.id, cb);
  return doc.elements.map((el, i) => {
    if (el.codebase !== undefined) return byId.get(el.codebase);
    if (el.boundary !== "in_scope") return undefined;
    return inheritedCodebase(doc, index, byId, i);
  });
}

/** The depth-1 element element `el`'s walk ends at; undefined when the walk ends at an unresolved
 *  parent or a cycle. */
export function rootOf(doc: FmeaDocument, index: DocIndex, el: number): number | undefined {
  const ancestors = index.ancestors[el];
  const last = ancestors.length === 0 ? el : ancestors[ancestors.length - 1];
  return doc.elements[last].parent === null ? last : undefined;
}

export function sameTrimmed(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/** The chain's trigger, trimmed, is non-empty and equal to `text` trimmed. */
export function triggerRestates(chain: Chain, text: string): boolean {
  return (chain.trigger?.trim() ?? "") !== "" && sameTrimmed(chain.trigger ?? "", text);
}
