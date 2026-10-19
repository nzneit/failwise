# Structure elements

This file is loaded at step 2, when the system is decomposed into elements. [skill-authored]
Each element answers three questions, in this order: its boundary, its role and its security relevance. [skill-authored]

## The three questions

1. **Boundary:** does this analysis cover the element? [skill-authored] Does the organisation own it outside this analysis? [skill-authored] Or is it outside the organisation's control? [skill-authored] The answer is the element's `boundary`, one of `in_scope`, `owned_outside` and `third_party`. [skill-authored]
2. **Role:** what kind of element is it? [skill-authored] The answer is the element's `kind`, one of `service`, `datastore`, `event_stream`, `interface` and `component`. [skill-authored] The first role test the element passes gives the answer. [skill-authored]
3. **Security relevance:** does a required security property depend on the element working correctly? [paraphrased:C157] The answer is the element's `security_relevant`, true or false. [skill-authored]

- The three answers are independent of one another. [skill-authored]
- The role says which catalog rows apply. [skill-authored]
- The boundary says whether the element must be the provider of an edge. [skill-authored]
- The flag says whether the security rows apply as well. [skill-authored]
- The dependency rows apply on top of the role's rows to any provider of an edge, whatever its boundary. [skill-authored]
- An element outside the boundary is always the provider of at least one edge. [skill-authored]
- An in-scope element gets the dependency rows once another element depends on it. [skill-authored]
- The tests that decide each answer are in the definitions below, and the sections after them say what each answer brings. [skill-authored]

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

- A dependency is an edge in the top-level `dependencies[]`, from the consumer element in `from` to the provider element in `to`. [skill-authored]
- Each edge has its own `strength`, strong or weak. [skill-authored]
- Each edge's `sla` and `limits` hold free text in the source's own words. [skill-authored]
- Two consumers can thus depend on one provider differently. [skill-authored]
- A `(from, to)` pair occurs once. [skill-authored]
- A dependency that is strong for one use and weak for another, such as writes and reads, is one edge. [skill-authored]
- That edge takes the stronger strength. [skill-authored]
- The chains carry the split. [skill-authored]
- An edge may cross levels in either direction. [skill-authored]
- A parent may thus depend on its child. [skill-authored]
- A child may depend on a sibling or on an element of another root. [skill-authored]
- Two services may depend on each other both ways. [skill-authored]
- An element outside the boundary is the `to` of at least one edge. [skill-authored]
- Such an element is an external dependency. [skill-authored]
- An `in_scope` element that is the `to` of an edge is an internal dependency. [skill-authored]
- An outside element consumed only by another outside element is allowed. [skill-authored]
- Strength moves no rating. [skill-authored]
- Strength selects the next-level and end readings of `cat-dependency-01`, the one dependency row that gives a reading per strength. [skill-authored]
- The run reads these readings on the provider's row. [skill-authored]
- It reads them for the strongest edge whose `to` is the provider's element or one of its ancestors. [skill-authored]
- This holds whether or not any cause links the chain. [skill-authored]
- The selected readings are a default that the run checks against the inputs. [skill-authored]
- The other dependency rows have one reading whatever the strength. [skill-authored]
- The report prints every edge. [skill-authored]
- The Azure Well-Architected Framework's failure mode analysis classifies dependencies as strong or weak. [cites:C014] [cites:C144]
- Treynor et al.'s paper "The Calculus of Service Availability" names the critical dependency as a concept. [cites:C145]

## Role

The role tests are asked in the order of the Role table, and the first yes wins. [skill-authored]
An element that passes the `service` test is a `service` even when a later test would also fit it. [skill-authored]
When the tests leave an element between two roles, the tie-breaks in the definitions decide; each is the skill's own. [skill-authored]
A tie-break that names the case settles it before the ordering rule applies, even when an earlier test also fits. [skill-authored]
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

- A type, owner or external column of the sheet that maps to a role or a boundary is used first. [skill-authored]
- When the sheet has no such column, each element is typed by the boundary and role tests applied to the sheet's item text, and every typing decision is recorded in the column mapping in `meta.history` as "typed by the converter from the item text". [skill-authored]
- `security_relevant` is false unless the sheet or its item text says otherwise. [skill-authored]
- When an item gets an edge and the sheet carries no strength for it, the edge's `strength` is `strong`. [skill-authored]
- This default applies whatever the item's boundary. [skill-authored]
- The converter records this default as a declared substitution. [skill-authored]
- The fail-safe reading assumes the system cannot serve without the element. [skill-authored]
- Every outside item gets one edge. [skill-authored]
- Every in-scope item whose rows carry a strength, an SLA or limits also gets one edge. [skill-authored]
- The edge's `from` is the first in-scope item in sheet order other than the item itself. [skill-authored]
- The edge comes with an open assumption owned by `user`. [skill-authored]
- That assumption names the edge, the rule that chose its `from`, and whether its strength came from the sheet. [skill-authored]
- An in-scope item with no other in-scope item gets no edge. [skill-authored]
- That item's values go into an open assumption. [skill-authored]
- A sheet with no in-scope item stops the conversion with the question SKILL.md gives. [skill-authored]
- The sheet's `Owner` column is the action owner and never an element owner. [skill-authored]
- Each of these defaults is a declared substitution in the column mapping, as the conversion rules already require for ratings. [skill-authored]

