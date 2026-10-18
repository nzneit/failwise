import type { Cause, Chain, CitedOccurrence, Codebase, Control, DependencyEdge, Element, FmeaDocument, Flow, Lint, Rating, RatingEvidenceKind, Ratings, Factor, Severity } from "./types.ts";
import { ptr } from "./pointer.ts";
import type { PriorityTable } from "./table.ts";
import { checkTableProperties } from "./table.ts";
import { chainElement, edgeJoins, effectiveCodebases, indexDocument, isDescendantOf, providerIds, resolvedLinks, triggerRestates } from "./graph.ts";
import type { DocIndex, ResolvedLink } from "./graph.ts";

export interface MachineRule { id: string; severity: Severity; check: (doc: FmeaDocument) => Lint[] }

const FACTORS: Factor[] = ["S", "O", "D"];

function lint(rule: string, severity: Severity, pointer: string, message: string): Lint {
  return { rule, severity, pointer, message };
}

// The row lint that reads the catalog rows of each prefix.
const ROW_RULES: Record<string, string> = { dependency: "dependency-row-without-dependency", security: "security-row-without-flag" };

// One warning per catalog ref `cat-<prefix>-…` whose chain's element fails `applies`, at the ref's
// id; `describe` ends the message. The two row lints share this loop.
function rowLints(doc: FmeaDocument, prefix: string, applies: (el: Element) => boolean, describe: (el: Element) => string): Lint[] {
  const rule = ROW_RULES[prefix];
  const out: Lint[] = [];
  const index = indexDocument(doc);
  for (let i = 0; i < doc.chains.length; i++) {
    const chain = doc.chains[i];
    const at = chainElement(doc, index, i);
    if (at === undefined) continue;
    const el = doc.elements[at];
    if (applies(el)) continue;
    for (let j = 0; j < chain.catalog_refs.length; j++) {
      const ref = chain.catalog_refs[j].id;
      if (ref.startsWith(`cat-${prefix}-`)) {
        out.push(lint(rule, "warning", ptr("chains", i, "catalog_refs", j, "id"),
          `chain ${chain.id} applies ${prefix} row ${ref} to element ${el.id}, ${describe(el)}`));
      }
    }
  }
  return out;
}

// A repo ref in the qualified owner/repo@commit:path form; group 1 is the owner/repo head, group 2 the commit.
const QUALIFIED_REPO_REF = /^([^\s/@:]+\/[^\s/@:]+)@([^\s:]+):.+$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;

interface RepoRef { ref: string; element: string; index: number; pointer: string; head: string | undefined; commit: string | undefined }

function repoRefs(doc: FmeaDocument): RepoRef[] {
  const out: RepoRef[] = [];
  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    for (let j = 0; j < el.sources.length; j++) {
      const s = el.sources[j];
      if (s.kind !== "repo") continue;
      const m = QUALIFIED_REPO_REF.exec(s.ref);
      out.push({ ref: s.ref, element: el.id, index: i, pointer: ptr("elements", i, "sources", j, "ref"), head: m?.[1], commit: m?.[2] });
    }
  }
  return out;
}

function repoRefLint(r: RepoRef): Lint[] {
  const head = `repo ref ${r.ref} on element ${r.element}`;
  if (r.commit === undefined) {
    return [lint("repo-ref-form", "warning", r.pointer, `${head} is not in the owner/repo@commit:path form the other repo refs use`)];
  }
  if (!FULL_SHA.test(r.commit)) {
    return [lint("repo-ref-form", "warning", r.pointer, `${head}: its commit is not a full 40-hex-digit SHA`)];
  }
  return [];
}

function repoCodebaseLint(r: RepoRef, codebases: Codebase[], own: Codebase | undefined): Lint[] {
  if (r.head === undefined) return [];
  const head = `repo ref ${r.ref} on element ${r.element} names repository ${r.head}`;
  if (!codebases.some((cb) => cb.repo === r.head)) {
    return [lint("repo-ref-codebase", "warning", r.pointer, `${head}, which no entry of meta.codebases lists`)];
  }
  if (own !== undefined && own.repo !== r.head) {
    return [lint("repo-ref-codebase", "warning", r.pointer, `${head}, but the element's codebase ${own.id} is ${own.repo}`)];
  }
  return [];
}

