# Method selection: postmortem seeding and the threat-model handoff

Version 1 carries two methods beside the ordinary design run: seeding chains from postmortems, and handing a chain whose cause is an adversary off to threat modeling. [skill-authored]
Neither replaces the spine: seeding fills Step 4 from incident history collected in Step 1, and the handoff is written in Step 4 against the security boundary declared in Step 1. [skill-authored]
This file decides when each applies, what each carries, and what neither of them licenses. [skill-authored]

## The comparator

| Method | When it applies | What it produces | Provenance |
|---|---|---|---|
| Postmortem seeding | The run is the *seed from postmortems* shape and an incident history exists; an incident matching one or more of the selection signals below is a candidate, but the signals are examples rather than a complete list, so the analyst decides and may seed from an incident that matches none [adapted-from:C077] | Chains built backward from incidents to modes, each seeded chain carrying `source_incident`, every carried-over action carrying its own, all ratings written `provisional` | [adapted-from:C077] [adapted-from:C076] [skill-authored] |
| Threat-model handoff | A cause on a chain names an adversary as the agent, on an element of any kind (D6) | A `handoff` object on that chain naming `threat-model`, the reason, and the adversary cause; the chain stays in the analysis and is rated and prioritized like any other | [skill-authored] |

Two rows is the whole comparator in v1. [skill-authored]
Pre-mortem and STPA are absent because no source for either was fetched and no recommended run covers them; they get rows when a sourced run supplies records, and not before. [skill-authored]
Threat modeling itself is also out of scope for v1, so the second row ends at the referral. [skill-authored]

## Postmortem seeding

### Which incidents seed a chain

Howie holds that no fixed rule decides which incidents merit deeper analysis, and that the time, attention and effort spent on one should track how much it might teach rather than its severity level alone. [paraphrased:C077]
The guide says of the list below that it is not a complete one. [paraphrased:C077]
Its home page does say that high-severity or very public incidents and serious near misses call for more of its tools, so severity is one of several signals rather than the gate. [paraphrased:C077]

| Signal that an incident deserves more attention | Provenance |
|---|---|
| There were multiple (> 2) teams involved | [sourced:C077] |
| A new service or interaction took part in the event | [sourced:C077] |
| It involved misuse of something that seemed simple or uninteresting ... (e.g., expired certs) | [sourced:C077] |
| The event involved a use case that was never thought of—indication of a surprise | [sourced:C077] |
| The event was almost really bad | [sourced:C077] |
| It looks like a repeat incident | [sourced:C077] |
| There is a lot of discussion around the incident | [sourced:C077] |
| There was confusion in or around the event | [sourced:C077] |
| The incident took place during an important event (e.g., an earnings call) | [sourced:C077] |

An incident matching one or more signals is a candidate to seed a chain, and the analyst still decides. [adapted-from:C077]
The same list is the trigger list for revisiting a written analysis: a later incident matching a signal reopens the rows it touches rather than starting a new document. [adapted-from:C077]
Nothing here promotes a chain to a rating: a seeded chain is rated by the anchors in `scales-software.md`, on the same evidence rules as any other. [skill-authored]

### What a postmortem hands over

The Howie report is the *how we got here* account, a narrative that tells the human and organizational side of an incident alongside what failed technically. [paraphrased:C078]
It calls root-cause analysis a legacy term that carries negative baggage, and the only causal term it uses for its own practice is contributing factors, always in the plural. [paraphrased:C078]
So a seeded chain writes those contributing factors into `causes[]`, one entry each, and the skill does not use root-cause wording when it reports back to a team that works this way. [skill-authored]
Howie recommends several timelines, each from a different point of view, because an incident does not move in a neat line from detection through diagnosis to repair, and because the wrong turns and red herrings along the way are worth seeing. [paraphrased:C078]
A postmortem therefore arrives as unstructured narrative carrying no severity, occurrence or detection value, and extracting element, function, mode, effects, causes and controls from it is the skill's work rather than the postmortem's. [skill-authored]
Where a team tags its timeline with detection, diagnosing and repair-completed moments, the detection moment is where a seeded chain's Detection evidence is found; the anchor it is scored against is still the one in `scales-software.md`. [adapted-from:C078]

### Learning and action are fenced apart

Howie keeps corrective actions out of the learning review: they go to a parking lot and are dealt with in a separate action-items section or meeting. [paraphrased:C076]
Its reason is that actions proposed inside the review pull attention away from understanding what happened and tend to be hasty and half-considered, so many of them end up rejected, carried out to little benefit, or parked on the backlog for good. [paraphrased:C076]
It also holds that, because a system never stops changing, today's action items can turn into contributing factors in later incidents. [paraphrased:C076]
The FMEA is the artifact that obligates and prioritizes action, so seeding takes the postmortem's contributing factors and controls as inputs and never re-runs the postmortem's learning work inside the analysis. [skill-authored]
Every implemented action is itself re-analysed as a potential cause of a future failure. [adapted-from:C076]
`quality-and-lint.md` carries that as a reviewer rule, because no machine check decides it. [skill-authored]

### Identifiers a seeded chain carries

An action carried over from a postmortem's action items records the identifier of the incident it came from, in `actions[].source_incident`. [adapted-from:C076]
The chain-level slot `chains[].source_incident` is the skill's own addition and rests on no record. [skill-authored]
The lint `seeded-action-without-incident` warns on an action with no identifier on a chain that has one, and the reviewer decides whether it was carried over or authored here. [skill-authored]
An action authored during the analysis is never given an incident identifier it did not come from. [skill-authored]

