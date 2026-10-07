# Structure elements

This file is loaded at step 2, when the system is decomposed into elements. [skill-authored]
Each element answers three questions, in this order: its boundary, its role and its security relevance. [skill-authored]

## The three questions

1. **Boundary:** does this analysis cover the element, does the organisation own it outside this analysis, or is it outside the organisation's control? [skill-authored] The answer is the element's `boundary`, one of `in_scope`, `owned_outside` and `third_party`. [skill-authored]
2. **Role:** what kind of element is it? [skill-authored] The answer is the element's `kind`, one of `service`, `datastore`, `event_stream`, `interface` and `component`, taken from the first role test it passes. [skill-authored]
3. **Security relevance:** does a required security property depend on the element working correctly? [paraphrased:C157] The answer is the element's `security_relevant`, true or false. [skill-authored]

The three answers are independent of one another: the role says which catalog rows apply, the boundary whether the dependency rows apply on top of them, and the flag whether the security rows apply as well. [skill-authored]
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
| In scope (`in_scope`) | This analysis covers it: its sources are the repository, documents, incidents or people of the analysed system | The line between in scope and outside it rests on the scope of the analysed workload in the Azure Well-Architected Framework (C143) and in the AWS Well-Architected reliability pillar (C146), on the external systems the analysed system needs in MIL-STD-1629A (C134), and on the interactors outside the scope in Microsoft's SDL threat-modeling article (C149). | [cites:C143] [cites:C146] [cites:C134] [cites:C149] [skill-authored] |
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

<!-- vocabulary:end -->

## Boundary

| Boundary | Consequence | Provenance |
|---|---|---|
| `in_scope` | Catalog rows by role; the element may carry a `dependency` block when other elements depend on it, and is then an internal dependency | [skill-authored] |
| `owned_outside` | An external dependency: the `dependency` block is required, and the dependency rows apply on top of the role's rows | [skill-authored] |
| `third_party` | As `owned_outside` | [skill-authored] |

Every element gets functions and chains whatever its boundary: the dependency rows are written against an element's functions, so an element outside the scope needs them as much as one inside it. [skill-authored]
The split of the outside into `owned_outside` and `third_party` is the skill's own, since no source draws it. [skill-authored]
A pricing service is `in_scope` in the run that analyses it and `owned_outside` in a run that only calls it, and only in the second is it an external dependency. [skill-authored]
Strength stays in the `dependency` block, strong or weak, as a property of the edge between the system and the element rather than of the element itself, as the Azure Well-Architected Framework's failure mode analysis and Google's paper "The Calculus of Service Availability" treat a dependency. [cites:C014] [cites:C144] [cites:C145]

## Role

The role tests are asked in the order of the Role table, and the first yes wins: an element that passes the `service` test is a `service` even when a later test would also fit it. [skill-authored]
When the tests leave an element between two roles, the tie-breaks in the definitions decide, and each of them is the skill's own. [skill-authored]
The data items of the NASA Software Safety Guidebook, its software events, and the CSCIs, units, objects and instances that the NASA Software Engineering Handbook has a software FMEA inventory by design phase are a basis for the `datastore`, `event_stream` and `component` tests, never their definition. [cites:C137] [cites:C138] [cites:C135]
The fit is loose on purpose: these are a basis, not a match. [skill-authored]

## Security relevance

An element is security-relevant when a required security property depends on it working correctly, the class NIST SP 800-53 Rev. 5 calls security-relevant components and Common Criteria calls the TOE security functionality. [paraphrased:C157] [cites:C158]
The properties the skill counts are authentication, authorisation, confidentiality and integrity, a list that is the skill's own. [skill-authored]
The test is one question: if this element misbehaves, can someone see or do what the system must prevent? [skill-authored]
The class is worth marking because NIST SP 800-53 Rev. 5 asks for security functions to be isolated from the functions that are not, in control SC-3. [cites:C156]
A security-relevant element gets the security rows in addition to its role's rows. [skill-authored]
The default answer is false; a run that sets the flag true states its reason in `security_rationale`, and it may record one when it sets the flag false. [skill-authored]

## Conversion from a sheet

A type, owner or external column of the sheet that maps to a role or a boundary is used first. [skill-authored]
When the sheet has no such column, each element is typed by the boundary and role tests applied to the sheet's item text, and every typing decision is recorded in the column mapping in `meta.history` as "typed by the converter from the item text". [skill-authored]
`security_relevant` is false unless the sheet or its item text says otherwise. [skill-authored]
When a boundary other than `in_scope` is set and the sheet carries no strength, `dependency.strength` is `strong`, recorded as a declared substitution: the fail-safe reading assumes the system cannot serve without the element. [skill-authored]
The sheet's `Owner` column is the action owner and never an element owner. [skill-authored]
Each of these defaults is a declared substitution in the column mapping, as the conversion rules already require for ratings. [skill-authored]

## Migrating a v1 document

A document written against the v1 kinds is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
A migration is an update, so it bumps `meta.version`. [skill-authored]
It runs alone, never in the same update as an architecture change, so the stale rules of an architecture change never mix with the mapping. [skill-authored]

| v1 element | After the migration | Provenance |
|---|---|---|
| `kind: external_dependency` | The role by the role tests, `service` when nothing more specific fits; `boundary: third_party`; the `dependency` block kept; where the element is in fact owned by the organisation, the person is asked and `owned_outside` is set | [skill-authored] |
| `kind: security_component` | The role by the role tests, `component` when nothing more specific fits; `security_relevant: true`; `security_rationale: "migrated from kind security_component; confirm"` | [skill-authored] |
| Every other element | `kind` kept; `boundary: in_scope` and `security_relevant: false`, both confirmed by the person for any element the run cannot read a source for | [skill-authored] |

The default for every other element is applied per element by the person, not blindly: an element whose internals `meta.boundary.excluded` lists is a candidate for `owned_outside`, and the person decides. [skill-authored]
Catalog refs are renamed mechanically, `cat-external_dependency-NN` to `cat-dependency-NN` and `cat-security_component-NN` to `cat-security-NN`, in both places they occur: `chains[].catalog_refs[].id`, and `elements[].sources[].ref` where the source kind is `catalog`. [skill-authored]
Unattended, every question to the person takes the stated default and is listed in `meta.assumptions[]` as an open assumption with owner `user`. [skill-authored]
Where an element's sources can be read, the migration applies the security test and records the rationale; the default of false, with an open assumption, applies only to an element whose sources cannot be read. [skill-authored]
Migration marks no row stale: the mapping preserves meaning, and the ratings do not depend on the kind. [skill-authored]
A role or a boundary the person changes afterwards goes through the update mode's ordinary stale rule, under which an element changed when its `kind`, `boundary`, `security_relevant` or `dependency` changed. [skill-authored]
Every other element field does not count: the name and the description are labels, and `sources` and `security_rationale` record why, not what. [skill-authored]
A change of `parent` is a change of `id`, so it is a removed element and a new one, never an `element-changed`. [skill-authored]

## Runs over several codebases

A `repo` source ref takes the qualified form `owner/repo@commit:path`, where `commit` is a full 40-hex-digit SHA. [skill-authored]
A run over several codebases uses that form on every `repo` ref, and a single-repository run may keep bare paths. [skill-authored]
The `repo-ref-form` lint checks the refs for consistency alone: once one `repo` ref is qualified, every `repo` ref must be. [skill-authored]
Step 1 lists every codebase the run covers in `meta.boundary.included`. [skill-authored]
Several systems may sit at depth 1 with no artificial root above them, and the depth cap of 4 stays. [skill-authored]