function unlinkedLint(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): Lint[] {
  const c = chainElement(doc, index, link.chain);
  const p = chainElement(doc, index, link.provider);
  if (c === undefined || p === undefined || p === c || isDescendantOf(index, p, c)) return [];
  if (doc.dependencies.some((e) => edgeJoins(index, e, c, p))) return [];
  return [lint("cause-chain-unlinked", "warning", ptr("chains", link.chain, "causes", link.cause, "chain"),
    `cause ${link.cause} links to chain ${doc.chains[link.provider].id} on element ${doc.elements[p].id}, which is neither element ${doc.elements[c].id} nor below it, and no edge joins them`)];
}

// The catalog's positive-feedback rows: a consumer citing one is cascading or metastable, so its
// provider may rate a lower S. Each id is compared whole with `includes`, never as a prefix or a range.
export const CASCADING_ROWS: readonly string[] = ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"];

// The two rating lints skip a link whose function or element does not resolve at either end, as §6 requires.
function endsResolve(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): boolean {
  return chainElement(doc, index, link.chain) !== undefined && chainElement(doc, index, link.provider) !== undefined;
}

function isCascading(chain: Chain, cause: Cause): boolean {
  return triggerRestates(chain, cause.text) || chain.catalog_refs.some((r) => CASCADING_ROWS.includes(r.id));
}

function severityLint(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): Lint[] {
  const consumer = doc.chains[link.chain];
  const provider = doc.chains[link.provider];
  if (!endsResolve(doc, index, link) || consumer.causes.length !== 1 || isCascading(consumer, consumer.causes[link.cause])) return [];
  const ps = provider.ratings.S.value;
  const cs = consumer.ratings.S.value;
  if (ps >= cs) return [];
  return [lint("cause-chain-severity", "warning", ptr("chains", link.provider, "ratings", "S"),
    `chain ${provider.id} rates S ${ps}, below S ${cs} of chain ${consumer.id}, whose only cause is its failure mode`)];
}

function ratingO(chain: Chain): Rating | undefined {
  return (chain as Partial<Chain>).ratings?.O;
}

function citedText(o: { value: number; evidence_kind: RatingEvidenceKind; evidence_ref?: string }): string {
  return o.evidence_ref === undefined ? `O ${o.value} (${o.evidence_kind})` : `O ${o.value} (${o.evidence_kind}, ${o.evidence_ref})`;
}

function sameCitation(cited: CitedOccurrence, o: Rating): boolean {
  return cited.value === o.value && cited.evidence_kind === o.evidence_kind && cited.evidence_ref === o.evidence_ref;
}

function strayLint(cause: Cause, i: number, j: number): Lint[] {
  if (cause.cited_o === undefined) return [];
  return [lint("linked-cause-occurrence-drift", "warning", ptr("chains", i, "causes", j, "cited_o"), "cited O recorded on a cause with no linked chain")];
}

// Cause j of chain i: a cited O on a cause with no resolved link is stray; a resolved link records
// the provider's current O, or the consumer's O is flagged.
function driftLint(doc: FmeaDocument, index: DocIndex, i: number, j: number): Lint[] {
  const cause = doc.chains[i].causes[j];
  const p = cause.chain === undefined ? undefined : index.chain.get(cause.chain);
  if (p === undefined || p === i) return strayLint(cause, i, j);
  const providerO = ratingO(doc.chains[p]);
  if (!endsResolve(doc, index, { chain: i, cause: j, provider: p }) || ratingO(doc.chains[i]) === undefined || providerO === undefined) return [];
  const pid = doc.chains[p].id;
  const at = ptr("chains", i, "ratings", "O");
  const cited = cause.cited_o;
  if (cited === undefined) {
    return [lint("linked-cause-occurrence-drift", "warning", at, `cause ${j} links to ${pid} but records no cited O; re-score O and record the provider's O`)];
  }
  if (sameCitation(cited, providerO)) return [];
  return [lint("linked-cause-occurrence-drift", "warning", at, `cause ${j} cites ${pid} at ${citedText(cited)}; ${pid} now rates ${citedText(providerO)}`)];
}

// The flows each chain names, resolved to the first flow with that id; a chain that names no
// resolvable flow contributes no entry, because a name that resolves to nothing is
// `chain-flow-resolves`' case and no lint's. Each entry keeps the name's position in the chain's
// `flows[]` for the pointer and the flow's own document index for the pointers and messages.
interface NamedFlow { position: number; index: number; flow: Flow }
interface ChainFlows { chainIndex: number; chain: Chain; named: NamedFlow[] }

function chainNamedFlows(doc: FmeaDocument): ChainFlows[] {
  const flows = doc.flows ?? [];
  const at = new Map<string, number>();
  flows.forEach((f, i) => { if (!at.has(f.id)) at.set(f.id, i); });
  const out: ChainFlows[] = [];
  doc.chains.forEach((chain, chainIndex) => {
    const named = (chain.flows ?? []).flatMap((id, position) => {
      const index = at.get(id);
      return index === undefined ? [] : [{ position, index, flow: flows[index] }];
    });
    if (named.length > 0) out.push({ chainIndex, chain, named });
  });
  return out;
}