## Migrating a v1 document

A document written against the v1 kinds is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
A migration is an update, so it bumps `meta.version`. [skill-authored]
It runs alone, never in the same update as an architecture change. [skill-authored]
So the stale rules of an architecture change never mix with the mapping. [skill-authored]

| v1 element | After the migration | Provenance |
|---|---|---|
| `kind: external_dependency` | The role by the role tests, `service` when nothing more specific fits; `boundary: third_party`; the `dependency` block carried into the v2 migration's edge; where the element is in fact owned by the organisation, the person is asked and `owned_outside` is set | [skill-authored] |
| `kind: security_component` | The role by the role tests, `component` when nothing more specific fits; `security_relevant: true`; `security_rationale: "migrated from kind security_component; confirm"` | [skill-authored] |
| Every other element | `kind` kept; `boundary: in_scope` and `security_relevant: false`, both confirmed by the person for any element the run cannot read a source for | [skill-authored] |

- The person applies the default for every other element per element, not blindly. [skill-authored]
- An element whose internals `meta.boundary.excluded` lists is a candidate for `owned_outside`, and the person decides. [skill-authored]
- Catalog refs are renamed mechanically, `cat-external_dependency-NN` to `cat-dependency-NN` and `cat-security_component-NN` to `cat-security-NN`. [skill-authored]
- Catalog refs are renamed in both places they occur: `chains[].catalog_refs[].id`, and `elements[].sources[].ref` where the source kind is `catalog`. [skill-authored]
- Unattended, every question of this migration takes its stated default. [skill-authored]
- Unattended, each question of this migration is also listed in `meta.assumptions[]` as an open assumption with owner `user`. [skill-authored]
- Where an element's sources can be read, the migration applies the security test and records the rationale. [skill-authored]
- The default of false, with an open assumption, applies only to an element whose sources cannot be read. [skill-authored]
- A migrated `security_component` whose sources can be read takes the rationale the security test gives, and the fixed text 'migrated from kind security_component; confirm' is used only where no source can be read. [skill-authored]
- The migration leaves one kind of chain as it is. That chain applies a dependency row to an in-scope element that is the `to` of no edge. [skill-authored]
- That chain's `dependency-row-without-dependency` warning is for the next update to settle. [skill-authored]
- That update either gives the element a consumer or moves the row to the element depended on. [skill-authored]
- Migration marks no row stale: the mapping preserves meaning, and the ratings do not depend on the kind. [skill-authored]
- A role or a boundary the person changes afterwards goes through the update mode's ordinary stale rule. [skill-authored]
- Under that rule, an element changed when its `kind`, `boundary` or `security_relevant` changed. [skill-authored]
- Under that rule, an element also changed when an edge whose `to` is the element was added, removed or changed. [skill-authored]
- The rows this rule reaches are the set `update-check.ts` computes. [skill-authored]
- The question on an outside element is the person's and the run's. [skill-authored]
- The question on a codebase the new inputs do not cover is the person's and the run's. [skill-authored]
- The re-reads are the person's and the run's. [skill-authored]
- While `meta.codebases[]` is present and, for an entry that at least one element has as its effective codebase, the new inputs restate none of those elements, ask before the diff, naming the codebase, its elements, functions and chains and each action on them that carries a `tracker` block, for that codebase's inputs or for confirmation of every removal; remove nothing without it; unattended, write nothing, add no history entry, bump no version, and end with the question naming each such codebase. [skill-authored]
- Every other element field does not count. [skill-authored]
- The name, the description and `codebase` are labels, and `sources` and `security_rationale` record why, not what. [skill-authored]
- A change of `parent` is a change of `id`: a removed element and a new one, never an `element-changed`. [skill-authored]

## Migrating a v2 document

