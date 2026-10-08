# fmea-software: runs over several codebases and services (schema v3)

**Date:** 2026-10-08
**Status:** approved in brainstorming; revised the same day after a three-lens review (§20); awaiting user review of this written spec
**Amends:** `2026-09-07-fmea-software-design.md` §5 (the update mode) and §6 (the data model), which receive dated amendment notes pointing here when this design is accepted. The decisions of that design stand except where a section below says otherwise.
**Consumer:** the v1 consumer first, one enterprise TypeScript application whose services live in several repositories and together serve one critical flow; the general plugin after it.
**Evidence:** none. Every wholly new sentence this design adds under `skills/` is tagged `skill-authored`; a sentence it changes keeps the record it already cites; no record enters the register in `references/provenance.md`. The classical practice this design follows, linking the failure of a lower-level item to a cause at the next level up, is named as practice in this document only. The research corpus holds no record that defines a next-higher, focus and next-lower level structure, so the shipped text calls the linkage the skill's own (§13).

---

## 1. Purpose

A run over several services and repositories must deliver two outcomes the v2 format cannot.

1. **Trace a failure across services.** A cause on one service's chain is the failure mode of another service's chain, and the document records that as a reference. The dependency between the two services is an edge of its own, with its own strength, so two consumers can depend on one provider differently.
2. **Read the analysis per service or codebase.** The document says which codebase each element belongs to, the report counts chains per top-level element, and the report's row sections are grouped by top-level element.

Set aside by the user on 2026-10-08, and listed in §17 as later work: updating one codebase alone after a change in it, and a tracker target per team. The one tracker target per analysis stays as it is.

## 2. Decisions

| # | Decision | Ruling |
|---|---|---|
| M1 | Scenario | Both at once: several services that form one flow, each in its own repository and often with its own team, and one product spread over several repositories. The codebase is a sourcing concern and a structure concern in the same run. |
| M2 | Unit of grouping | The depth-1 element, which the hierarchy already provides, plus a codebase record in `meta` that each element may point at by id. The report sections by top-level element and names the codebase of each. |
| M3 | Dependencies | Edges from a consumer element to a provider element in a required top-level part, `dependencies[]`, each with its own strength, SLA and limits. The dependency block on the element is removed. |
| M4 | Trace | A chain-to-chain link on the consumer's cause, `causes[].chain`, naming the provider's chain whose failure mode the cause is. No element reference on the effect: the linked chain's element is the next-level element, and where no chain is linked the effect stays prose. |
| M5 | Format | Schema v3, with a pre-schema gate that refuses a v2 document by one issue naming the migration, and a migration performed by the skill's update mode. Not an additive change on v2, which would keep two ways of recording a dependency and keep "the analysed system" in the vocabulary, the very notion a multi-service run makes ambiguous. |
| M6 | Report | The chain index is unchanged. The row sections are grouped under one heading per top-level element. Two tables are added to the Structure section and a codebases list to the header. |
| M7 | Stale reason | `element-changed` covers a change to an edge into the element. No new reason, so the closed vocabulary and the ordering rule stand. A `dependency-changed` reason is listed in §17 as the alternative if the stale notice ever needs to be precise. |
| M8 | Strength (revised at review) | The loss-of-access class is excluded on a chain only when every inbound edge, to the chain's element or to one of its ancestors, is weak. The first draft read the strength off the edge of the consumer identified by a link; the review showed that rule undefined with two linking consumers and absent when the link runs through containment (§20). |
| M9 | Severity lint scope (revised at review) | The machine lint fires only when the linked cause is the consumer chain's only cause. With more causes, the consumer's severity may come from its own mechanism, so the check is a reviewer rule there (§6, §11, §20). |

**Why M4 links chains.** The first proposal kept chains independent and put an element reference on the effect, to spare the update mode. The user asked why the design should leave the well-travelled path, and the answer is that it should not. Classical FMEA links levels: the failure mode of a lower-level item is a cause at the next level up, and its next-level effect is that level's failure mode. The link buys three things beyond the idiom. Severity consistency: without a link, the provider's row and the consumer's row each write their own end effect and rate S on it, and across services they will disagree; with a link, a lint or a reviewer flags a provider whose S is below the S of a consumer row it feeds. Occurrence evidence: the consumer's cause is the provider's failure mode, so the provider's O and its evidence are evidence for that cause, which §11 makes a reviewer rule. And the element reference comes for free. The costs, accepted: the update-mode rules of §10, an acyclicity invariant (§5), and two chains per cross-service failure, which is the work of a multi-service FMEA rather than overhead on it.

**Why the link sits on the cause.** The consumer's analyst knows what they depend on, the cause already exists as a record, and the provider's row shows where its failure propagates by inverting the links. One relation in one place; the provider-side and two-sided variants were considered and set aside.

## 3. What v2 offers and where it stops