// The first chain, by index, that names each flow, so a flow several chains name is reported once.
function firstNamerOf(chainFlows: ChainFlows[]): Map<number, Chain> {
  const out = new Map<number, Chain>();
  for (const { chain, named } of chainFlows) {
    for (const { index } of named) if (!out.has(index)) out.set(index, chain);
  }
  return out;
}

// A named flow whose non-empty steps omit the chain's function is the wrong flow, unless the flow
// records itself partial; an empty steps is the no-steps rule's case.
function stepMismatchLint(at: ChainFlows, name: NamedFlow): Lint[] {
  const steps = name.flow.steps ?? [];
  if (steps.length === 0 || name.flow.steps_partial === true || steps.includes(at.chain.function)) return [];
  return [lint("chain-flow-step-mismatch", "warning", ptr("chains", at.chainIndex, "flows", name.position),
    `chain ${at.chain.id} names flow ${name.flow.id}, whose steps do not include function ${at.chain.function}`)];
}

function noStepsLint(at: ChainFlows, name: NamedFlow): Lint[] {
  if ((name.flow.steps ?? []).length > 0) return [];
  return [lint("chain-flow-no-steps", "warning", ptr("chains", at.chainIndex, "flows", name.position),
    `chain ${at.chain.id} names flow ${name.flow.id}, which records no steps`)];
}

// Each named flow's id is read in the rationale as a whole token (wholeToken, below), so `flow-1`
// reads in `flow-1 dies`, `flow-1.`, `flow-1:` and `flow-1...`, and does not read inside `myflow-1x`.
function rationaleUnnamedLint(at: ChainFlows): Lint[] {
  const rationale = at.chain.ratings.S.rationale;
  if (at.named.some((name) => wholeToken(rationale, name.flow.id))) return [];
  return [lint("chain-flow-rationale-unnamed", "warning", ptr("chains", at.chainIndex, "ratings", "S"),
    `chain ${at.chain.id} names flow ${at.named[0].flow.id} and its Severity rationale names none of the flows the chain names`)];
}

// The c1 lint's run-placeholder pattern and the words that name an edge's sla or limits, each a
// whole word, case-insensitive; `none recorded` and `none published` joined the pattern at the
// stage-1 gate (spec §11.5, ruling 5).
const PLACEHOLDER = /\b(?:not stated|none stated|not given|not provided|not documented|not recorded|not published|none recorded|none published|unknown|n\/a|tbd)\b/i;
const FIELD_WORD = /\b(?:limits?|ceiling|scaling|rate|sla|availability|latency)\b/i;
const EDGE_FIELDS = ["sla", "limits"] as const;

// A field is unstated when it is absent, empty, a text that names the inputs (the design or the
// supplied inputs as well), or a run placeholder; a stated absence in the inputs' own words, such
// as `no published request ceiling`, is stated.
function unstatedField(value: string | undefined): boolean {
  if (value === undefined) return true;
  const text = value.trim();
  return text === "" || /in the (design |supplied )?inputs/i.test(text) || PLACEHOLDER.test(text);
}

// `token` in `text` as a whole token, case-insensitive: not after a word character, a dot or a
// hyphen, and not before a word character, a hyphen or a dot that a word character follows. The
// lookahead accepts a full stop that ends a sentence and rejects a dot that continues a dotted id,
// so `for pricing.` names pricing and `pricing.cache` does not. A token that is empty after trimming
// never matches, so a name of spaces silences neither lint.
function wholeToken(text: string, token: string): boolean {
  if (token.trim() === "") return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w-]|\\.\\w)`, "i").test(text);
}

function namesProvider(text: string, element: { id: string; name?: string }): boolean {
  return [element.id, element.name].some((token) => token !== undefined && wholeToken(text, token));
}

function namesField(text: string): boolean {
  return FIELD_WORD.test(text);
}

// Per edge, not per field: one open assumption owned by user that names the provider and any field
// word silences every unstated field of the provider's edge.
function silenced(doc: FmeaDocument, element: { id: string; name?: string }): boolean {
  return doc.meta.assumptions.some((a) => a.status === "open" && a.owner === "user" && namesProvider(a.text, element) && namesField(a.text));
}

// One finding per unstated field of edge `index`, `sla` before `limits`, at the edge.
function edgeReliabilityLints(doc: FmeaDocument, index: number, edge: DependencyEdge): Lint[] {
  const unstated = EDGE_FIELDS.filter((field) => unstatedField(edge[field]));
  if (unstated.length === 0) return [];
  const provider = doc.elements.find((e) => e.id === edge.to) ?? { id: edge.to };
  if (silenced(doc, provider)) return [];
  return unstated.map((field) => lint("edge-reliability-unstated", "warning", ptr("dependencies", index),
    `edge ${edge.from} -> ${edge.to}: ${field} is missing or a placeholder, and no open assumption owned by user names ${edge.to} and ${field}. ` +
    `Leave ${field} out and record that assumption; copy the inputs' words instead only where they say there is none or none is published.`));
}

