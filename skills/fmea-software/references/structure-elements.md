# Structure elements

This file is loaded at step 2, when the system is decomposed into elements. [skill-authored]
Each element answers three questions, in this order: its boundary, its role and its security relevance. [skill-authored]

## The three questions

1. **Boundary:** does this analysis cover the element, does the organisation own it outside this analysis, or is it outside the organisation's control? [skill-authored] The answer is the element's `boundary`, one of `in_scope`, `owned_outside` and `third_party`. [skill-authored]
2. **Role:** what kind of element is it? [skill-authored] The answer is the element's `kind`, one of `service`, `datastore`, `event_stream`, `interface` and `component`, taken from the first role test it passes. [skill-authored]
3. **Security relevance:** does a required security property depend on the element working correctly? [paraphrased:C157] The answer is the element's `security_relevant`, true or false. [skill-authored]

The three answers are independent of one another: the role says which catalog rows apply, the boundary whether the element must be the provider of an edge, and the flag whether the security rows apply as well. [skill-authored] The dependency rows apply on top of the role's rows to any element that is the provider of an edge, whatever its boundary: an element outside the boundary is always the provider of at least one edge, and an in-scope element gets the rows once another element depends on it. [skill-authored]
The tests that decide each answer are in the definitions below, and the sections after them say what each answer brings. [skill-authored]

## Definitions

The region between the two markers below is generated from `data/element-vocabulary-v1.json` by `tools/gen-element-vocabulary.ts` and is never edited by hand. [skill-authored]

<!-- vocabulary:start -->

### Role

| Role | Test | Basis | Provenance |
|---|---|---|---|
| Service (`service`) | Deployed, started and stopped as a unit, with a runtime of its own; it answers requests or does work on its own schedule | The application container of the C4 model (C153) and the process of the data flow diagram in Microsoft's SDL threat-modeling article (C147); the service-dynamics rows are written about these. | [paraphrased:C153] [cites:C147] [skill-authored] |
| Datastore (`datastore`) | Holds state at rest that other elements read or write; does nothing on its own | The data-store container of the C4 model (C153) and the data store in Microsoft's SDL threat-modeling article (C147); the data items of the NASA Software Safety Guidebook (C137) are a basis for per-kind data fault types. | [paraphrased:C153] [cites:C147] [cites:C137] [skill-authored] |
| Event stream (`event_stream`) | Decouples producers from consumers in time: one queue, topic or log, never the broker | Queues and topics as containers in the C4 model (C154); the software events of the NASA Software Safety Guidebook (C138) are a basis for per-kind event fault types. | [paraphrased:C154] [cites:C138] [skill-authored] |
| Interface (`interface`) | A contract between two elements that is analysed in its own right: its schema, versions, limits and error contract | The interface failure class of the NASA Software Safety Guidebook (C136) and the TSF interfaces of Common Criteria (C158). | [cites:C136] [cites:C158] [skill-authored] |
| Component (`component`) | Everything else: code that ships inside another element's deployable and has no runtime of its own, including a library, a module, a handler, a job function, an ML model | The component of the C4 model (C153); the CSCIs, units, objects and instances a software FMEA inventories by design phase in the NASA Software Engineering Handbook (C135) are a basis for this role. | [paraphrased:C153] [cites:C135] [skill-authored] |

### Boundary

| Boundary | Criterion | Basis | Provenance |
|---|---|---|---|
| In scope (`in_scope`) | This analysis covers it: its sources are the repository, documents, incidents or people of the system this analysis covers | The line between in scope and outside it rests on the scope of the analysed workload in the Azure Well-Architected Framework (C143) and in the AWS Well-Architected reliability pillar (C146), on the external systems the analysed system needs in MIL-STD-1629A (C134), and on the interactors outside the scope in Microsoft's SDL threat-modeling article (C149). | [cites:C143] [cites:C146] [cites:C134] [cites:C149] [skill-authored] |
| Owned outside (`owned_outside`) | The organisation can change it, but this analysis does not cover it: another team's service, the deploy pipeline when not analysed, a shared library owned elsewhere | The split of the outside into owned outside and third party is the skill's own: no source draws it. | [skill-authored] |
| Third party (`third_party`) | Outside the organisation's control | The split of the outside into owned outside and third party is the skill's own: no source draws it. | [skill-authored] |

### Security relevance

| Flag | Test | Basis | Provenance |
|---|---|---|---|
| Security-relevant | If this element misbehaves, can someone see or do what the system must prevent? | The security-relevant components of NIST SP 800-53 Rev. 5 (C157), the TOE security functionality of Common Criteria (C158), and the isolation of security functions in NIST SP 800-53 Rev. 5 (C156), the reason the class is worth marking; the list of properties, authentication, authorisation, confidentiality or integrity, is the skill's own. | [paraphrased:C157] [cites:C158] [cites:C156] [skill-authored] |

