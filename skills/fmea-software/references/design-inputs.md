# Design-side inputs

This file is the input checklist the analysis works from: what to collect before the structure step, what each item is, where it usually lives, and which record it comes from. [skill-authored]
Collect what exists, record where each item came from, and write down what is missing as an assumption instead of inventing it. [skill-authored]
No input is a rating and no input is a chain; an input is evidence about the system, and the analysis is what is done with it. [skill-authored]

## The checklist

| # | Input | What to collect | Provenance |
|---|---|---|---|
| 1 | Critical flows | The user and system flows, already prioritised by criticality, that the analysis follows through the structure. | [paraphrased:C014] |
| 2 | Component inventory by type | The system decomposed by component type: ingress, networking, compute, data, storage, supporting services — identity, messaging, key and secret storage — and egress. | [paraphrased:C014] |
| 3 | Dependency classification | Every dependency placed on two axes: internal or external by the element's boundary (`in_scope` against `owned_outside` or `third_party`), and strong or weak. | [paraphrased:C014] [skill-authored] |
| 4 | Dependency reliability data | For every element that carries a `dependency` block, whatever its boundary, the availability SLA and the scaling limits. | [paraphrased:C014] [skill-authored] |
| 5 | Incident history | The incidents the system has had, the postmortems written for them, and the follow-up tasks those postmortems raised. | [cites:C023] |
| 6 | Release controls | Release-side controls such as canary releases and staged rollouts. | [cites:C018] |
| 7 | Observability controls | Central error logging and alerting. | [cites:C022] |
| 8 | Static checks | The checkers that read code without running it — the layer Yuan et al. (OSDI '14) separate from testing. | [cites:C028] |
| 9 | Small-scale tests | The unit and few-node tests that exercise error-handling paths, the second layer in the same study by Yuan et al. | [cites:C028] [cites:C029] |
| 10 | Ground rules | The rules decided before the analysis begins; the skill writes each one into `meta.ground_rules`. | [paraphrased:C110] [paraphrased:C130] [skill-authored] |
| 11 | Written assumptions | Every assumption, each written as its own item. | [paraphrased:C110] |
| 12 | Contract files | The interface definitions the system publishes and consumes, with their published limits and error contracts. | [skill-authored] |
| 13 | Data flows | What data crosses which boundary, in which direction. | [skill-authored] |

Items 1 to 4 are the structure inputs and are wanted before step 2; items 5 to 9 are wanted before controls are inventoried in step 4; items 10 and 11 are decided first and revised throughout. [skill-authored]

## Flows, components and dependencies

Flows come first: the analysis assumes user and system flows have already been identified and prioritised by criticality, and plans the components each critical flow needs against them. [paraphrased:C014]
Decomposition is by component type, and the seven types in row 2 are the prompt for finding elements. [skill-authored]
A strong dependency is one the system cannot function or stay available without; a weak one, when absent, costs named features while the system as a whole keeps serving. [paraphrased:C014]
The reliability data — availability SLA, scaling limits — is stated for internal dependencies; capturing it for external ones as well is a choice the analysis may make, not something the checklist asks for. [paraphrased:C014]
This skill asks for it on every element carrying a `dependency` block, a `skill-authored` extension. [skill-authored]
Internal or external is a boundary question, strong or weak is a criticality question, and an element is classified on both. [skill-authored]
In the analysis JSON this lands on the element: `dependency.strength` holds strong or weak, `dependency.sla` and `dependency.limits` hold the commitment and the limits as free text in the source's own words. [skill-authored]
An element whose boundary is `owned_outside` or `third_party` must carry `dependency` and is an external dependency; an `in_scope` element that carries one is an internal dependency. [skill-authored]

## Incident history

Collect the incidents, the postmortems and the follow-up tasks together: Google's Production Readiness Review is the prior art for taking all three as review inputs. [cites:C023]
Read them for two things the analysis needs — which failure modes have actually occurred, and which controls were in place when they did. [skill-authored]
A chain seeded from an incident carries that incident's identifier in `source_incident`, so the row can be traced back to the record it came from. [skill-authored]
A design that has not shipped has no incident history: the input is then empty, and that fact is written down as an assumption rather than filled in from a similar system. [skill-authored]
An incident record is a source of a chain and of an element, never by itself a rating. [skill-authored]

## The control inventory

The inventory is of controls that exist now, collected per system, because a control another team runs is not a control on this one. [skill-authored]
Release-side controls to look for include canary releases and staged rollouts. [cites:C018]
Observability controls to look for: central error logging and alerting. [cites:C022]
Static checks and small-scale tests are two layers, not one: Yuan et al. (OSDI '14) separate the faults a checker can find by reading error-handling code from the faults reached by statement-coverage testing of that code. [cites:C028]
Small-scale tests stay worth inventorying even for a system that runs on many nodes: Yuan et al. (OSDI '14) found the failures they studied in five distributed data-intensive systems were mostly reproducible on no more than three nodes. [cites:C029]
Which of these is a prevention control and which a detection control is the skill's own classification: no source in the evidence base assigns any of them to a control kind. [skill-authored]
Record each control with its `status` — `existing` or `planned` — and its evidence kind, because a planned control does not satisfy the detection lint and an unevidenced one carries `none`. [skill-authored]
A control found here can also become an element later; finding it does not settle that it works. [skill-authored]

## Ground rules and assumptions

Decide the ground rules before the analysis begins: what will count as a failure, which kinds of failure are included, what fault tolerance is assumed. [paraphrased:C130]
Write every assumption down as its own item, and treat an unwritten assumption as a defect in the analysis rather than a detail. [paraphrased:C110]
NASA's software safety guidebook puts it this way: "Don't let assumptions go unwritten. Each one is important. In other words, 'ASSUME NOTHING' unless you write it down." [sourced:C110]
Reproduced from NASA-GB-8719.13, a work of the United States Government; public domain in the United States. [skill-authored]
The NASA sample ground rules are not carried into the skill: that set is hardware-scoped — it leaves human-error failure modes out of scope and categorises criticality on the worst-case effect of a hardware item's failure — so what transfers is the practice of deciding the rules first, not the rules. [paraphrased:C110] [paraphrased:C130]
Both NASA documents list dependence on the accuracy of the documentation among the technique's known weaknesses, which is why every element records where its description came from. [paraphrased:C110] [paraphrased:C130] [skill-authored]
How deep the inventory goes follows the lifecycle phase: functions or problem domains at requirements; functions, configuration items, or objects and classes at architectural design; configuration items, units, objects and instances at detailed design. [paraphrased:C130]
At the architectural design phase only a preliminary analysis is possible, so an inventory taken there is collected expecting to revisit it. [paraphrased:C130]
Ground rules and assumptions are analysis metadata, not element data: `meta.ground_rules` holds one entry per rule and `meta.assumptions` holds each assumption with an owner and an open or closed status. [skill-authored]
An unattended run records every missing input as an open assumption owned by the user, and proceeds without it. [skill-authored]

## Contracts and data flows

Two checklist items are the skill's own, because the research produced no record on interface or data-flow inputs: the contract files and the data flows. [skill-authored]
They are in the checklist because an interface element cannot be described without its contract, and a datastore or event-stream element cannot be described without knowing what data reaches it. [skill-authored]
Collect the schema and interface definition files from the repository, the published rate and size limits, the declared error responses, and for each flow what data crosses which boundary and in which direction. [skill-authored]
v1 ships no catalog rows for interfaces, event streams or datastores; the questions that elicit them are in design-failure-catalog.md, the rows are not. [skill-authored]

## Where the inputs live

| Input | Where to look first | Provenance |
|---|---|---|
| Critical flows | Architecture documents; the service catalog, where one is kept. | [skill-authored] |
| Component inventory | The repository, then the architecture documents that describe it. | [skill-authored] |
| Dependency classification | The service catalog and the architecture documents. | [skill-authored] |
| Dependency SLAs and limits | Contract files and the service catalog entry for the dependency. | [skill-authored] |
| Incident history | The incident tracker, and the postmortems it links. | [skill-authored] |
| Release controls | CI configuration, and the deployment configuration it drives. | [skill-authored] |
| Observability controls | Observability configuration: logging, dashboards, alert rules. | [skill-authored] |
| Static checks and small-scale tests | CI configuration, and the test directories of the repository. | [skill-authored] |
| Contract files and data flows | The repository, beside the code that serves them. | [skill-authored] |
| Ground rules and assumptions | Nowhere: they are decided by the analysis and written into `meta`. | [skill-authored] |

Each place maps to a `sources[].kind` on the element it feeds: `document` for an architecture document or a converted sheet, `repo` for a repository, `interview` for a person, `incident` for an incident or postmortem record, `contract` for a supplier or service agreement, and `catalog` for a catalog row that prompted the element. [skill-authored] A `repo` ref may take the form `owner/repo@commit:path` with a full 40-hex-digit SHA; a run over several codebases uses it on every `repo` ref. [skill-authored] A service-catalog entry is `document`, never `catalog`; CI and observability configuration are `repo` when held in a repository and `document` otherwise; an interface definition file is `repo`, and `contract` is kept for a supplier or service agreement. [skill-authored]
Where an input is missing and a person supplies it instead, the source kind is `interview` and the person or role is the reference. [skill-authored]

## The non-catalog source rule

Every element lists at least one source whose kind is not `catalog`: the validator enforces it as the invariant `element-source-non-catalog`. [skill-authored]
A catalog source records only that a catalog row prompted the element; it is not evidence that the element exists in the system. [skill-authored]
So no chain is rated for an element with no listed non-catalog source — collect the missing source and add it, or leave the element out of the analysis and record why. [skill-authored]
The catalog row's own provenance stays on the chain, in `catalog_refs[]`, and never becomes the element's source. [skill-authored]