// The c11 lint's default rationale, a conversion's declared stand-in for an empty Justification
// cell; the change text that marks a document as a conversion; and the number word of each count
// from one to twelve. The words ran to ten until the second stage-1 gate, whose ruling 3 (spec
// §11.6) counts the ratings' evidence kind by rating as well, twelve on the legacy sheet's four rows.
const DEFAULT_RATIONALE = /^converted from .+; no rationale recorded\.?$/i;
const CONVERSION = /converted from|column mapping|conversion/i;
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

interface DefaultRow { id: string; name: string | undefined }

// A default a document carries: how many rows, controls or elements carry it, and the chains they
// sit on, or the elements themselves. `ratingCount`, on the ratings' evidence kind alone, is the
// number of ratings that carry it, a second count that records it as `count` does.
interface Substitution { count: number; rows: DefaultRow[]; ratingCount?: number }

// Each chain `keep` accepts, with the name of the element its function belongs to, since a chain
// has no name of its own; undefined when either does not resolve.
function chainRows(doc: FmeaDocument, keep: (chain: Chain) => boolean): DefaultRow[] {
  const index = indexDocument(doc);
  return doc.chains.flatMap((chain, i) => {
    if (!keep(chain)) return [];
    const at = chainElement(doc, index, i);
    return [{ id: chain.id, name: at === undefined ? undefined : doc.elements[at].name }];
  });
}

// The default rationale, counted by row: each chain with at least one rating that carries it.
function rationaleDefault(doc: FmeaDocument): Substitution | undefined {
  const rows = chainRows(doc, (chain) => FACTORS.some((f) => DEFAULT_RATIONALE.test(chain.ratings[f].rationale.trim())));
  return rows.length === 0 ? undefined : { count: rows.length, rows };
}

// A control default, counted by control: every control of every chain carries it and there is at
// least one; its rows are the chains that have a control.
function controlDefault(doc: FmeaDocument, carries: (control: Control) => boolean): Substitution | undefined {
  const controls = doc.chains.flatMap((chain) => chain.controls);
  if (controls.length === 0 || !controls.every(carries)) return undefined;
  return { count: controls.length, rows: chainRows(doc, (chain) => chain.controls.length > 0) };
}

// A default every chain carries, counted by row.
function everyChain(doc: FmeaDocument): Substitution {
  return { count: doc.chains.length, rows: chainRows(doc, () => true) };
}

// An effect default, counted by row: every chain carries the same text at `level`, an empty and an
// absent text counted as the same.
function effectDefault(doc: FmeaDocument, level: "local" | "next_level"): Substitution | undefined {
  if (new Set(doc.chains.map((chain) => chain.effects[level] ?? "")).size !== 1) return undefined;
  return everyChain(doc);
}

// The ratings' default evidence kind, counted by row and by rating: every S, O and D rating of every
// chain is an estimate.
function ratingEvidenceDefault(doc: FmeaDocument): Substitution | undefined {
  if (!doc.chains.every((chain) => FACTORS.every((f) => chain.ratings[f].evidence_kind === "estimate"))) return undefined;
  return { ...everyChain(doc), ratingCount: doc.chains.length * FACTORS.length };
}

// The elements' typing, counted by element: the converter types every element, so the default holds
// whenever there is one; its rows are the elements, each by its id and its name.
function typingDefault(doc: FmeaDocument): Substitution | undefined {
  if (doc.elements.length === 0) return undefined;
  return { count: doc.elements.length, rows: doc.elements.map((element) => ({ id: element.id, name: element.name })) };
}

