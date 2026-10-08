# fmea-software: runs over several codebases and services (schema v3)

**Date:** 2026-10-08
**Status:** approved in brainstorming; awaiting user review of this written spec
**Amends:** `2026-09-07-fmea-software-design.md` §5 (the update mode) and §6 (the data model), which receive dated amendment notes pointing here when this design is accepted. The decisions of that design stand except where a section below says otherwise.
**Consumer:** the v1 consumer first, one enterprise TypeScript application whose services live in several repositories and together serve one critical flow; the general plugin after it.
**Evidence:** none. Every sentence this design adds under `skills/` is tagged `skill-authored`, and no record enters the register in `references/provenance.md`. The classical practice this design follows, linking the failure of a lower-level item to a cause at the next level up, is named as practice and cited to nothing, because no record in the register covers it.

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

**Why M4 links chains.** The first proposal kept chains independent and put an element reference on the effect, to spare the update mode. The user asked why the design should leave the well-travelled path, and the answer is that it should not. Classical FMEA links levels: the failure mode of a lower-level item is a cause at the next level up, and its next-level effect is that level's failure mode. The link buys three things beyond the idiom. Severity consistency: without a link, the provider's row and the consumer's row each write their own end effect and rate S on it, and across services they will disagree; with a link, a lint flags a provider whose S is below the S of the consumer row it feeds. Occurrence evidence: the consumer's cause is the provider's failure mode, so the provider's O and its evidence are evidence for that cause. And the element reference comes for free. The costs, accepted: two update-mode rules (§10), an acyclicity invariant (§5), and two chains per cross-service failure, which is the work of a multi-service FMEA rather than overhead on it.

**Why the link sits on the cause.** The consumer's analyst knows what they depend on, the cause already exists as a record, and the provider's row shows where its failure propagates by inverting the links. One relation in one place; the provider-side and two-sided variants were considered and set aside.

## 3. What v2 offers and where it stops