Schema v2 (PR #24) added three things for a run over several codebases: `meta.boundary.included` lists each codebase as a prose string; a `repo` source ref may take the qualified form `owner/repo@commit:path`, with the lint `repo-ref-form` checking that once one ref is qualified every ref is; and several systems may sit at depth 1 with no artificial root above them.

What stops there. A codebase is not an entity: nothing ties an element to its repository except a string inside a source ref, so nothing can group, count or check by codebase. A dependency is unary: the block on the provider says how "the analysed system" depends on it, so with two in-scope services the dependency of checkout on pricing has no edge to live on, and strength cannot differ per consumer. Hierarchy is containment and ids are one namespace, so a gateway two services call must nest under one of them or sit at the root. The next-level effect is prose, so a failure that crosses a service boundary is traced by reading.

## 4. Data model

The schema `$id` becomes `urn:fmea-software:schema:fmea:v3`. The authored top-level parts become five: `meta`, `elements`, `functions`, `dependencies`, `chains`, written in that order, with `computed` after them as before. The keyword subset `schema.ts` interprets (`$ref` into `$defs`, `type`, `properties`, `required`, `additionalProperties: false`, `items`, `minItems`, `enum`, `const`, `pattern`, `format`, `minimum`, `maximum`, `minLength`) expresses everything below; uniqueness, cross-references, `from` differing from `to`, acyclicity and the conditional inbound-edge requirement are invariants (§5), as the existing cross-reference rules are.

### 4.1 `meta.codebases[]`

Optional; absent in a run that names no codebase, and `minItems: 1` when present, so "absent" is the one way to say none. Set in step 1, beside the boundary. One entry per codebase the run covers or reads:

- `id`: a plain id (`$ref plainId`), unique in the list (invariant `codebase-id-unique`).
- `name`: how the team says it (`$ref nonEmptyString`).
- `repo`: the repository in the `owner/repo` form, declared with a `pattern` equal to the head sub-pattern of the qualified repo ref in `lints.ts`, so the lint of §6 can match the two.
- `path?`: a folder inside the repository, for a codebase that is part of a monorepo (`$ref nonEmptyString`).

No commit on the record. The qualified `repo` source ref already pins one per ref, and a record-level pin belongs to the "update one codebase alone" outcome that is set aside (§17).

`meta.boundary.included` stays as it is and describes what inside the codebases is covered; SKILL.md no longer tells the run to list codebases there (§13).

### 4.2 `elements[].codebase?`

A plain id naming an entry of `meta.codebases[]` (invariant `element-codebase-resolves`). Permitted on an element of any boundary. An `in_scope` element without one takes its parent's, recursively, so a run sets it on its roots and overrides it only where a child lives elsewhere, such as a shared library in its own repository. An element whose boundary is `owned_outside` or `third_party` never inherits: it has a codebase only when it sets one, so a third-party gateway nested under an in-scope root is not reported as living in that root's repository. That resolved value is the element's **effective codebase**, which the report and the counts use; an element with none has no effective codebase.

### 4.3 `dependencies[]`

Required at the top level; an empty array when nothing depends on anything. One entry per edge, authored in step 2 from the dependency classification of the inputs:

- `from`: the consumer, `$ref elementId` (invariant `dependency-from-resolves`).
- `to`: the provider, `$ref elementId` (invariant `dependency-to-resolves`), different from `from` (invariant `dependency-self`).
- `strength`: `strong` or `weak`, as the design-inputs checklist classifies a dependency.
- `sla?`, `limits?`: free text in the source's own terms, as before. Nothing computes on them.

A `(from, to)` pair occurs once (invariant `dependency-pair-unique`), and the pair is the edge's identity for the update mode's diff (§10). An edge may cross levels in either direction, so a parent may depend on its child, as checkout does on its gateway, and a child on a sibling or on an element of another root. Edges are not required to be acyclic: services call each other both ways.

An element whose boundary is `owned_outside` or `third_party` is the `to` of at least one edge; this is today's `element-dependency-required`, reworded. Such an element is an external dependency; an `in_scope` element that is the `to` of an edge is an internal dependency, as before. An outside element consumed only by another outside element is allowed, since a third-party service behind an owned-outside service is a real shape; a stricter rule is listed in §17.

### 4.4 `causes[].chain?`

Optional on every cause: a plain id naming another chain in the document, the provider's chain whose failure mode this cause is. The cause's `text` states that failure mode in the consumer's terms. Nothing changes on the provider's chain; the report derives "propagates to" by inverting the links (§12). Invariants: the id resolves (`cause-chain-resolves`), it is not the cause's own chain (`cause-chain-self`), and the link graph over the document is acyclic (`cause-chain-cycle`). A link between two chains on the same element is allowed: one mode of an element may cause another.

### 4.5 Removed

`elements[].dependency` is removed from the schema and from `types.ts`, and `additionalProperties: false` on the element then refuses the key. Its three fields live on the edge. A v2 document that carries it is refused by the gate of §7 before the schema stage.

### 4.6 Types

`types.ts` gains `Codebase { id; name; repo; path? }` and `DependencyEdge { from; to; strength; sla?; limits? }`, gains `codebase?` on `Element` and `chain?` on `Cause`, gains `dependencies: DependencyEdge[]` on `FmeaDocument` and `codebases?: Codebase[]` on `Meta`, and loses `Dependency` and `Element.dependency`.

## 5. Invariants

Violations are errors, reported by `validate.ts` in `errors[]`, as the existing invariants are. The ten ids join `INVARIANT_RULES` in `invariants.ts` after `element-security-rationale-required`, in the order of the table below, which fixes the order of `errors[]` that `invariants.test.ts` asserts. They also join the validator-id sentence of `quality-and-lint.md` and its validator table.

| Id | Rule | Pointer |
|---|---|---|
| `codebase-id-unique` | No two entries of `meta.codebases[]` share an id. | each later entry's `id` |
| `element-codebase-resolves` | `elements[].codebase` names an entry of `meta.codebases[]`. | the element's `codebase` |
| `dependency-from-resolves` | `dependencies[].from` names an element. | the edge's `from` |
| `dependency-to-resolves` | `dependencies[].to` names an element. | the edge's `to` |
| `dependency-self` | `from` and `to` differ. | the edge's `to` |
| `dependency-pair-unique` | No two edges share `from` and `to`. | each later edge |
| `element-dependency-required` | An element whose boundary is not `in_scope` is the `to` of at least one edge. Message: "element X has boundary B and no edge depends on it". | the element's `boundary` |
| `cause-chain-resolves` | `causes[].chain` names a chain. | the cause's `chain` |
| `cause-chain-self` | `causes[].chain` is not the chain the cause belongs to. | the cause's `chain` |
| `cause-chain-cycle` | Over the links that resolve and are not self-links, keyed by chain index, the strongly connected components of the link graph are computed; one issue per component of two or more chains, at the link inside the component with the smallest (chain index, cause index). A chain that leads into a cycle but is not on it is not reported. | that cause's `chain` |

The cycle check is defined over components rather than over walks because cause links form a multigraph, two cycles can share links, and a walk-based rule would report at different pointers depending on where it started. The walk survives dangling links and duplicate chain ids, since the invariants run together.

## 6. Lints

Warnings, written to `computed.lints[]` with severity `warning`; warnings do not affect the quality score, which counts blockers only. The machine lint count in `quality-and-lint.md` goes from eleven to fourteen. Every lint below skips a link, a function or an element that does not resolve, as the existing row lints do, because lints run even when an invariant fails. Each lint's findings are emitted in a fixed order, by chain index then cause index, because the validator compares `computed.lints` in order when it checks for a stale computed block.

| Id | Rule |
|---|---|
| `repo-ref-codebase` | While `meta.codebases[]` is present: a qualified `repo` source ref whose `owner/repo` head is the `repo` of no entry is flagged; otherwise a qualified `repo` ref on an element that has an effective codebase, whose `repo` is a different repository, is flagged. One finding per ref, the first check winning. Unqualified refs are not checked, an element with no effective codebase gets only the first check, and nothing is flagged while the list is absent. |
| `cause-chain-unlinked` | Let C be the element of the cause's chain and P the element of the linked chain, each reached through its function. Not flagged when P equals C, when P's id begins with C's id followed by a dot, or when some edge runs from an element in {C, its ancestors, its descendants} to an element in {P, its ancestors}. Otherwise flagged at the cause's `chain`: the link crosses neither containment nor a recorded dependency. A warning and not an error, because a team may arrange its hierarchy another way. |
| `cause-chain-severity` | When a linked cause is the only cause of its chain, and the provider chain's `ratings.S.value` is below the consumer chain's `ratings.S.value`, flagged at the provider's `/chains/<provider>/ratings/S`, naming the consumer chain. Severity flows from the top of the net, so a provider whose failure is the whole cause of a worse consumer effect is under-rated. Read from `ratings` only, never from `post_ratings`. One finding per (provider, consumer) pair, iterated by provider chain index then consumer chain index. A consumer chain with more than one cause is left to the reviewer rule of §11, because the consumer's own mechanism, such as unbudgeted retries, may rate it higher than any provider's failure. |
| `dependency-row-without-dependency` | Reworded: a chain whose function resolves to an element that is the `to` of no edge cites a `cat-dependency-` catalog ref. Same id, same severity. |

`repo-ref-form` is unchanged.

## 7. The legacy gate

A second pre-schema check runs after the v1 check in `legacy.ts`, so a v1 document still gets its `KIND_LEGACY` message first. Both checks share the v1 gate's shape precondition: an object whose `elements` is an array of objects; anything else is left to the schema stage, as today, so a non-analysis still gets schema lines and the existing test for that input holds.

A document is a v2 document when its top level has no `dependencies` key (pointer `/dependencies`), or when any element carries a `dependency` key (pointer `/elements/<i>/dependency`). The gate reports one issue, the first trait in that order (the top level, then elements in document order), with code `DEPENDENCY_LEGACY`, rule `format-legacy`, and a message naming the "Migrate a v2 document" section of SKILL.md. `DEPENDENCY_LEGACY` joins `CODES` with the validation exit status, and `validate.ts`, `render.ts` and `track.ts` refuse the same way because all three call `validateDocument`.

Two consequences, stated so nobody is surprised. A v3 document that merely omits the key is told to migrate, which is harmless, since the migration gives it an empty array; the schema's `required` entry for `dependencies` is therefore reached only through the gate. A document that has `dependencies` and also an element with a `dependency` key is told to migrate, and the migration merges the blocks into the existing array (§8).

## 8. Migrating a v2 document

Performed by the skill's update mode, recorded in `meta.history`, bumping `meta.version`, and run alone, never in the same update as an architecture change, as the v1 migration is. The rules go in `structure-elements.md` under a heading beside the v1 ones.

- `dependencies[]` is created when absent and kept when present. Each element's `dependency` block becomes one edge whose `to` is the element and whose `strength`, `sla` and `limits` are the block's; the block is removed. A document with no block and no array gets an empty array.
- The edge's `from` is the element's parent when the parent is `in_scope`; otherwise the nearest `in_scope` ancestor. Under M8 no rating depends on which in-scope ancestor the edge comes from, so the meaning is preserved without an assumption, and the history entry names the ancestor chosen.
- For a provider with no in-scope ancestor, `from` is the one other in-scope top-level element when exactly one exists. When several exist the person is asked; unattended, the first such element in document order is taken and listed in `meta.assumptions[]` as an open assumption owned by `user`.
- When no in-scope element exists anywhere in the document: an `in_scope` provider has its block dropped, gets no edge, and the drop is listed as an open assumption owned by `user`, since it validates without an edge; an outside provider cannot validate without one, so the migration writes nothing, and unattended it ends with the question in its final message.
- A v1 document runs the v1 migration and then this one in the same update: one version bump, one history entry naming both. The v1 rule that keeps the `dependency` block becomes "its `dependency` block is carried into the v2 migration's edge".
- The migration adds no codebase and no link. Both are later work for the person, through an ordinary update.
- The migration marks no row stale: the meaning is preserved and no rating depends on where strength is written.
- The history entry names the edges made, each with its `from` and the rule that chose it.

A role or boundary the person changes afterwards, an edge they add or change, and a link they add, all go through the ordinary update rules of §10.

## 9. Converting a sheet

The declared default for an item with a boundary other than `in_scope` and no strength in the sheet stays `strong`. Every outside item, whether or not the sheet carries a strength, gets one edge whose `from` is the first in-scope item in sheet order, recorded as a declared substitution in the column mapping with an open assumption owned by `user`, as the strength default already is. Neither choice of consumer comes from the sheet; this one is plain, is recorded, and under M8 moves no rating and no row. A sheet with no in-scope item cannot give an outside item a consumer, so the conversion stops and asks, and unattended it writes nothing and ends with the question. In the legacy fixture the edge is from the checkout interface to the gateway.

## 10. Update mode

Replaces the element-changed sentence of §5 of the main design and of SKILL.md.

- **Edges are diffed by `(from, to)`.** An edge is added, removed, or changed in `strength`, `sla` or `limits`. An edge whose consumer element was removed or re-parented is a removed edge.
- **An element changed** when its `kind`, `boundary` or `security_relevant` changed, or when an edge whose `to` is the element was added, removed or changed. Name, description, sources, security rationale and codebase are labels and do not count. A change of `parent` is a change of `id`, a removed element and a new one, as before.
- **The rows an edge change marks stale** are the chains on the `to` element, and the chains on the `from` element or its descendants that link through a cause into a chain on the `to` element. The reason is `element-changed` for both (M7). The provider side is the exact element, as a dependency-block change was in v2; a link into a chain on a descendant of the `to` element is not reached, and that asymmetry is accepted. The ordering rule among reasons is unchanged.
- **A removed chain breaks every link into it.** The update drops or repoints each `causes[].chain` that named it, and the update summary in `meta.history` lists each one. A dropped link marks no row stale; the cause text stays.
- **A removed codebase** still named by an element has that element's `codebase` cleared or repointed by the update, listed in the summary.
- **An added or changed link marks nothing stale.** A re-rated provider marks no consumer stale either. The lint of §6 and the reviewer rules of §11 catch a disagreement after the fact, and the update summary lists every consumer cause whose linked chain had its failure mode rewritten or its O re-rated in that update, so the consumer's analyst sees it.
- **Codebases** added or removed are listed in the update summary and mark nothing stale.
- The carry-forward rule in `scales-software.md` changes one phrase: `element-changed` re-reads S and O from the rewritten end effect and the changed edge fields.

## 11. Scales and catalog

- **Strength for the scales rule (M8).** On a chain whose element is X, the loss-of-access class is excluded only when every inbound edge to X or to an ancestor of X is weak; one strong consumer makes loss of access credible, which matches the rule that S is the worst credible end effect. An element with no inbound edge is not under the rule. The provider's row carries the strongest consumer's reading of the dependency rows' next-level text; each consumer's own effect lives on its linked chain. A reviewer rule, not a lint.
- **The linked pair.** Three reviewer rules, in `quality-and-lint.md`. On a linked pair, the provider's `effects.next_level` states the consumer chain's failure mode, one of them when several consumers link in, and the two `effects.end` describe the same end effect or the consumer's worse one. A consumer's O rationale for a linked cause cites the provider's O and its evidence. Where a consumer chain has more than one cause, the reviewer checks that the provider's S is not below the consumer's S for the part of the effect the provider's failure accounts for, which is the check the machine lint of §6 makes only in the single-cause case.
- **Catalog placement.** The dependency rows apply to any element that is the `to` of an edge, on top of its role's rows. The sentence that names "any element outside the analysis boundary, or any in-scope element that carries a dependency block" is replaced by that one; the two sets are the same, because an outside element has an inbound edge by invariant.
- **Nothing else moves.** Anchors, the priority table and the scales version are untouched; this change bumps no scales version.

## 12. Report

**Header.** After the boundary, a "Codebases" list, one line per entry: name, repository, and path when present. Printed only when `meta.codebases[]` is present.

**Structure.** The section opens with a table, "By top-level element": one row per depth-1 element, columns for the element's name, its effective codebase's name or "none", its chain count, the number of its chains at the top priority value (the first value of the loaded vocabulary, which heads the column), the number of its chains carrying a provisional rating (counted as the existing provisional count is, `post_ratings` included), and its open actions. Every count rolls up the element's whole subtree. Rows are ordered by the best priority rank among the subtree's chains, using the vocabulary rank that places an out-of-vocabulary value last, then by id; roots with no chains come after, by id. The tree follows, and each element line names its effective codebase when the document has codebases, placed outside the no-wrap role and boundary spans. Under the tree, a second table, "Dependencies": consumer, provider, strength, SLA, limits, one row per edge in document order, with elements named by id as the chain index names them; with no edges it prints "No dependencies." as the tree prints "No elements.". The element facts lose their dependency line, since the table carries it. No per-codebase table: the codebase column answers the common case where a root is one codebase, and §17 lists the table as later work.

**Chain index.** Unchanged: one table sorted by priority then severity, with its element column, the report's stand-in for the critical items list.

**Row sections.** Grouped under one heading per top-level element, in the order of the first table, with the rows inside a section in index order; a root with no chains gets no section. The group heading is an `h3` with id `group-<root id>`, which cannot collide with a section id because of its prefix; the row headers move from `h3` to `h4`, and the template's header, narrow-width and print rules for row headings move with them. The `<article class="row" id="row-<chain id>">` markup is unchanged, because the comparison tool, the print check and tracker items all read it, and the index links into the rows as before. In a row, a cause that carries a link prints its text, then "the failure mode of" and a link whose text is the provider's chain id and failure mode, to that row. A row that other chains link into prints a "Propagates to" line after its effects, naming each consumer chain once by id with its element, derived by inversion and in index order. The next-level effect stays prose.

**Unchanged.** The summary strip's shape, the needs-attention block, the actions section and the lints section; the new lints appear in the lints section like any other.

**Report model.** `ReportModel` gains `codebases` (id, name, repo, path), `roots` (per depth-1 element: id, name, effective codebase name or null, chain count, top count and value, provisional count, open actions), `edges` (the five fields), and `sections` (root id and its rows in order; the word "sections" is used for them throughout, since `groups` already means the check groups). `RowModel` gains `causeLinks` (cause index, chain id, failure mode) and `propagatesTo` (chain id, element id). The renderer escapes and emits, as now.

**Layout and the browser tools.** Each new table goes through the renderer's frame helper with a label no other frame uses and through its caption helper with a unique id, so a table wider than the page scrolls inside its frame and the gate checks it there. The comparison and screenshot tools photograph every section but the chains, the key, the index frame and each row article on its own, so a group heading sits in no part today; the change adds a part per group, `group-<root id>`, to the part locator, the part list, the screenshot capture and their tests, so the main visual change of this design is photographed. The tools suite therefore changes in shape, and §15 says so.

## 13. SKILL.md and the references

A wholly new sentence is `skill-authored`. A sentence that changes keeps the record it cites, and where a sourced sentence about the system's dependencies gains a per-edge reading, that reading is a separate sentence tagged `[adapted-from:C014] [skill-authored]`, which the register permits for that source.

**SKILL.md.**
- The frontmatter's "inside the analysed system or beyond it" becomes "inside the boundary or beyond it".
- Step 1: list every codebase the run covers or reads in `meta.codebases[]`, each with its repository; `meta.boundary.included` describes what inside them is covered.
- Step 2: set `codebase` on each in-scope root, and on a child only where it lives in another codebase; write every dependency the inputs classify as an edge in `dependencies[]`, from the consumer to the provider; an element outside the boundary needs at least one consumer.
- Step 4: when a cause is a failure mode another chain already describes, link it with `chain` and state it in the consumer's terms; on a linked pair, the provider's next-level effect states the consumer chain's failure mode.
- Step 5: rate the provider on the worst end effect its mode reaches through any consumer; a consumer's own amplification or another cause may rate the consumer higher, and a provider whose failure is a consumer's only cause is never rated below that consumer.
- The conversion paragraph: the edge of §9 in place of "takes `dependency.strength: strong`".
- Update mode: the rules of §10 in place of the sentence naming `dependency` among the fields that count.
- The v1 migration paragraph: the block is carried into the v2 migration's edge, and a v1 document runs both migrations in one update.
- A "Migrate a v2 document" section after the v1 one, pointing at `structure-elements.md`.
- The scripts paragraph names `DEPENDENCY_LEGACY`.

**References.**
- `structure-elements.md`: a Dependencies section replaces the sentences that place strength in the block (the sentence "Strength stays in the dependency block" and the one after it); the boundary consequence table reads "at least one inbound edge is required" and "the element may be the `to` of an edge" where it names the block; the conversion sentence carries §9; the v1 migration row carries the block into the edge; the sentence on a dependency-row warning "giving the element a dependency block" reads "giving the element a consumer"; the update sentence that lists `dependency` among the fields that count reads the edge rule of §10; "Runs over several codebases" is rewritten around `meta.codebases[]`; a "Migrating a v2 document" section carries §8. The generated vocabulary region is untouched.
- `design-inputs.md`: items 3 and 4 and the two strength sentences keep their `[paraphrased:C014]` wording about the system's dependencies, and a separate sentence places strength, SLA and limits on the edge from the consumer, tagged `[adapted-from:C014] [skill-authored]`; "must carry `dependency`" becomes "is the provider of at least one edge". A new checklist item, "Codebases", `skill-authored`: the repositories the run covers or reads, each with its owner and name and the folder inside a monorepo, and where to look (the service catalog, the repository hosting), so the skill has something to ask for when the inputs omit them.
- `scales-software.md`: the strength rule of §11 in place of the weak-dependency sentence, and the carry-forward phrase of §10.
- `design-failure-catalog.md`: the placement line of §11; the dependency rows' own text is unchanged.
- `quality-and-lint.md`: the machine lint sentence (fourteen), the validator-id sentence, the ten new validator rows, the three new lint rows, the reworded dependency-row row, and the reviewer rows of §11.
- `methodology.md`: the transfer-status table gains a row, "Failure chains linked across levels", status `new`, because that status is defined as a rule the skill takes from no record in the corpus and every `adapted` row cites one. Text: a cause may name the chain whose failure mode it is `[skill-authored]`; the linkage is the skill's own, since no record in the corpus defines a next-higher, focus and next-lower level structure `[skill-authored]`. The word "classical" stays out of the shipped text. The implementer may add MIL-STD-1629A's ordered indenture levels as a parallel with `[cites:C131]` after reading that record; the review of 2026-10-08 read it as covering the ordered levels and not the mode-to-cause linkage, and the register permits a cite on it.
- `provenance.md`, `work-tracking.md`, `method-selection.md`, `process-stub.md`: unchanged.

## 14. Docs and version

- The plugin version becomes the next minor version after the one `main` carries when this lands, in `.claude-plugin/plugin.json` and `scripts/lib/version.ts`; the existing test asserts only that the two agree. The unmerged `item-body` branch already carries 0.5.0, so this change may be 0.6.0.
- README: the version is named on the status line and in the limitations section, both updated; the status section notes the format change in one line; the "What you get" list names the dependencies table and the grouping by top-level element; the "Not in this version" sentence that says "with a dependency block" reads "that is the provider of an edge".
- `docs/scripts.md`: the compatibility section gains a paragraph: this version changes the schema to v3, dependencies are edges in a top-level list, a cause may link to another chain, `validate.ts`, `render.ts` and `track.ts` refuse an analysis written against 0.3.x to 0.5.x with one `DEPENDENCY_LEGACY` line naming the migration, an analysis written against 0.2.x is refused with `KIND_LEGACY` and runs both migrations in one update, and an earlier version refuses a v3 analysis with schema lines, because its top level rejects the new part.
- `docs/tracking.md`: unchanged.
- The Pages workflow republishes the example report from the checkout fixture on every push to `main`, so the published example shows the new fixture once this lands; nothing in the workflow changes.
- The main design, `2026-09-07-fmea-software-design.md`: dated amendment notes in §5 (update mode) and §6 (data model) pointing here, in the form the element-kinds amendments use.
- This design lives in this repository, under `docs/specs/`, because it cites no record.

## 15. Tests

Both runners pass before every commit, as `CLAUDE.md` requires, and the browser gate and the comparison run before the commit that changes the template or the renderer. Every in-test document builder gains `dependencies: []`, or the gate refuses what it builds.

- `schema.test.ts`: the five-part top level, `dependencies` required, an element with a `dependency` key refused, `meta.codebases[]` with its `repo` pattern and `minItems`, `elements[].codebase` and `causes[].chain` accepted.
- `invariants.test.ts`: one case per invariant of §5, including a two-chain cycle, two disjoint cycles reported once each, a chain leading into a cycle but not on it, which is not reported, and the new message of `element-dependency-required`.
- `lints.test.ts`: one case per lint of §6; `cause-chain-severity` ignoring `post_ratings` and silent on a two-cause consumer; `cause-chain-unlinked` accepting a same-element link and an ancestor-to-ancestor edge; both arms of `repo-ref-codebase` and its silence without the list; the reworded dependency-row lint; one finding per ref and per pair.
- A legacy test, in the pattern of the existing legacy triggers: each of the two traits with its pointer and their order, the non-analysis fall-through to schema lines, a v1 document still refused with `KIND_LEGACY`, a v3 document passing, and all three scripts refusing; `codes.test.ts` maps `DEPENDENCY_LEGACY` to the validation exit status.
- `report-model.test.ts`: root counts rolling up subtrees, root order with ties by id and an out-of-vocabulary value, a root with no chains, section order, a child's codebase overriding its parent's, an outside child not inheriting, cause links, inverted links with several consumers and a consumer linking twice.
- `render.test.ts`: the header list and its absence without codebases, the two tables with unique frame labels and caption ids, the empty dependencies text, the grouped sections with their heading ids and the unchanged row anchors, the cause link and the "Propagates to" line, each escaped; the removed element-facts assertions.
- `validate.test.ts`: the checkout fixture validates with `ok: true`, with no finding beyond its existing blocker and warnings, and the pinned values it asserts (the lint count and the quality score) updated for the added chain.
- The version test: `plugin.json` and `version.ts` agree.
- The tools suite: `skill-copy.test.ts` runs on the updated fixture, whose tracker project matches the codebase repository; the comparison and capture tests gain the group part.

**Fixtures.** All four analysis fixtures move to v3. `checkout-service.fmea.json` gains two codebases, `checkout` (`acme/checkout`) and a session authentication library (`acme/session-auth`), with the session component's `codebase` overriding its parent's; the two edges, checkout to its gateway (strong) and checkout to pricing (weak); and one new chain, appended last so the existing `/chains/6` pointers hold, on checkout's function, with the single cause "the authorization call exceeds its timeout budget and returns no decision" linked to the gateway's timeout chain, and S at or below that chain's 9, so the pair is a textbook one and `cause-chain-severity` is clean. The fixture keeps its deliberate blocker at `/chains/6/ratings/D`. The new chain moves the pinned facts: nine chains, the lint count up by the new chain's provisional-rating warnings, the quality score from 88 to 89, and the stored `computed` block regenerated; the tests that pin them change with it. The update fixtures keep their stale outcomes: the "weak from this release" change is now an edge change on the gateway, and `expected-stale.json` is unchanged. The legacy sheet's expected fixture carries the edge of §9 and its assumption.

**Browser checks.** The gate passes at every width and in print. The comparison against `main` shows changes in the header, the summary strip, the structure section, the index, the row sections, the new group parts and the lints section, and nothing else; every changed view is looked at, and the pull request body lists each changed part with a one-line verdict.

## 16. Evals

- `evals/fixtures/checkout-inputs.md` gains a "Codebases" section naming the two repositories and which elements live in each. Prompt 5 reads the same file and is not re-run; the results note says so and why: its criteria do not touch codebases or edges. `update/after-architecture.md` keeps its dependencies section, and its sentence on the price cache is reworded so that only checkout calls pricing on a miss, because a read-through edge from the cache to pricing would mark the pricing row stale under §10 and fail the row-untouched criterion.
- `evals/rubric.md` becomes rubric 3. c13 is unchanged, since it applies to prompts 1 and 6 and widening it would re-score the element-kinds results. A new criterion, c14, on prompts 1 and 6: every dependency the inputs state is an edge with the stated ends and strength, every codebase the inputs name is in `meta.codebases[]` with each in-scope root naming one, with an expected-edges table per prompt as c13 has for typing; for prompt 6 the expected edge is the declared default of §9. c1 is reworded from "every element carrying a dependency block" to "every element that is the provider of an edge", and a gap written into an edge's `limits` scores 0 as before. No linking clause on prompt 7: its document holds no cause that restates another chain's failure mode, and planting one would collide with the row-untouched criterion. The code sites: the criteria list in `tools/eval-report.ts`, the rubric constant in `tools/workflows/evals.js`, and the applicability, maximum and pass-rule paragraphs of the rubric.
- `tools/eval-stability.ts` is unchanged; edges are not part of the stability check.
- Prompts 1, 6 and 7 run twice at high under rubric 3, through the existing workflow. Results go to `docs/specs/2026-10-08-multi-codebase-eval-results.md`, generated by `tools/eval-report.ts` as the element-kinds results were.
- One migration check, because the v2 migration is the change every existing user meets and no prompt starts from a v2 document: a v2 copy of `update/before.fmea.json` is migrated once through the update mode in a session, its result validated, and the outcome recorded in the results note.

## 17. Later work, not in this design

- A commit per codebase on the record, and an update that re-collects one codebase and diffs only its elements.
- A tracker target per codebase or team, so each team's actions land in its own repository or project.
- A `dependency-changed` stale reason.
- A per-codebase table in the report.
- A stricter inbound-edge invariant, requiring an in-scope consumer or a path of edges from one.
- Typed edges beyond strength: synchronous or asynchronous, the protocol, the interface element the edge runs through.
- A provider-side link on the effect, or a two-sided link kept in step.

## 18. Build

Implementation follows the user's tiering rule: mechanical implementation, drafting and critique on Opus or Sonnet subagents; one Fable judge per phase and a final Fable acceptance; never a Fable fan-out per item. The implementation plan says which tier each phase uses, and the report of the run says how many Fable agents ran. No commit or pull request carries AI attribution, and commits stay local.

## 19. Acceptance

1. `node tools/run-tests.ts` and `node tools/check.ts` exit 0.
2. `node tools/check-browser.ts` exits 0, and the `node tools/compare.ts` summary lists changes only in the parts §15 names; the pull request body lists each changed part with a one-line verdict.
3. The checkout fixture validates with `ok: true` and no finding beyond its existing blocker and warnings, renders, and its report shows the codebases list, the two tables, the grouped row sections, the linked cause and its "Propagates to" line.
4. A v2 document, built by the test from the v3 checkout fixture by moving each edge back into a block on its provider and removing `dependencies`, is refused by `validate.ts`, `render.ts` and `track.ts plan` with one `DEPENDENCY_LEGACY` line each.
5. The references carry no untagged sentence and no new record, every sentence named in §13 is changed, and `tools/public-audit.ts` in failwise-research is run on the branch before the pull request is opened, with its output recorded in the pull request body.
6. Prompts 1, 6 and 7 pass at high under rubric 3, or the results note records what failed and why, and the user rules on it at the acceptance gate; the results note also records the migration check of §16.
7. README, `docs/scripts.md`, the rubric and its code sites, and the main design carry the changes of §14 and §16.

## 20. Review record

On 2026-10-08 three reviewers on Opus read the first version of this spec, one lens each: the data model and the validator; FMEA method and provenance; the report, the skill workflow, the docs, the tests and the evals. They returned 44 findings, of which the session confirmed the consequential ones against the code before applying them. No Fable subagent ran; the session judged.

Applied, the ones that changed a ruling: the strength rule (M8), which was undefined with two linking consumers and absent through containment; the severity lint's scope (M9), which would have fired on the fixture's retry-amplification row, whose severity is the consumer's own. Applied, the rest: the cycle check defined over components; the gate's shape guard, pointers and hybrid case; the path from a v1 document through both migrations in one update; unattended outcomes for every migration and conversion branch; codebase inheritance stopped at the boundary; the fixture's deliberate blocker acknowledged and the pinned numbers listed; the comparison's missing group part; a new rubric criterion instead of a widened one; the dependency-block sentences the first draft missed in SKILL.md, the references and the README; the methodology row's status; the record-keeping tags on changed sentences; the next-level and occurrence idioms as reviewer rules; the version clash with an unmerged branch; and the open details of the report markup, the lints' duplicates and order, and the tests.

Not applied, with the reason: a stricter inbound-edge invariant requiring an in-scope consumer, because an outside service behind an owned-outside service is a real shape, listed in §17; marking the descendants of the provider stale on an edge change, because the v2 rule marked the exact element and the asymmetry is stated; linking an existing fixture cause instead of adding a chain, because no existing cause is another chain's failure mode and a textbook pair is worth the moved pins; planting a restating cause in the update fixture for a prompt-7 clause, because it would collide with the row-untouched criterion.