// The defaults the lint reads, in the order of its findings: the rationale in every document, the
// other six only in a conversion of two chains or more. `names` is a clause that names the field,
// case-insensitive: `rationale` anywhere; `status` as a whole word; `evidence.kind` or
// `evidence kind`, and since the second stage-1 gate no longer `evidence_kind`, the ratings' field;
// `local` as a whole word, which `effects.local` and `local effect` hold, or `effects` together
// with `local`; `next_level`, `next level` or `next-level`, which `effects.next_level` holds;
// `evidence_kind`, or `estimate` as a whole word; and `type`, `typed`, `types`, `typing`,
// `boundary` or `role` as a whole word, or `elements[].kind` as a whole token, where `kind` alone,
// as in `evidence.kind`, names nothing. `alsoRecordedBy`, on the typing alone, is a clause that
// records the default whatever its count: one that maps a sheet column to `elements[].kind` or
// `elements[].boundary`.
interface DefaultField {
  field: string;
  unit: "row" | "control" | "element";
  names: RegExp;
  conversionOnly: boolean;
  find: (doc: FmeaDocument) => Substitution | undefined;
  alsoRecordedBy?: RegExp;
}
const DEFAULT_FIELDS: DefaultField[] = [
  { field: "rationale", unit: "row", names: /rationale/i, conversionOnly: false, find: rationaleDefault },
  { field: "status", unit: "control", names: /\bstatus\b/i, conversionOnly: true, find: (doc) => controlDefault(doc, (c) => c.status === "existing") },
  { field: "evidence.kind", unit: "control", names: /evidence[. ]kind/i, conversionOnly: true, find: (doc) => controlDefault(doc, (c) => c.evidence.kind === "none") },
  { field: "effects.local", unit: "row", names: /\blocal\b|effects.*local|local.*effects/is, conversionOnly: true, find: (doc) => effectDefault(doc, "local") },
  { field: "effects.next_level", unit: "row", names: /next[_ -]level/i, conversionOnly: true, find: (doc) => effectDefault(doc, "next_level") },
  { field: "evidence_kind", unit: "row", names: /evidence_kind|\bestimate\b/i, conversionOnly: true, find: ratingEvidenceDefault },
  {
    field: "typing", unit: "element", names: /\btyp(e|ed|es|ing)\b|\bboundary\b|\brole\b|(?<![\w.-])elements\[\]\.kind(?![\w-]|\.\w)/i,
    conversionOnly: true, find: typingDefault, alsoRecordedBy: /elements\[\]\.(kind|boundary)/,
  },
];

// A document is a conversion when a meta.history change says it was converted, names a column
// mapping or a conversion; the lint reads the six other defaults of a conversion of two chains or
// more, the rationale of any document.
function readsConversionDefaults(doc: FmeaDocument): boolean {
  return doc.chains.length >= 2 && doc.meta.history.some((entry) => CONVERSION.test(entry.change));
}