### What incident data may rate, and what may not

Incident counts over a stated window are admissible Occurrence evidence, and the window goes into the rating's rationale. [skill-authored]
Averaged incident metrics are not: duration data is right-skewed, with the bulk of incidents resolved within about two hours, so a mean-based figure such as MTTR misdescribes the spread it is drawn from and cannot carry a reliability judgement. [paraphrased:C001]
Asked what should take MTTR's place, the VOID replies that a lone average was never fit to stand for how reliable a system of people and software is, and it points instead to four kinds of input: the coordination an incident demanded, such as the people and teams drawn in, the tools and chat channels used, and any other incident running at the same time; how widely the write-ups and review meetings that follow incidents are read, attended and linked to; close calls; and service-level objectives read alongside what customers report. [paraphrased:C005]
It cautions in the same breath that exchanging MTTR for some other lone, simplified figure would repeat the mistake. [paraphrased:C005]
That caution binds here, because a rating is itself a single ordinal: those inputs are evidence a rating rationale rests on, never numbers to be averaged into the rating. [skill-authored]
Recorded incident severity labels are not Severity evidence either: severity is what the VOID calls gray data, highly variable and weak in fidelity, set by judgement and often chosen to pull attention onto an incident. [paraphrased:C003]
A SEV label may still say which incidents are worth reading; the Severity rating is taken from the end-level effect against the anchors, not from the label. [skill-authored]
Ratings a seeded run writes are `provisional`, like every rating the skill writes, until a named person re-scores each one against the anchors and the review status becomes `rescored`. [skill-authored]

### Prior art, and its limit

Google's Production Readiness Review reads incident records, postmortems and their follow-up tasks; `design-inputs.md` lists the same three as design-side inputs against the same record. [cites:C023]
It is corroborating practice and no more: that chapter carries no rating scale, no likelihood derivation and no structured postmortem format, so it supports reading incident history into an analysis and says nothing about how a rating is derived from it. [cites:C023]
Google SRE Book material is cite-only, so both sentences name the record for the concept and take no wording, selection or arrangement from the book. [skill-authored]

### Attribution for the Howie material

The Howie Guide is published under the Apache License 2.0, copyright PagerDuty, Inc., and its checklists may be reproduced and adapted with attribution and license notice. [paraphrased:C080]
Attribution block for every `sourced:`, `paraphrased:` and `adapted-from:` use of Howie in this file: *Howie: The Post-Incident Guide*, https://howie-guide.pagerduty.com/, Copyright 2024 PagerDuty, Inc. (the LICENSE form; the site's rights metadata reads Copyright © PagerDuty, Inc.), licensed under the Apache License, Version 2.0, http://www.apache.org/licenses/LICENSE-2.0; originally published by Dr. Laura Maguire, Nora Jones and Vanessa Huerta Granda in collaboration with the Jeli team, and rehomed by PagerDuty after it acquired Jeli in 2023. [paraphrased:C080]
Statement of the changes, the Apache-2.0 element the two above do not cover: nine of the guide's ten bulleted examples are carried as table rows with their wording unchanged but for one parenthetical aside, cut and marked with an ellipsis; the tenth, an interest in investigating the incident further, is not carried; every line tagged `paraphrased:` restates the guide's content in other words; and every line tagged `adapted-from:` is the skill's restatement of the guide's material as an FMEA rule, not the guide's text. [paraphrased:C077] [skill-authored]
The repository has no NOTICE file, so there is no NOTICE passthrough obligation. [paraphrased:C080]
Howie, Jeli and PagerDuty are named nominatively here, and no endorsement is claimed. [skill-authored]

## The threat-model handoff

Security-relevant elements are analysed as ordinary elements, with the same functions, modes, effects, causes and controls as anything else in the inventory. [skill-authored]
Any failure whose cause is an adversary, on an element of any kind, is recorded as a handoff row to threat modeling; that is decision D6. [skill-authored]
Routing is by cause and not by effect: a security attack or breach as an end effect stays on the Severity scale and is rated there, and only an adversarial cause writes a handoff. [skill-authored]

### The interface

A cause carries `adversarial: true` when an adversary is the agent; the field absent means false, and one cause may carry both `adversarial` and an `origin`. [skill-authored]
A chain carries `handoff` if and only if at least one of its causes is marked adversarial, which the validator enforces in both directions under `handoff-without-adversarial` and `adversarial-without-handoff`. [skill-authored]
`handoff` holds `to`, fixed to `threat-model` as the one target in v1, `reason` in prose, and `adversary_cause`. [skill-authored]
`adversary_cause` repeats the text of a cause on the same chain marked adversarial, exactly, and the validator checks that under `handoff-cause-mismatch`. [skill-authored]
The report marks handoff rows, so a reader sees which chains were referred. [skill-authored]
Whether a cause is adversarial is a judgement, so `quality-and-lint.md` carries it as a reviewer rule rather than a machine check. [skill-authored]

### What the handoff does not do

It does not remove the row: the chain keeps its effects, controls, ratings and priority, and its actions are owed like any other row's. [skill-authored]
It does not model the threat, name an attacker, or rank an attack path, because threat modeling itself is out of scope for v1. [skill-authored]
It rests on no record: D6 is the skill's own decision, and nothing in the evidence base defines a security boundary for a software FMEA. [skill-authored]