### Tie-breaks

- A cache is a `datastore`. A broker is a `service`; its topics are `event_stream`s. [skill-authored]
- A third-party API: the provider is a `service` with `boundary: third_party`; its contract becomes an `interface` element only when the contract itself is analysed. [skill-authored]
- A platform you cannot decompose (a serverless platform, a cloud region) takes `service`; what it exposes and you depend on, such as a cache API, can be its own element with the fitting role. [skill-authored]
- Code that runs on the user's device but ships inside another element's deployable, such as a browser app served by its worker, is a `component` of that element. [skill-authored]
- A managed database or queue is `datastore` or `event_stream` with `boundary: third_party`. [skill-authored]
- An ML or LLM model is a `component` when it runs inside a service and a `service` when it is served separately. [skill-authored]
- Code that reads or writes a cache is a component of its element; the cache itself is the datastore. [skill-authored]
- A parent is judged on its own behaviour: a security flag propagates neither up to a parent nor down to a child. [skill-authored]
- An element outside the scope takes the security test like any other; a third-party identity provider, or a platform that holds the system's secrets, is security-relevant. [skill-authored]
- An item named as an API, endpoint or contract, with no deployable of its own named, is an interface. [skill-authored]

<!-- vocabulary:end -->

## Boundary

| Boundary | Consequence | Provenance |
|---|---|---|
| `in_scope` | Catalog rows by role; the element may be the `to` of an edge when other elements depend on it, and is then an internal dependency | [skill-authored] |
| `owned_outside` | An external dependency: at least one inbound edge is required, and the dependency rows apply on top of the role's rows | [skill-authored] |
| `third_party` | As `owned_outside` | [skill-authored] |

Every element gets functions and chains whatever its boundary: the dependency rows are written against an element's functions, so an element outside the scope needs them as much as one inside it. [skill-authored]
The split of the outside into `owned_outside` and `third_party` is the skill's own, since no source draws it. [skill-authored]
A pricing service is `in_scope` in the run that analyses it and `owned_outside` in a run that only calls it, and only in the second is it an external dependency. [skill-authored]

## Dependencies

A dependency is an edge in the top-level `dependencies[]`, from the consumer element in `from` to the provider element in `to`, with its own `strength`, strong or weak, and its `sla` and `limits` as free text in the source's own words, so two consumers can depend on one provider differently. [skill-authored]
A `(from, to)` pair occurs once, and a dependency that is strong for one use and weak for another, such as writes and reads, is one edge at the stronger strength, with the split carried by the chains. [skill-authored]
An edge may cross levels in either direction, so a parent may depend on its child and a child on a sibling or on an element of another root, and two services may depend on each other both ways. [skill-authored]
An element outside the boundary is the `to` of at least one edge and is an external dependency; an `in_scope` element that is the `to` of an edge is an internal dependency; an outside element consumed only by another outside element is allowed. [skill-authored]
Strength moves no rating: it selects the next-level and end readings of `cat-dependency-01`, the one dependency row that gives a reading per strength, read on the provider's row for the strongest edge whose `to` is the provider's element or one of its ancestors, whether or not any cause links the chain, as a default the run checks against the inputs; the other dependency rows have one reading whatever the strength, and the report prints every edge. [skill-authored]
The Azure Well-Architected Framework's failure mode analysis classifies dependencies as strong or weak, and Treynor et al.'s paper "The Calculus of Service Availability" names the critical dependency as a concept. [cites:C014] [cites:C144] [cites:C145]

## Role

The role tests are asked in the order of the Role table, and the first yes wins: an element that passes the `service` test is a `service` even when a later test would also fit it. [skill-authored]
When the tests leave an element between two roles, the tie-breaks in the definitions decide, and each of them is the skill's own. [skill-authored]
A tie-break that names the case settles it before the ordering rule is applied, so an item the tie-breaks name is typed by the tie-break even when an earlier test would also fit it. [skill-authored]
The data items of the NASA Software Safety Guidebook, its software events, and the CSCIs, units, objects and instances the NASA Software Engineering Handbook lists as a software FMEA's inventory by design phase are a basis for the `datastore`, `event_stream` and `component` tests, never their definition. [cites:C137] [cites:C138] [cites:C135]
The fit is loose on purpose: these are a basis, not a match. [skill-authored]

## Security relevance

An element is security-relevant when a required security property depends on it working correctly, the class NIST SP 800-53 Rev. 5 calls security-relevant components and Common Criteria calls the TOE security functionality. [paraphrased:C157] [cites:C158]
The properties the skill counts are authentication, authorisation, confidentiality and integrity, a list that is the skill's own. [skill-authored]
The test is one question: if this element misbehaves, can someone see or do what the system must prevent? [skill-authored]
The class is worth marking because NIST SP 800-53 Rev. 5 asks for security functions to be isolated from the functions that are not, in control SC-3. [paraphrased:C156] [skill-authored]
A security-relevant element gets the security rows in addition to its role's rows. [skill-authored]
The default answer is false; a run that sets the flag true states its reason in `security_rationale`, and it may record one when it sets the flag false. [skill-authored]