- A document written against schema v2, by 0.3.x to 0.5.x, carries a `dependency` block on an element in place of an edge, and is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
- It runs alone, never in the same update as an architecture change, and bumps `meta.version`; when it writes the migrated JSON it ends with `priority.ts --write`, `validate.ts --write` and `render.ts`, and when it writes nothing it runs none of them. [skill-authored]
- `update-check.ts` refuses a v2 document as its stored copy, so the migration runs no structural check. [skill-authored]
- The migration creates `dependencies[]` when absent and keeps it when present. [skill-authored]
- A document with no block and no array gets an empty array. [skill-authored]
- Each element's `dependency` block becomes an edge whose `to` is the element. [skill-authored]
- The edge's `strength`, `sla` and `limits` are the block's. [skill-authored]
- Each block makes one edge, unless a rule below makes several or none. [skill-authored]
- The migration removes the block. [skill-authored]
- The edge's `from` is the element's nearest `in_scope` ancestor. [skill-authored]
- For a provider with no in-scope ancestor, `from` is the one other in-scope root when exactly one exists. [skill-authored]
- When several exist, the person is asked. [skill-authored]
- The person may name one or more consumers, each of which gets an edge. [skill-authored]
- Unattended, when several exist, the migration takes the first such root in document order. [skill-authored]
- It lists that root in `meta.assumptions[]` as an open assumption owned by `user`. [skill-authored]
- That assumption names the other in-scope roots as candidates. [skill-authored]
- When no other in-scope root exists, an `in_scope` provider has its block dropped and gets no edge. [skill-authored]
- The drop is listed as an open assumption owned by `user` that carries the block's strength, SLA and limits. [skill-authored]
- An outside provider in that case cannot validate without an edge. [skill-authored]
- The person is therefore asked to name a consumer. [skill-authored]
- The consumer may be a nested in-scope element. [skill-authored]
- Unattended, that question is the one question of the migration with no default. [skill-authored]
- Unattended, that question stops the whole update. [skill-authored]
- When the update stops, the file is left as it was, with no edge, history entry or version bump. [skill-authored]
- That includes the v1 half of a combined update. [skill-authored]
- When it stops, the final message names each outside provider that has no consumer and asks for one. [skill-authored]
- An edge the migration would make whose `(from, to)` is already an edge of the existing array is not added. [skill-authored]
- The existing edge is kept as it is. [skill-authored]
- Where the block's strength, SLA or limits differ from it, the difference is listed in `meta.assumptions[]` as an open assumption. [skill-authored]
- That assumption is owned by `user` and carries the block's values. [skill-authored]
- A v1 document runs the v1 migration and then this one in the same update. [skill-authored]
- Every v1 boundary decision, answered or defaulted, is settled before any `from` is chosen. [skill-authored]
- The combined update has one version bump and one history entry naming both. [skill-authored]
- Migration marks no row stale: the edge carries what the block carried, and strength moves no rating. [skill-authored]
- One open assumption owned by `user` names, by id, every chain on an element whose `dependency` block was `weak`. [skill-authored]
- This is because the v2 scales barred the loss-of-access class on such a chain, and the v3 scales rate the end effect as written. [skill-authored]
- A v2 assumption that recorded the classification doubt stays beside the weak-block assumption. [skill-authored]
- Where the person finds the loss-of-access class credible, the classification and the effect disagree. [skill-authored]
- In that case, an edge whose strength the person corrects in an ordinary update marks the element's chains stale. [skill-authored]
- That update also re-reads S. [skill-authored]
- An edge kept weak in that case carries the open assumption on its strength that the scales require. [skill-authored]
- With the edge kept weak, the rating stands as written until an update marks the row stale. [skill-authored]
- The weak-block assumption is written the same attended and unattended. [skill-authored]
- None is written when no block was `weak`. [skill-authored]
- The weak-block assumption closes when every chain it names is settled. [skill-authored]
- A chain is settled by nothing moving, or by an edge change that re-read it. [skill-authored]
- A chain is also settled by the open assumption on its edge's strength. [skill-authored]
- An update that settles some of those chains rewrites the weak-block assumption to name the rest. [skill-authored]
- The migration adds no codebase and no link. [skill-authored]
- Both are later work for the person through an ordinary update. [skill-authored]
- The final message says so. [skill-authored]
- It also says that until links exist, an edge change marks only the provider's rows stale. [skill-authored]
- It also names the chains the weak-block assumption lists, or says that no block was `weak`. [skill-authored]
- The history entry names each edge made, with its `from` and the rule that chose it. [skill-authored]
- It also names each existing edge kept in place of a derived one. [skill-authored]
- It also names the chains the weak-block assumption lists. [skill-authored]
- A role, boundary, edge or link the person changes or adds afterwards goes through the update mode's ordinary rules. [skill-authored]

## Runs over several codebases

- A `repo` source ref takes the qualified form `owner/repo@commit:path`, where `commit` is a full 40-hex-digit SHA. [skill-authored]
- A run over several codebases uses that form on every `repo` ref. [skill-authored]
- A single-repository run may keep bare paths. [skill-authored]
- The `repo-ref-form` lint checks the refs for consistency alone: once one `repo` ref is qualified, every `repo` ref must be. [skill-authored]
- Step 1 lists every codebase the run covers or reads in `meta.codebases[]`. [skill-authored]
- Each entry names its repository in the `owner/repo` form and, for part of a monorepo, its `path`. [skill-authored]
- `meta.boundary.included` describes what inside them is covered. [skill-authored]
- A codebase whose repository the inputs do not name is an open assumption and not an entry. [skill-authored]
- In a run over several services, each service is a depth-1 element with no artificial root above them, because the report groups and counts chains by root; one product spread over several repositories may stay one root whose children name their codebases. [skill-authored]
- The depth cap of 4 stays. [skill-authored]
- An element's effective codebase is its own `codebase` when it sets one. [skill-authored]
- Otherwise, when the element and its parent are both `in_scope`, the element's effective codebase is its parent's effective codebase. [skill-authored]
- Otherwise the element has no effective codebase. [skill-authored]
- An element outside the boundary neither inherits a codebase nor passes one down. [skill-authored]
- Under an outside parent, an in-scope element has an effective codebase only when it sets one, whatever the parent sets. [skill-authored]