Schema v2 (PR #24) added three things for a run over several codebases: `meta.boundary.included` lists each codebase as a prose string; a `repo` source ref may take the qualified form `owner/repo@commit:path`, with the lint `repo-ref-form` checking that once one ref is qualified every ref is; and several systems may sit at depth 1 with no artificial root above them.

What stops there. A codebase is not an entity: nothing ties an element to its repository except a string inside a source ref, so nothing can group, count or check by codebase. A dependency is unary: the block on the provider says how "the analysed system" depends on it, so with two in-scope services the dependency of checkout on pricing has no edge to live on, and strength cannot differ per consumer. Hierarchy is containment and ids are one namespace, so a gateway two services call must nest under one of them or sit at the root. The next-level effect is prose, so a failure that crosses a service boundary is traced by reading.

## 4. Data model

The schema `$id` becomes `urn:fmea-software:schema:fmea:v3`. The authored top-level parts become five: `meta`, `elements`, `functions`, `dependencies`, `chains`, written in that order, with `computed` after them as before.

### 4.1 `meta.codebases[]`

Optional; absent in a run that names no codebase. Set in step 1, beside the boundary. One entry per codebase the run covers or reads:

- `id`: a plain id, unique in the list (invariant `codebase-id-unique`).
- `name`: how the team says it; non-empty.
- `repo`: the repository, non-empty, in the `owner/repo` form the qualified `repo` source ref uses as its head, so the lint of §6 can match the two.
- `path?`: a folder inside the repository, for a codebase that is part of a monorepo.

No commit on the record. The qualified `repo` source ref already pins one per ref, and a record-level pin belongs to the "update one codebase alone" outcome that is set aside (§17).

`meta.boundary.included` stays as it is and describes what inside the codebases is covered; SKILL.md no longer tells the run to list codebases there (§13).

### 4.2 `elements[].codebase?`

A plain id naming an entry of `meta.codebases[]` (invariant `element-codebase-resolves`). Permitted on an element of any boundary. An element without one takes its parent's, recursively, so a run sets it on its roots and overrides it only where a child lives elsewhere, such as a shared library in its own repository. That resolved value is the element's **effective codebase**, which the report and the counts use; a root without one, and its descendants that set none, have no effective codebase.

### 4.3 `dependencies[]`

Required at the top level; an empty array when nothing depends on anything. One entry per edge, authored in step 2 from the dependency classification of the inputs:

- `from`: the consumer, an element id (invariant `dependency-from-resolves`).
- `to`: the provider, an element id (invariant `dependency-to-resolves`), different from `from` (invariant `dependency-self`).
- `strength`: `strong` or `weak`, as the design-inputs checklist classifies a dependency.
- `sla?`, `limits?`: free text in the source's own terms, as before. Nothing computes on them.

A `(from, to)` pair occurs once (invariant `dependency-pair-unique`). An edge may cross levels in either direction, so a parent may depend on its child, as checkout does on its gateway, and a child on a sibling or on an element of another root. Edges are not required to be acyclic: services call each other both ways.

An element whose boundary is `owned_outside` or `third_party` is the `to` of at least one edge; this is today's `element-dependency-required`, reworded. Such an element is an external dependency; an `in_scope` element that is the `to` of an edge is an internal dependency, as before.

### 4.4 `causes[].chain?`

Optional on every cause: a plain id naming another chain in the document, the provider's chain whose failure mode this cause is. The cause's `text` is that failure mode in the consumer's terms. Nothing changes on the provider's chain; the report derives "propagates to" by inverting the links (§12). Invariants: the id resolves (`cause-chain-resolves`), it is not the cause's own chain (`cause-chain-self`), and the link graph over the document is acyclic (`cause-chain-cycle`).

### 4.5 Removed

`elements[].dependency` is removed from the schema and from `types.ts`. Its three fields live on the edge. A v2 document that carries it is refused by the gate of §7.

### 4.6 Types

`types.ts` gains `Codebase { id; name; repo; path? }` and `DependencyEdge { from; to; strength; sla?; limits? }`, gains `codebase?` on `Element` and `chain?` on `Cause`, gains `dependencies: DependencyEdge[]` on `FmeaDocument` and `codebases?: Codebase[]` on `Meta`, and loses `Dependency` and `Element.dependency`.

## 5. Invariants

Violations are errors, reported by `validate.ts` in `errors[]`, as the existing invariants are. The ids join `INVARIANT_RULES` in `invariants.ts` and the validator table of `quality-and-lint.md`.

| Id | Rule | Pointer |
|---|---|---|
| `codebase-id-unique` | No two entries of `meta.codebases[]` share an id. | the second entry's `id` |
| `element-codebase-resolves` | `elements[].codebase` names an entry of `meta.codebases[]`. | the element's `codebase` |
| `dependency-from-resolves` | `dependencies[].from` names an element. | the edge's `from` |
| `dependency-to-resolves` | `dependencies[].to` names an element. | the edge's `to` |
| `dependency-self` | `from` and `to` differ. | the edge's `to` |
| `dependency-pair-unique` | No two edges share `from` and `to`. | the second edge |
| `element-dependency-required` | An element whose boundary is not `in_scope` is the `to` of at least one edge. | the element's `boundary` |
| `cause-chain-resolves` | `causes[].chain` names a chain. | the cause's `chain` |
| `cause-chain-self` | `causes[].chain` is not the chain the cause belongs to. | the cause's `chain` |
| `cause-chain-cycle` | Following `causes[].chain` from any chain never returns to it. Checked by a walk from each chain; reported once per cycle, at the first link in document order that closes it. | that cause's `chain` |

`element-dependency-required` keeps its id and its message changes: "element X has boundary B and no edge depends on it".

## 6. Lints

Warnings, written to `computed.lints[]`, with `none` as their quality-score weight unless the implementation finds a reason to weigh them. The machine lint count in `quality-and-lint.md` goes from eleven to fourteen.

| Id | Rule |
|---|---|
| `repo-ref-codebase` | While `meta.codebases[]` is non-empty: a qualified `repo` source ref whose `owner/repo` head is the `repo` of no entry is flagged; and a qualified `repo` ref on an element that has an effective codebase, whose `repo` is a different repository, is flagged. Unqualified refs are not checked, an element with no effective codebase gets only the first check, and nothing is flagged while the list is empty or absent. |
| `cause-chain-unlinked` | Let C be the element of the cause's chain and P the element of the linked chain, each reached through its function. Not flagged when P's id begins with C's id followed by a dot, or when some edge runs from C or an ancestor of C to P or an ancestor of P. Otherwise flagged at the cause's `chain`: the link crosses neither containment nor a recorded dependency. A warning and not an error, because a team may arrange its hierarchy another way. |
| `cause-chain-severity` | The provider chain's `ratings.S.value` is below the consumer chain's `ratings.S.value`. Flagged at the provider's `ratings/S/value`, naming the consumer chain. Severity flows from the top of the net, so the provider's end effect should be at least as bad as what it feeds. Read from `ratings` only, never from `post_ratings`. |
| `dependency-row-without-dependency` | Reworded: a chain whose function resolves to an element that is the `to` of no edge cites a `cat-dependency-` catalog ref. Same id, same severity. |

`repo-ref-form` is unchanged.

## 7. The legacy gate

A second pre-schema check runs after the v1 check in `legacy.ts`, so a v1 document still gets its `KIND_LEGACY` message first. A document is a v2 document when its top level has no `dependencies` key, or when any element carries a `dependency` key. The gate reports one issue, the first trait in that order (the top level, then elements in document order), with code `DEPENDENCY_LEGACY`, rule `format-legacy`, and a message naming the "Migrate a v2 document" section of SKILL.md. `DEPENDENCY_LEGACY` joins `CODES` with the validation exit status, and `validate.ts`, `render.ts` and `track.ts` refuse the same way because all three call `validateDocument`.

## 8. Migrating a v2 document

Performed by the skill's update mode, recorded in `meta.history`, bumping `meta.version`, and run alone, never in the same update as an architecture change, as the v1 migration is. The rules go in `structure-elements.md` under a heading beside the v1 ones.

- `dependencies[]` is created. Each element's `dependency` block becomes one edge whose `to` is the element and whose `strength`, `sla` and `limits` are the block's; the block is removed. A document with no block gets an empty array.
- The edge's `from` is the element's parent when it has one.
- For a top-level provider, `from` is the one other in-scope top-level element when exactly one exists. When several exist the person is asked; unattended, the first such element in document order is taken and listed in `meta.assumptions[]` as an open assumption owned by `user`. When none exists the migration stops and asks, because an outside element with no consumer cannot validate.
- The migration adds no codebase and no link. Both are later work for the person, through an ordinary update.
- The migration marks no row stale: the meaning is preserved and no rating depends on where strength is written.
- The history entry names the edges made, each with its `from` and the rule that chose it.

A role or boundary the person changes afterwards, an edge they add or change, and a link they add, all go through the ordinary update rules of §10.

## 9. Converting a sheet

The declared default for an item with a boundary other than `in_scope` and no strength in the sheet stays `strong`. Its edge's `from` is the first in-scope item in sheet order, recorded as a declared substitution in the column mapping with an open assumption owned by `user`, as the strength default already is. The rule is deliberately plain: the first in-scope service was considered and set aside because in the legacy fixture it chooses the pricing item and gives it a dependency on the gateway, which the sheet does not say.

## 10. Update mode

Replaces the element-changed sentence of §5 of the main design and of SKILL.md.

- **An element changed** when its `kind`, `boundary` or `security_relevant` changed, or when an edge whose `to` is the element was added, removed, or changed in `strength`, `sla` or `limits`. Name, description, sources, security rationale and codebase are labels and do not count. A change of `parent` is a change of `id`, a removed element and a new one, as before.
- **The rows an edge change marks stale** are the chains on the `to` element, and the chains on the `from` element that link through a cause into a chain on the `to` element. The reason is `element-changed` for both (M7). The ordering rule among reasons is unchanged.
- **A removed chain breaks every link into it.** The update drops or repoints each `causes[].chain` that named it, and the update summary in `meta.history` lists each one. A dropped link marks no row stale; the cause text stays.
- **A re-rated provider marks no consumer stale.** The lint `cause-chain-severity` catches a disagreement after the fact.
- **Codebases** added or removed are listed in the update summary and mark nothing stale.
- The carry-forward rule in `scales-software.md` changes one phrase: `element-changed` re-reads S and O from the rewritten end effect and the changed edge fields.

## 11. Scales and catalog

- **Strength for the scales rule.** The rule that a weak dependency excludes the loss-of-access class reads the edge from the consumer's element to the chain's element, where the consumer is identified by a link from a cause on one of its chains into this chain. Without a link, the inbound edges decide when they agree on strength; when they disagree, the rule asks the analyst to add the link or to record an open assumption and rate from the wrong-result class, the fallback the rule already names. A reviewer rule, not a lint.
- **Catalog placement.** The dependency rows apply to any element that is the `to` of an edge, on top of its role's rows. The sentence that names "any element outside the analysis boundary, or any in-scope element that carries a dependency block" is replaced by that one; the two sets are the same, because an outside element has an inbound edge by invariant.
- **Nothing else moves.** Anchors, the priority table and the scales version are untouched; this change bumps no scales version.

## 12. Report

**Header.** After the boundary, a "Codebases" list, one line per entry: name, repository, and path when present. Printed only when `meta.codebases[]` is non-empty.

**Structure.** The section opens with a table, "By top-level element": one row per depth-1 element, columns for the element's name, its effective codebase or "none", its chain count, the number of its chains at the top priority value (the first value of the loaded vocabulary, which heads the column), the number of its chains carrying a provisional rating, and its open actions. Every count rolls up the element's whole subtree. Rows are ordered by the best priority rank among the root's chains, then by id, with a root that has no chains last; the same order the row-section groups use. The tree follows, and each element line names its effective codebase when the document has codebases. Under the tree, a second table, "Dependencies": consumer, provider, strength, SLA, limits, one row per edge in document order, with elements named by id as the chain index names them. The element facts lose their dependency line, since the table carries it. No per-codebase table: the codebase column answers the common case where a root is one codebase, and §17 lists the table as later work.

**Chain index.** Unchanged: one table sorted by priority then severity, with its element column, the report's stand-in for the critical items list.

**Row sections.** Grouped under one heading per top-level element, in the order of the first table, with the rows inside a group in index order. The index links into the rows as before. In a row, a cause that carries a link prints its text, then "the failure mode of" and a link whose text is the provider's chain id and failure mode, to that row. A row that other chains link into prints a "Propagates to" line after its effects, naming each consumer chain by id with its element, derived by inversion and in index order. The next-level effect stays prose.

**Unchanged.** The summary strip, the needs-attention block, the actions section and the lints section; the new lints appear in the lints section like any other.

**Report model.** `ReportModel` gains `codebases` (id, name, repo, path), `roots` (per depth-1 element: id, name, effective codebase or null, chain count, top count and value, provisional count, open actions), `edges` (the five fields), and `sections` (root id and its rows in order). `RowModel` gains `causeLinks` (cause index, chain id, failure mode) and `propagatesTo` (chain id, element id). The renderer escapes and emits, as now.

**Layout.** The two tables are framed, so a table wider than the page scrolls inside its frame, and the browser gate checks them there. The grouped row sections keep their anchors, `#row-<chain id>`, so `record_url` links from tracker items still resolve.

## 13. SKILL.md and the references

Every added or changed sentence is `skill-authored`.

**SKILL.md.**
- Step 1: list every codebase the run covers or reads in `meta.codebases[]`, each with its repository; `meta.boundary.included` describes what inside them is covered.
- Step 2: set `codebase` on each root, and on a child only where it lives in another codebase; write every dependency the inputs classify as an edge in `dependencies[]`, from the consumer to the provider; an element outside the boundary needs at least one consumer.
- Step 4: when a cause is a failure mode another chain already describes, link it with `chain` and write the cause in that chain's terms; a provider's S is never below the S of a consumer row it feeds.
- Update mode: the rules of §10.
- A "Migrate a v2 document" section after the v1 one, pointing at `structure-elements.md`.
- The scripts paragraph names `DEPENDENCY_LEGACY`.

**References.**
- `structure-elements.md`: a Dependencies section replaces the sentences that place strength in the block; the boundary consequence table reads "at least one inbound edge is required" where it read "the dependency block is required"; "Runs over several codebases" is rewritten around `meta.codebases[]`; a "Migrating a v2 document" section carries §8. The generated vocabulary region is untouched.
- `design-inputs.md`: items 3 and 4 and the paragraph on where strength lands move from the element to the edge; "must carry `dependency`" becomes "is the provider of at least one edge".
- `scales-software.md`: the strength rule of §11 and the carry-forward phrase of §10.
- `design-failure-catalog.md`: the placement line of §11; the dependency rows' own text is unchanged.
- `quality-and-lint.md`: the machine lint sentence (fourteen), the three new lint rows, the reworded dependency-row row, the new validator rows, and a reviewer row for the strength rule.
- `methodology.md`: the transfer-status table gains a row, "Failure chains linked across levels", status `adapted`, text `skill-authored`: a cause may name the chain whose failure mode it is, the classical linkage of levels carried as an optional reference. The spec writer checked the register on 2026-10-08 and found no record covering multi-level linkage; the implementer adds none.
- `provenance.md`, `work-tracking.md`, `method-selection.md`, `process-stub.md`: unchanged.

## 14. Docs and version

- The plugin version becomes 0.5.0 in `.claude-plugin/plugin.json` and `scripts/lib/version.ts`.
- README: the status section notes the format change in one line; the "What you get" list names the dependencies table and the grouping by top-level element.
- `docs/scripts.md`: the compatibility section gains a paragraph: 0.5.0 changes the schema to v3, dependencies are edges in a top-level list, a cause may link to another chain, and `validate.ts`, `render.ts` and `track.ts` refuse an analysis written against 0.3.x or 0.4.x with one `DEPENDENCY_LEGACY` line naming the migration.
- `docs/tracking.md`: unchanged.
- The main design, `2026-09-07-fmea-software-design.md`: dated amendment notes in §5 (update mode) and §6 (data model) pointing here, in the form the element-kinds amendments use.
- This design lives in this repository, under `docs/specs/`, because it cites no record.

## 15. Tests

Both runners pass before every commit, as `CLAUDE.md` requires, and the browser gate and the comparison run before the commit that changes the template or the renderer.

- `schema.test.ts`: the five-part top level, `dependencies` required, an element with a `dependency` key refused, `meta.codebases[]` and `elements[].codebase` accepted, `causes[].chain` accepted.
- `invariants.test.ts`: one case per invariant of §5, including a two-chain cycle and a three-chain cycle reported once.
- `lints.test.ts`: one case per lint of §6, the reworded dependency-row lint, and the empty-list silence of `repo-ref-codebase`.
- A legacy test: a v2 document is refused with one `DEPENDENCY_LEGACY` issue; a v1 document still gets `KIND_LEGACY`; a v3 document passes the gate.
- `report-model.test.ts`: root counts roll up subtrees, root order, section order, cause links, inverted links, effective codebase through inheritance.
- `render.test.ts`: the header list, the two tables, the grouped sections with their anchors, the cause link and the "Propagates to" line, each escaped.
- `validate.test.ts`: the checkout fixture validates with no blocker, and none of the three new lints fires on it.
- The version test: `plugin.json` and `version.ts` agree at 0.5.0.
- The tools suite is unchanged in shape; `skill-copy.test.ts` runs on the updated fixture.

**Fixtures.** All four analysis fixtures move to v3. `checkout-service.fmea.json` gains two codebases, `checkout` (`acme/checkout`) and a session authentication library (`acme/session-auth`), with the session component's `codebase` overriding its parent's; the two edges, checkout to its gateway (strong) and checkout to pricing (weak); and at least one linked cause, for which the implementer may add one chain on checkout whose cause is the gateway's timeout chain. The lint `cause-chain-severity` is clean on the fixture. The update fixtures keep their stale outcomes: the "weak from this release" change is now an edge change on the gateway, and `expected-stale.json` is unchanged. The legacy sheet's expected fixture carries the edge of §9 and its assumption.

**Browser checks.** The gate passes at every width and in print. The comparison against `main` shows changes in the header, the structure section and the row sections, and nothing else; every changed view is looked at before the change is called done.

## 16. Evals

- `evals/fixtures/checkout-inputs.md` gains a "Codebases" section naming the two repositories and which elements live in each. `update/after-architecture.md` keeps its dependencies section, which already states edges with strengths.
- `evals/rubric.md` becomes rubric 3: the element-typing criterion gains a clause that every dependency the inputs state is an edge with the stated ends and strength, and that every codebase the inputs name is in `meta.codebases[]` with each in-scope root naming one. On prompt 7, whose document already holds two in-scope services, a further clause: a cause that restates another chain's failure mode links it.
- `tools/eval-stability.ts` is unchanged; edges are not part of the stability check.
- Prompts 1, 6 and 7 run twice at high under rubric 3, through the existing workflow. Results go to `docs/specs/2026-10-08-multi-codebase-eval-results.md`, generated by `tools/eval-report.ts` as the element-kinds results were.

## 17. Later work, not in this design

- A commit per codebase on the record, and an update that re-collects one codebase and diffs only its elements.
- A tracker target per codebase or team, so each team's actions land in its own repository or project.
- A `dependency-changed` stale reason.
- A per-codebase table in the report.
- Typed edges beyond strength: synchronous or asynchronous, the protocol, the interface element the edge runs through.
- A provider-side link on the effect, or a two-sided link kept in step.

## 18. Build

Implementation follows the user's tiering rule: mechanical implementation, drafting and critique on Opus or Sonnet subagents; one Fable judge per phase and a final Fable acceptance; never a Fable fan-out per item. The implementation plan says which tier each phase uses, and the report of the run says how many Fable agents ran. No commit or pull request carries AI attribution, and commits stay local.

## 19. Acceptance

1. `node tools/run-tests.ts` and `node tools/check.ts` exit 0.
2. `node tools/check-browser.ts` exits 0 and the `node tools/compare.ts` summary lists changes only in the header, the structure section and the row sections, each one looked at.
3. The checkout fixture validates with no blocker, renders, and its report shows the codebases list, the two tables, the grouped row sections, one linked cause and one "Propagates to" line.
4. A v2 document, built by the test from the v3 checkout fixture by moving each edge back into a block on its provider and removing `dependencies`, is refused by `validate.ts`, `render.ts` and `track.ts plan` with one `DEPENDENCY_LEGACY` line each.
5. The references carry no untagged sentence and no new record; the restricted-wording audit in failwise-research passes before anything is pushed.
6. Prompts 1, 6 and 7 pass at high under rubric 3, or the results note records what failed and why, and the user rules on it at the acceptance gate.
7. README, `docs/scripts.md` and the main design carry the changes of §14.