## Conversion from a sheet

A type, owner or external column of the sheet that maps to a role or a boundary is used first. [skill-authored]
When the sheet has no such column, each element is typed by the boundary and role tests applied to the sheet's item text, and every typing decision is recorded in the column mapping in `meta.history` as "typed by the converter from the item text". [skill-authored]
`security_relevant` is false unless the sheet or its item text says otherwise. [skill-authored]
When an item gets an edge and the sheet carries no strength for it, the edge's `strength` is `strong` whatever the item's boundary, recorded as a declared substitution: the fail-safe reading assumes the system cannot serve without the element. [skill-authored]
Every outside item, and every in-scope item whose rows carry a strength, an SLA or limits, gets one edge whose `from` is the first in-scope item in sheet order other than itself, with an open assumption owned by `user` that names the edge, the rule that chose its `from`, and whether its strength came from the sheet. [skill-authored]
An in-scope item with no other in-scope item gets no edge, its values going into an open assumption, and a sheet with no in-scope item stops the conversion with the question SKILL.md gives. [skill-authored]
The sheet's `Owner` column is the action owner and never an element owner. [skill-authored]
Each of these defaults is a declared substitution in the column mapping, as the conversion rules already require for ratings. [skill-authored]

## Migrating a v1 document

A document written against the v1 kinds is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
A migration is an update, so it bumps `meta.version`. [skill-authored]
It runs alone, never in the same update as an architecture change, so the stale rules of an architecture change never mix with the mapping. [skill-authored]

| v1 element | After the migration | Provenance |
|---|---|---|
| `kind: external_dependency` | The role by the role tests, `service` when nothing more specific fits; `boundary: third_party`; the `dependency` block carried into the v2 migration's edge; where the element is in fact owned by the organisation, the person is asked and `owned_outside` is set | [skill-authored] |
| `kind: security_component` | The role by the role tests, `component` when nothing more specific fits; `security_relevant: true`; `security_rationale: "migrated from kind security_component; confirm"` | [skill-authored] |
| Every other element | `kind` kept; `boundary: in_scope` and `security_relevant: false`, both confirmed by the person for any element the run cannot read a source for | [skill-authored] |

The default for every other element is applied per element by the person, not blindly: an element whose internals `meta.boundary.excluded` lists is a candidate for `owned_outside`, and the person decides. [skill-authored]
Catalog refs are renamed mechanically, `cat-external_dependency-NN` to `cat-dependency-NN` and `cat-security_component-NN` to `cat-security-NN`, in both places they occur: `chains[].catalog_refs[].id`, and `elements[].sources[].ref` where the source kind is `catalog`. [skill-authored]
Unattended, every question of this migration takes its stated default and is listed in `meta.assumptions[]` as an open assumption with owner `user`. [skill-authored]
Where an element's sources can be read, the migration applies the security test and records the rationale; the default of false, with an open assumption, applies only to an element whose sources cannot be read. [skill-authored]
A migrated `security_component` whose sources can be read takes the rationale the security test gives, and the fixed text 'migrated from kind security_component; confirm' is used only where no source can be read. [skill-authored]
A chain that applies a dependency row to an in-scope element that is the `to` of no edge is left as it is by the migration, and its `dependency-row-without-dependency` warning is for the next update to settle, either by giving the element a consumer or by moving the row to the element depended on. [skill-authored]
Migration marks no row stale: the mapping preserves meaning, and the ratings do not depend on the kind. [skill-authored]
A role or a boundary the person changes afterwards goes through the update mode's ordinary stale rule, under which an element changed when its `kind`, `boundary` or `security_relevant` changed or when an edge whose `to` is the element was added, removed or changed. [skill-authored]
The rows this rule reaches are the set `update-check.ts` computes; the question on an outside element, the question on a codebase the new inputs do not cover, and the re-reads are the person's and the run's. [skill-authored]
While `meta.codebases[]` is present and, for an entry that at least one element has as its effective codebase, the new inputs restate none of those elements, ask before the diff, naming the codebase, its elements, functions and chains and each action on them that carries a `tracker` block, for that codebase's inputs or for confirmation of every removal; remove nothing without it; unattended, write nothing, add no history entry, bump no version, and end with the question naming each such codebase. [skill-authored]
Every other element field does not count: the name, the description and `codebase` are labels, and `sources` and `security_rationale` record why, not what. [skill-authored]
A change of `parent` is a change of `id`, so it is a removed element and a new one, never an `element-changed`. [skill-authored]