// A quoted span of a change text: from an opening quote to its closing one, matched left to right
// without nesting, or to the end of the text when it has none. The pairs are straight double quotes,
// “…”, straight single quotes and ‘…’. A single quote, straight or curly, opens a span only where
// no word character precedes it and closes one only where no word character follows it, so the
// apostrophe of `sheet's` or `rows'` neither opens nor closes a span.
const QUOTED_SPAN = /"[^"]*(?:"|$)|“[^”]*(?:”|$)|(?<!\w)'(?:[^']|'(?=\w))*(?:'(?!\w)|$)|(?<!\w)‘(?:[^’]|’(?=\w))*(?:’(?!\w)|$)/g;

// The change text with every `;` and `.` inside a quoted span blanked to a space, its length kept, so
// a quoted default text such as `'converted from x.csv; no local effect recorded'` ends no clause.
function blankQuotedStops(change: string): string {
  return change.replace(QUOTED_SPAN, (span) => span.replace(/[.;]/g, " "));
}

// Every clause of every meta.history entry: the change text, its quoted stops blanked, split on `;`
// and on a full stop, a dot that no word character follows, so a dotted name such as
// `controls[].evidence.kind` stays in one clause, as wholeToken reads a dot that continues an id.
// Before the stage-1 gate every dot split.
function historyClauses(doc: FmeaDocument): string[] {
  return doc.meta.history.flatMap((entry) => blankQuotedStops(entry.change).split(/;|\.(?!\w)/));
}

// A clause holds `count` as a standalone integer, adjacent to no letter, digit, `-` or `_`, so
// neither a date nor `ch-1` counts, or holds its number word under the same neighbour rule, so
// `one-to-one` is not the count one, as `row-1` is not 1.
function holdsCount(clause: string, count: number): boolean {
  if (new RegExp(`(?<![\\w-])${count}(?![\\w-])`).test(clause)) return true;
  return count <= NUMBER_WORDS.length && new RegExp(`(?<![\\w-])${NUMBER_WORDS[count - 1]}(?![\\w-])`, "i").test(clause);
}

// A clause records a default when it names the field together with the count, or the ratings'
// count where the default has one, as holdsCount reads them; or with every affected row's chain id
// or element name, or every affected element's id or name, each a whole token.
function recordsSubstitution(clause: string, names: RegExp, { count, rows, ratingCount }: Substitution): boolean {
  if (!names.test(clause)) return false;
  if (holdsCount(clause, count) || (ratingCount !== undefined && holdsCount(clause, ratingCount))) return true;
  return rows.every((row) => wholeToken(clause, row.id) || (row.name !== undefined && wholeToken(clause, row.name)));
}

// A clause records a field's default as recordsSubstitution reads it, or, where the field has
// `alsoRecordedBy`, whenever it matches that pattern, whatever its count.
function recordedBy(clause: string, { names, alsoRecordedBy }: DefaultField, sub: Substitution): boolean {
  return alsoRecordedBy?.test(clause) === true || recordsSubstitution(clause, names, sub);
}

// The finding's message. A row's or a control's reads in the shipped form, so the rationale's reads
// as it shipped; an element's, the typing's, in its own words.
function substitutionMessage(count: number, unit: DefaultField["unit"], field: string): string {
  if (unit === "element") {
    return `${count} element(s) carry the default ${field}, and no meta.history clause names the ${field} with that count or with every element's id or name. ` +
      `Keep the ${field}, and add that clause to meta.history, not to an assumption, a ground rule or a row's history.`;
  }
  return `${count} ${unit}(s) carry the default ${field}, and no meta.history clause names ${field} with that count or with those rows' chain ids or element names. ` +
    "Keep the default, and add that clause to meta.history, not to an assumption or a row's history.";
}

// One finding at meta.history per default the document carries and no clause records, in the
// order of DEFAULT_FIELDS.
function substitutionLint(doc: FmeaDocument): Lint[] {
  const clauses = historyClauses(doc);
  const conversion = readsConversionDefaults(doc);
  return DEFAULT_FIELDS.flatMap((entry) => {
    const sub = entry.conversionOnly && !conversion ? undefined : entry.find(doc);
    if (sub === undefined || clauses.some((clause) => recordedBy(clause, entry, sub))) return [];
    return [lint("conversion-substitution-unrecorded", "warning", ptr("meta", "history"), substitutionMessage(sub.count, entry.unit, entry.field))];
  });
}

function flowUsersLint(flow: Flow, index: number, chain: Chain): Lint[] {
  const review = flow.users?.review;
  if (review !== undefined && review.status !== "provisional") return [];
  return [lint("flow-users-provisional", "warning", ptr("flows", index, "users", "review"),
    `flow ${flow.id} is named by chain ${chain.id} and its population is not yet re-scored by a named person`)];
}

export const MACHINE_RULES: MachineRule[] = [
  {
    // A high Occurrence backed only by judgement is unreviewable unless the row says what sets the failure off.
    id: "occurrence-estimate-without-trigger",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const trigger = typeof c.trigger === "string" ? c.trigger.trim() : "";
        if (c.ratings.O.evidence_kind === "estimate" && c.ratings.O.value >= 7 && trigger === "") {
          out.push(lint("occurrence-estimate-without-trigger", "warning", ptr("chains", i, "ratings", "O"),
            "Occurrence is 7 or more on an estimate with no trigger recorded"));
        }
      }
      return out;
    },
  },
  {
    // Detection 1 claims the failure is caught immediately; that claim needs a control that exists and has evidence.
    id: "detection-1-without-evidenced-control",
    severity: "blocker",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const evidenced = c.controls.some((ctl) => ctl.kind === "detection" && ctl.status === "existing" && ctl.evidence.kind !== "none");
        if (c.ratings.D.value === 1 && !evidenced) {
          out.push(lint("detection-1-without-evidenced-control", "blocker", ptr("chains", i, "ratings", "D"),
            "Detection is 1 with no existing detection control carrying evidence"));
        }
      }
      return out;
    },
  },
  {
    // A provisional rating is one nobody has reviewed yet; the report marks the row and the user is asked to re-score.
    id: "rating-provisional",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      const scan = (ratings: Ratings, i: number, key: "ratings" | "post_ratings"): void => {
        for (const f of FACTORS) {
          if (ratings[f].review.status === "provisional") {
            out.push(lint("rating-provisional", "warning", ptr("chains", i, key, f), "The rating is still provisional and needs re-scoring"));
          }
        }
      };
      for (let i = 0; i < doc.chains.length; i++) {
        scan(doc.chains[i].ratings, i, "ratings");
        const post = doc.chains[i].post_ratings;
        if (post) scan(post, i, "post_ratings");
      }
      return out;
    },
  },
  {
    // An action carried over from a postmortem loses its trail if the incident is recorded on the row but not on the action.
    id: "seeded-action-without-incident",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const seeded = typeof c.source_incident === "string" && c.source_incident.trim() !== "";
        if (!seeded) continue;
        for (let j = 0; j < c.actions.length; j++) {
          const ref = c.actions[j].source_incident;
          if (typeof ref !== "string" || ref.trim() === "") {
            out.push(lint("seeded-action-without-incident", "warning", ptr("chains", i, "actions", j),
              `action on a chain seeded from ${c.source_incident} carries no source_incident`));
          }
        }
      }
      return out;
    },
  },
  {
    // Ground rules and assumptions are what the ratings were made under; a document that records
    // neither cannot be re-read later against the conditions its scores assumed.
    id: "metadata-without-ground-rules",
    severity: "blocker",
    check(doc) {
      const out: Lint[] = [];
      if (doc.meta.ground_rules.length === 0) {
        out.push(lint("metadata-without-ground-rules", "blocker", ptr("meta", "ground_rules"),
          "the document records no ground rules"));
      }
      if (doc.meta.assumptions.length === 0) {
        out.push(lint("metadata-without-ground-rules", "blocker", ptr("meta", "assumptions"),
          "the document records no assumptions"));
      }
      return out;
    },
  },
  {
    // A link the document holds with no target to explain it is stale or pasted from another analysis.
    id: "tracker-link-without-config",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const actions = doc.chains[i].actions;
        for (let j = 0; j < actions.length; j++) {
          const link = actions[j].tracker;
          if (link !== undefined && doc.meta.tracker?.provider !== link.provider) {
            out.push(lint("tracker-link-without-config", "warning", ptr("chains", i, "actions", j, "tracker"),
              `the action carries a ${link.provider} link but meta.tracker is absent or names another provider`));
          }
        }
      }
      return out;
    },
  },
  {
    // One tracker item standing for two actions means a refresh would move both on one item's state.
    id: "tracker-link-shared",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      const first = new Map<string, string>();
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        for (let j = 0; j < c.actions.length; j++) {
          const link = c.actions[j].tracker;
          if (link === undefined) continue;
          const holder = first.get(link.id);
          if (holder === undefined) {
            first.set(link.id, `${c.id}/${c.actions[j].id}`);
          } else {
            out.push(lint("tracker-link-shared", "warning", ptr("chains", i, "actions", j, "tracker"),
              `the tracker item ${link.key} is already linked from action ${holder}`));
          }
        }
      }
      return out;
    },
  },
  {
    // A dependency catalog row describes a failure at the edge to something the system relies on;
    // applied to an element that is the provider of no edge, its strength, SLA and limits are unrecorded.
    id: "dependency-row-without-dependency",
    severity: "warning",
    check(doc) {
      const providers = providerIds(doc);
      return rowLints(doc, "dependency", (el) => providers.has(el.id), () => "which is the provider of no edge");
    },
  },
  {
    // A security catalog row applied to an element not marked security-relevant leaves the
    // element's flag and the row's subject at odds.
    id: "security-row-without-flag",
    severity: "warning",
    check(doc) {
      return rowLints(doc, "security", (el) => el.security_relevant, () => "which is not marked security-relevant");
    },
  },
  {
    // Once one repo ref names its owner, repo and commit, every other repo ref should too, and a
    // short commit can stop resolving; while none is qualified the rule stays silent.
    id: "repo-ref-form",
    severity: "warning",
    check(doc) {
      const refs = repoRefs(doc);
      if (!refs.some((r) => r.commit !== undefined)) return [];
      return refs.flatMap(repoRefLint);
    },
  },
  {
    // A qualified repo ref should name a repository a codebase lists, and the one its element's
    // codebase names; while the document lists no codebases the rule stays silent.
    id: "repo-ref-codebase",
    severity: "warning",
    check(doc) {
      const codebases = doc.meta.codebases;
      if (codebases === undefined) return [];
      const effective = effectiveCodebases(doc, indexDocument(doc));
      return repoRefs(doc).flatMap((r) => repoCodebaseLint(r, codebases, effective[r.index]));
    },
  },
  {
    // A cause linked to another element's chain runs down the containment walk or across a
    // recorded edge; a link that does neither names a dependency the document does not hold.
    id: "cause-chain-unlinked",
    severity: "warning",
    check(doc) {
      const index = indexDocument(doc);
      return resolvedLinks(doc, index).flatMap((l) => unlinkedLint(doc, index, l));
    },
  },
  {
    // A consumer whose only cause is the provider's failure inherits that failure's effect, so the
    // provider should not rate a lower S unless the consumer is cascading or metastable.
    id: "cause-chain-severity",
    severity: "warning",
    check(doc) {
      const index = indexDocument(doc);
      return resolvedLinks(doc, index).toSorted((a, b) => a.provider - b.provider || a.chain - b.chain).flatMap((l) => severityLint(doc, index, l));
    },
  },
  {
    // A linked cause records the provider's O it was rated against; once the provider's O moves,
    // the consumer's O needs re-scoring.
    id: "linked-cause-occurrence-drift",
    severity: "warning",
    check(doc) {
      const index = indexDocument(doc);
      return doc.chains.flatMap((c, i) => c.causes.flatMap((_, j) => driftLint(doc, index, i, j)));
    },
  },
  {
    // A chain and the flow it names describe one journey; a flow whose steps omit the chain's
    // function is the wrong flow, unless the flow records itself partial.
    id: "chain-flow-step-mismatch",
    severity: "warning",
    check(doc) {
      return chainNamedFlows(doc).flatMap((at) => at.named.flatMap((name) => stepMismatchLint(at, name)));
    },
  },
  {
    // A chain naming a flow that records no steps names a journey the flow does not describe; the
    // partial prefix cannot stand in for the steps themselves.
    id: "chain-flow-no-steps",
    severity: "warning",
    check(doc) {
      return chainNamedFlows(doc).flatMap((at) => at.named.flatMap((name) => noStepsLint(at, name)));
    },
  },
  {
    // A chain that names flows ranks a Severity for them; a rationale that names none of them does
    // not say why that S holds for those journeys.
    id: "chain-flow-rationale-unnamed",
    severity: "warning",
    check(doc) {
      return chainNamedFlows(doc).flatMap(rationaleUnnamedLint);
    },
  },
  {
    // A flow named by a chain carries a population; until a named person has re-scored it, the
    // denominator the value priority rests on is nobody's reviewed view.
    id: "flow-users-provisional",
    severity: "warning",
    check(doc) {
      const namer = firstNamerOf(chainNamedFlows(doc));
      return (doc.flows ?? []).flatMap((flow, index) => {
        const chain = namer.get(index);
        return chain === undefined ? [] : flowUsersLint(flow, index, chain);
      });
    },
  },
  {
    // A provider whose SLA or limits the inputs do not state is recorded as an open assumption, never as a placeholder; the gap the 0.7.0 round missed on prompt 1, and since the stage-1 gate the baseline's `none recorded`, `none published` and design- and supplied-inputs placeholders as well (spec §11.5, ruling 5).
    id: "edge-reliability-unstated",
    severity: "warning",
    check(doc) {
      return doc.dependencies.flatMap((edge, i) => edgeReliabilityLints(doc, i, edge));
    },
  },
  {
    // A conversion's declared default is a substitution only when meta.history itself says so, by count or by row: the clause rubric c11 reads. The default rationale in any document; since the stage-1 gate, in a conversion of two chains or more, the controls' status and evidence kind and the local and next-level effects as well (spec §11.5, ruling 4); since the second stage-1 gate, the ratings' evidence kind and the elements' typing too (spec §11.6, ruling 3).
    id: "conversion-substitution-unrecorded",
    severity: "warning",
    check(doc) {
      return substitutionLint(doc);
    },
  },
];

export function runLints(doc: FmeaDocument, rules: MachineRule[] = MACHINE_RULES): Lint[] {
  const out: Lint[] = [];
  for (const rule of rules) out.push(...rule.check(doc));
  return out;
}

// The loaded table's broken properties (§7), one warning each at the field that names the table:
// a finding of the table, not of a row, so it leaves the quality score as it is. validateDocument
// adds them after the document's own lints; priority.ts prints the same findings as lines.
export function tablePropertyLints(table: PriorityTable): Lint[] {
  return checkTableProperties(table).map((message) => lint("priority-table-property", "warning", ptr("meta", "scales", "priority_table"), message));
}

// The stderr line of a finding that does not fail the run, `<severity> <rule>: <message>`, kept on
// one line as formatError keeps its message, whatever the table id holds.
export function formatLintLine(finding: Lint): string {
  return `${finding.severity} ${finding.rule}: ${finding.message.replace(/\s+/g, " ").trim()}`;
}