## Migrating a v2 document

A document written against schema v2, by 0.3.x to 0.5.x, carries a `dependency` block on an element in place of an edge, and is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
It runs alone, never in the same update as an architecture change, and bumps `meta.version`; when it writes the migrated JSON it ends with `priority.ts --write`, `validate.ts --write` and `render.ts`, and when it writes nothing it runs none of them. [skill-authored]
`update-check.ts` refuses a v2 document as its stored copy, so the migration runs no structural check. [skill-authored]
`dependencies[]` is created when absent and kept when present, and a document with no block and no array gets an empty array. [skill-authored]
Each element's `dependency` block becomes an edge whose `to` is the element and whose `strength`, `sla` and `limits` are the block's, one edge unless a rule below makes several or none, and the block is removed. [skill-authored]
The edge's `from` is the element's nearest `in_scope` ancestor. [skill-authored]
For a provider with no in-scope ancestor, `from` is the one other in-scope root when exactly one exists; when several exist the person is asked and may name one or more consumers, each of which gets an edge, and unattended the first such root in document order is taken and listed in `meta.assumptions[]` as an open assumption owned by `user` that names the other in-scope roots as candidates. [skill-authored]
When no other in-scope root exists, an `in_scope` provider has its block dropped and gets no edge, and the drop is listed as an open assumption owned by `user` that carries the block's strength, SLA and limits. [skill-authored]
An outside provider in that case cannot validate without an edge, so the person is asked to name a consumer, which may be a nested in-scope element; unattended, this is the one question of the migration with no default, and the whole update stops: the file is left as it was, with no edge, no history entry and no version bump, the v1 half of a combined update included, and the final message names each outside provider that has no consumer and asks for one. [skill-authored]
An edge the migration would make whose `(from, to)` is already an edge of the existing array is not added: the existing edge is kept as it is, and where the block's strength, SLA or limits differ from it, the difference is listed in `meta.assumptions[]` as an open assumption owned by `user` that carries the block's values. [skill-authored]
A v1 document runs the v1 migration and then this one in the same update, with every v1 boundary decision, answered or defaulted, settled before any `from` is chosen: one version bump and one history entry naming both. [skill-authored]
Migration marks no row stale: the edge carries what the block carried, and strength moves no rating. [skill-authored]
Every chain on an element whose `dependency` block was `weak` is named, by id, in one open assumption owned by `user`, because the v2 scales barred the loss-of-access class on such a chain and the v3 scales rate the end effect as written; a v2 assumption that recorded the classification doubt stays beside it; where the person finds that class credible, the classification and the effect disagree: an edge whose strength the person corrects in an ordinary update marks the chains on the element stale and re-reads S, and an edge kept weak carries the open assumption on its strength that the scales require, the rating standing as written until an update marks the row stale. [skill-authored]
That assumption is written the same attended and unattended, and none when no block was `weak`; it closes when every chain it names is settled, by nothing moving, by an edge change that re-read it, or by the open assumption on its edge's strength, and an update that settles some of them rewrites it to name the rest. [skill-authored]
The migration adds no codebase and no link; both are later work for the person through an ordinary update, and the final message says so, says that until links exist an edge change marks only the provider's rows stale, and names the chains the weak-block assumption lists or says that no block was `weak`. [skill-authored]
The history entry names each edge made with its `from` and the rule that chose it, each existing edge kept in place of a derived one, and the chains the weak-block assumption lists. [skill-authored]
A role, a boundary, an edge or a link the person changes or adds afterwards goes through the update mode's ordinary rules. [skill-authored]

## Runs over several codebases

A `repo` source ref takes the qualified form `owner/repo@commit:path`, where `commit` is a full 40-hex-digit SHA. [skill-authored]
A run over several codebases uses that form on every `repo` ref, and a single-repository run may keep bare paths. [skill-authored]
The `repo-ref-form` lint checks the refs for consistency alone: once one `repo` ref is qualified, every `repo` ref must be. [skill-authored]
Step 1 lists every codebase the run covers or reads in `meta.codebases[]`, each with its repository in the `owner/repo` form and, for part of a monorepo, its `path`; `meta.boundary.included` describes what inside them is covered, and a codebase whose repository the inputs do not name is an open assumption and not an entry. [skill-authored]
In a run over several services, each service is a depth-1 element with no artificial root above them, because the report groups and counts chains by root; one product spread over several repositories may stay one root whose children name their codebases. [skill-authored] The depth cap of 4 stays. [skill-authored]
An element's effective codebase is its own `codebase` when it sets one; otherwise, when the element and its parent are both `in_scope`, its parent's effective codebase; otherwise none. [skill-authored]
An element outside the boundary neither inherits a codebase nor passes one down, so an in-scope element under an outside parent has an effective codebase only when it sets one, whatever the parent sets. [skill-authored]
