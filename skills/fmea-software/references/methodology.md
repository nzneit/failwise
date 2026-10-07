# Methodology: editions, lineages, and what transfers to software

This file records what the classical FMEA canon supplies to this skill, what it withholds, and under which licence each backbone document may be used at all. [skill-authored]
It stands behind three claims the skill makes about itself: its spine is prior-art structure rather than handbook text, every classical rule it uses carries a transfer status, and its prioritization is severity-first by ruling rather than by inheritance. [skill-authored]
`references/provenance.md` holds the tag vocabulary and the source register; where that register and the matrix below could differ on a source's status, the register governs and this file follows it. [skill-authored]

## The five backbone documents

| Document | Edition and date | Status | Licence in evidence | Treatment in v1 | Provenance |
|---|---|---|---|---|---|
| MIL-STD-1629A, *Procedures for Performing a Failure Mode, Effects and Criticality Analysis* | Revision A dated 24 November 1980; Notice 2 dated 28 November 1984; Notice 3 dated 4 August 1998 | Cancelled by Notice 3 on 4 August 1998, with no successor named | The notice carries no copyright, distribution or licensing statement, so the status rests on US government-work rules | Reproduce with the government-work note; nothing is reproduced in v1 | [paraphrased:C041] [paraphrased:C042] [paraphrased:C043] [paraphrased:C044] [paraphrased:C045] [skill-authored] |
| IEC 60812:2018, *Failure modes and effects analysis (FMEA and FMECA)* | Edition 3.0, August 2018, replacing the second edition of 2006 | Maintained; prepared by IEC technical committee 56, Dependability | IEC copyright; only a 15-page preview is free and the rest of the document is paywalled | Cite-only: facts about the document's structure are cited, no IEC text is paraphrased or adapted | [cites:C051] [cites:C052] [skill-authored] |
| SAE J1739, *Potential FMEA Including Design FMEA, Supplemental FMEA-MSR, and Process FMEA* | J1739_202605, dated 8 May 2026, frozen at the revision of 13 January 2021; issued July 1994 | Stabilized, meaning SAE will not revise it further | Proprietary; its rating charts and worksheets sit inside the paid document | Paraphrase with citation; no chart or worksheet content is in the evidence base | [paraphrased:C081] [paraphrased:C083] [paraphrased:C084] [skill-authored] |
| IEEE 1633-2016, *IEEE Recommended Practice on Software Reliability* | Board approval 22 September 2016, published 18 January 2017, superseding IEEE 1633-2008 | Current | Paid, copyrighted IEEE product available by purchase or subscription | Paraphrase with citation; used for product-page metadata only: edition, licence, scope statement and working-group chair | [paraphrased:C096] [paraphrased:C100] [skill-authored] |
| AIAG & VDA FMEA Handbook | 1st edition, with the English-translation errata sheet at version 2, dated 2 June 2020; the sheet references no second edition | Current | The handbook is a paid AIAG product; the errata sheet is published openly with no notice of its own but quotes handbook text AIAG and VDA assert copyright over | Paraphrase the errata sheet with citation; no handbook cell value of any kind ships | [paraphrased:C061] [skill-authored] |

All four standards other than MIL-STD-1629A are paywalled products, so no body text of any of them enters this plugin. [cites:C052] [cites:C061] [cites:C083] [cites:C100]
The IEC Webstore terms bar use of IEC publications for developing a software program or an AI tool without written permission and state no quotation exemption. [cites:C052]
That clause, not the paywall alone, is why v1 treats IEC 60812 as cite-only rather than paraphrase-only, and `references/provenance.md` holds the ruling. [skill-authored]
The handbook body is unread in this corpus: no record reaches its seven-step definitions, and its rating tables, Action Priority table and forms are paid and paraphrase-only; no record reads them directly, and no cell value of any of them ships. [cites:C061] [skill-authored]
For MIL-STD-1629A, the corpus holds the cancellation notice, the base document's cover and foreword, and, since 2026-10-07, records C131 to C134 read from the standard's body; nothing is reproduced from it. [paraphrased:C042] [paraphrased:C045] [cites:C134]
The cancellation notice names no successor and points users generically at national and international FMECA documents, so no claim that a particular standard replaced it is supported. [paraphrased:C043]
IEEE 1633-2016's public record frames the standard as life-cycle software reliability engineering — assessment, prediction, measurement, data collection — and its product page's scope statement never mentions FMEA or SFMEA, so whatever SFMEA material the body holds is unverified here. [paraphrased:C099]

## The two software lineages

Two lineages in the corpus carry software FMEA, and they disagree at the root: whether a software FMEA is the hardware procedure with different nouns. [skill-authored]

### NASA

NASA-GB-8719.13, effective 31 March 2004, and topic 8.05 of the NASA Software Engineering Handbook both define a software FMEA as the standard hardware FMEA with software components substituted for hardware components. [paraphrased:C106] [paraphrased:C126]
Both anchor the procedure on MIL-STD-1629's eight steps: define the system, build functional block diagrams, identify item and interface failure modes, evaluate each mode by its worst consequence, identify detection methods and compensating provisions, identify corrective design or other actions, identify the impact of those changes, and document what could not be corrected. [paraphrased:C106] [paraphrased:C126]
The guidebook rates the technique high benefit and high cost, and recommends pairing it with top-down software fault tree analysis as a bi-directional analysis. [paraphrased:C106]
The handbook suggests the unit of analysis per lifecycle phase — problem domains or functions at requirements; functions, CSCIs or objects and classes at architectural design; CSCIs, units, objects and instances at detailed design — and holds that only a preliminary SFMEA is possible at the architectural stage. [paraphrased:C130]
It has the analyst decide the ground rules before the analysis starts and leave no assumption unwritten, and its own sample rules keep human-error failure modes out of scope. [paraphrased:C130]
It lists the technique's problems plainly: time-consuming, tedious, manual, dependent on the analyst's knowledge and on the accuracy of the documentation, and of questionable benefit given an incomplete failure-mode list. [paraphrased:C130]
It says software never wears out: an item is either working or already broken with nobody aware of it. [paraphrased:C127]
The page makes that point to contrast how software and hardware faults show up, and draws no rule for rating occurrence from it. [paraphrased:C127]
The page attributes its failure-mode definition to IEEE Std 610.12-1990, though only its manifestation clause is in that glossary; the sense carried is the kind of defect behind a failure, together with how that failure shows up. [paraphrased:C127]
Its canonical software examples of a failure mode are a data value out of limits and garbled data. [paraphrased:C127]

### Neufelder

The second edition of *Effective Application of Software Failure Modes Effects Analysis* covers eight SFMEA viewpoints: requirements or functional, interface design, detailed design and code, vulnerabilities, corrective actions or maintenance, serviceability, usability, and development processes. [paraphrased:C116]
Its process viewpoint is the development process, not runtime operations. [paraphrased:C116]
Nothing in that viewpoint stands in for an FMEA of runtime operations. [skill-authored]
The book treats software failure modes as their own subject — faulty functionality, data, timing, sequencing and error handling among them — rather than as a re-skin of hardware categories. [paraphrased:C117]
It separates three mitigation constructs, preventive measure, compensating provision and corrective action, whose definitions the corpus never read. [paraphrased:C120]
The 2022 Common Defect Enumeration deck rejects the hardware-centric pattern that lists a software item's failure modes as failing to execute or terminating: those two, the deck asserts, with no method shown, account for under one per cent of software failures, and line-by-line analysis is ineffective because very few failures come from a single line of code. [paraphrased:C103]
Its recommended procedure is to prune the defect list to what the system actually contains and then analyse the specification and design package as a whole against what remains. [paraphrased:C103]
Its identifier scheme runs architectural level, failure mode, root-cause number, artifact and artifact number, over four levels — top, capability, single-specification and interface — with artifacts of specification, design or code, each by omission or commission. [paraphrased:C102]
The deck's claim that more than half of the defects labelled coding originate in specification or design rests on an unpublished vendor dataset, so this skill carries the pruning procedure and not the figure. [paraphrased:C102] [skill-authored]

### Where they disagree

| Question | NASA | Neufelder | What v1 does | Provenance |
|---|---|---|---|---|
| Is a software FMEA the hardware procedure? | Yes: the hardware method with software substituted, on MIL-STD-1629's steps | No: that pattern is hardware-centric and ineffective for software | Keeps the procedural spine, takes its failure modes from a software catalog pruned to the system | [paraphrased:C106] [paraphrased:C126] [paraphrased:C103] [skill-authored] |
| What is analysed | Components suggested per lifecycle phase, only preliminary at architecture stage | The specification and design package as a whole, never line by line | Typed elements and their functions; a catalog row enters only against a named element | [paraphrased:C130] [paraphrased:C103] [skill-authored] |
| Rating factors | Severity by likelihood, no numeric detection, no RPN | Severity and likelihood into an RPN in the book; severity, likelihood and detectability into an RPN in the 2022 deck | Three factors, S, O and D on 1 to 10, with anchors the skill authors | [paraphrased:C109] [paraphrased:C129] [paraphrased:C118] [paraphrased:C104] [skill-authored] |
| Detection | A free-text detectability column and a failure detection mechanism named per mode, never multiplied into the priority | A detectability factor in the deck; no separate detection step in the book's procedure | A numeric D anchored on the earliest control layer that reliably catches the mode | [paraphrased:C109] [paraphrased:C129] [paraphrased:C104] [paraphrased:C118] [skill-authored] |
| Who fixes the scales | Each project and Center defines its own; one document carries three incompatible risk-index scales | The book's procedure has the analyst define the severity and likelihood rankings; the 2022 deck publishes no scale, and its two worked rows carry ratings between 1 and 10 | One shipped 1 to 10 set, versioned, plus a slot for a user-supplied priority table | [paraphrased:C109] [paraphrased:C118] [paraphrased:C104] [skill-authored] |

NASA declares its procedure based on MIL-STD-1629. [paraphrased:C126] The book still ends in a Critical Items List. [paraphrased:C118]
IEEE 1633-2016 and the Neufelder material are not two independent corroborations of the same practice on the standards side: the IEEE 1633 Software Reliability Working Group was chaired by Ann Neufelder, the author of the book and the deck, so the two are one author lineage. [paraphrased:C098]

## The seven-step spine

The spine is taken from an existing Claude skill, not from the handbook, because the handbook's step definitions are unread. [skill-authored]
Its seven steps are the sequence that skill implements under its own step headings, and none of its wording is carried here. [adapted-from:C086]
Attribution for the origin of that sequence: ddunnock/claude-plugins, `skills/fmea-analysis/SKILL.md`, MIT licence, Copyright (c) 2026 David Dunnock; the license text ships at `licenses/MIT-ddunnock-claude-plugins.txt` beside this `references/` directory. [paraphrased:C086] [skill-authored]
This skill runs the same sequence under its own step names — Plan, Structure, Function, Failure, Rate, Act, Document. [skill-authored]
The sequence is reused as method structure and carries direct transfer status; none of it is handbook text, and no handbook step definition is claimed. [skill-authored]
The same prior-art skill also ships reconstructed rating tables under standard citations that cannot be resolved against the handbook. [paraphrased:C088]
That is why no rating table of its is taken, only its step sequence and, under Ruling D2, its severity-first reasoning. [skill-authored]

## Transfer status of every classical rule the skill uses

Four statuses, and no others: **direct**, the rule is used as the corpus states it; **adapted**, it is changed for software or for this data model; **new**, the skill takes it from no record in the corpus, and where a cite-only document has a parallel, the row records it as a parallel only; **not applicable**, a classical rule deliberately unused in v1, whether or not the corpus reaches its content. [skill-authored]
A status is a claim about this skill's use of a rule, not about that rule's standing in its own document. [skill-authored]

| Classical rule | Status | What v1 does with it | Provenance |
|---|---|---|---|
| The seven-step spine, planning through documentation | direct | Run as Plan, Structure, Function, Failure, Rate, Act, Document | [adapted-from:C086] [skill-authored] |
| Structure analysis: decompose the item into components | adapted | Five element roles with hierarchical dotted ids, depth 1 to 4 [skill-authored]; a boundary attribute (in scope, owned outside, third party) drawn from the workload-scope line the Azure and AWS guidance use [adapted-from:C143] [adapted-from:C146] and the external-interface notion of MIL-STD-1629A [adapted-from:C134]; a security-relevance flag by NIST's reliance test [cites:C157]; NASA's per-phase granularity [paraphrased:C130] informs which level a run stops at, and the depth cap is the skill's own [skill-authored] | [adapted-from:C143] [adapted-from:C146] [adapted-from:C134] [cites:C157] [paraphrased:C130] [skill-authored] |
| Functions identified per element, after the item is decomposed | direct | `functions[]` keyed by id, each carrying a statement, its conditions and for whom, and owned by one element [skill-authored]; the order, Structure then Function, is the sequence the prior-art spine runs [adapted-from:C086]; IEC places its function step at 5.3.3, directly after the item is divided into elements, recorded here as a parallel only [cites:C055] | [adapted-from:C086] [cites:C055] [skill-authored] |
| Functional block diagrams as a step of their own | not applicable | A structure tree of typed elements with a function statement per element replaces the diagram [skill-authored]; the step belongs to the MIL-STD-1629 sequence NASA carries [paraphrased:C106] | [paraphrased:C106] [skill-authored] |
| Ground rules decided and assumptions written before the analysis | direct | `meta.ground_rules[]` and `meta.assumptions[]`, each assumption with an owner and an open or closed status | [paraphrased:C130] [skill-authored] |
| NASA's sample ground rule excluding human-error failure modes | not applicable | Each analysis writes its own ground rules; the sample rules are hardware-scoped and not carried | [paraphrased:C130] [skill-authored] |
| Failure chain: mode, then effects, then causes | adapted | `failure_mode`, `effects`, `causes[]` per row; identifying modes and evaluating each by its consequence is NASA's step order [paraphrased:C126]; the causes column's place inside the Failure step is the skill's own [skill-authored], and IEC's separate causes clause at 5.3.7 is recorded here as a parallel only [cites:C055] | [paraphrased:C126] [cites:C055] [skill-authored] |
| Severity rated on the worst consequence | adapted | S is rated on the end effect, `effects.end`, the level the schema names for Severity | [paraphrased:C106] [paraphrased:C126] [skill-authored] |
| Cause classified by originating artifact (specification, design, code) | adapted | `causes[].origin`, optional; omission versus commission is not carried | [paraphrased:C102] [skill-authored] |
| Effects recorded at more than one level | new | Three levels, local, next level and end user [skill-authored]; IEC records local and final effects [cites:C055] and the middle level is the skill's own [skill-authored] | [cites:C055] [skill-authored] |
| Controls identified before the evaluation step | new | Step 4 records controls before Step 5 rates, because Detection is keyed on the controls a row carries [skill-authored]; IEC's own order, controls and the means of detecting a failure identified at 5.3.5 ahead of the evaluation at 5.3.8, is recorded here as a parallel only [cites:C055] | [cites:C055] [skill-authored] |
| Detection methods and compensating provisions recorded per failure mode | adapted | `controls[]` entries carrying a kind, a status of existing or planned, and an evidence kind [skill-authored]; the classical pairing comes from the MIL-STD-1629 step NASA carries [paraphrased:C126] | [paraphrased:C126] [skill-authored] |
| The control-kind composition: prevention, detection, compensating | new | The three-way split is the skill's own composition [skill-authored]. IEC 60812:2018 defines one undifferentiated control and records compensating provision as another name for it, with no prevention-versus-detection split [cites:C055]. Prevention and detection reach the corpus as the handbook's separate Step 6 prevention and detection actions, each with its own status, as a C064 verifier records [paraphrased:C064]. `compensating` carries Neufelder's third construct, whose definition the corpus never read [paraphrased:C120], and her corrective action is an `actions[]` entry rather than a control kind [skill-authored] | [cites:C055] [paraphrased:C064] [paraphrased:C120] [skill-authored] |
| `trigger`, the initiating event or condition under which a mode is exercised | new | A chain-level field with no counterpart on any classical form in the corpus; no closed trigger vocabulary is sourced, so it has no kind sub-field, and its evidence basis sits in `scales-software.md` and `design-failure-catalog.md` | [skill-authored] |
| Numeric ratings on a 1 to 10 scale | adapted | S, O and D each 1 to 10, each with a mandatory rationale and evidence kind; the 2022 deck's worked rows carry ratings between 1 and 10 [paraphrased:C104], and the software anchors are the skill's own, since no document in the corpus supplies them [skill-authored] | [paraphrased:C104] [skill-authored] |
| Detection as a numeric factor | adapted | Kept and anchored on the earliest control layer that catches the mode [skill-authored]; the deck keeps a detectability factor [paraphrased:C104] while NASA's SFMEA has no numeric detection at all [paraphrased:C129] | [paraphrased:C104] [paraphrased:C129] [skill-authored] |
| Occurrence as a failure rate over time | not applicable | v1 does not anchor O on a failure rate [skill-authored]; the June 2020 errata also struck the handbook's sole time-based occurrence table [paraphrased:C065]; O is anchored on exposure instead [skill-authored] | [paraphrased:C065] [skill-authored] |
| RPN as the product of the three ratings | direct | Stored as `priority.rpn`, equal to S times O times D, kept for reference only and never used to rank | [paraphrased:C104] [skill-authored] |
| Severity-first prioritization in place of RPN ranking | adapted | A severity-first table the skill owns at `data/priority-fmea-software-v1.json`, whose bands and cells make no claim to be any standard's | [adapted-from:C086] [skill-authored] |
| Action Priority as a closed set of values | adapted | Priority is a value plus the id of the table it came from [skill-authored]; the errata leaves the handbook's set at exactly H, M and L [paraphrased:C062], while deployed tooling extends the range per catalog and maps ratings to an OEM's own priority levels [paraphrased:C122] | [paraphrased:C062] [paraphrased:C122] [skill-authored] |
| The handbook's Action Priority table itself | not applicable | Never shipped and never reconstructed; a licensed copy drops in at run time through `--table-file` | [skill-authored] |
| The five-value action status vocabulary | direct | `actions[].status` is Open, Decision pending, Implementation pending, Completed, Not Implemented, the post-errata enumeration with Discarded replaced and the Filter Code column gone | [paraphrased:C063] |
| The no-action invariant on a row | adapted | Where no action is taken the risk and the priority are unchanged [paraphrased:C064]; v1 encodes it more strictly, allowing `post_ratings` only once some action on the row is Completed, so an unchanged row has none [skill-authored] | [paraphrased:C064] [skill-authored] |
| Re-rating after actions | adapted | One row-level `post_ratings` block, present only once an action on the row is Completed, with `post_priority` computed from it by the same table | [paraphrased:C118] [skill-authored] |
| Criticality categories keyed to redundancy or single-point failure | not applicable | Redundancy and single-point failure are recorded in causes and controls, not as a criticality category field | [paraphrased:C129] [skill-authored] |
| The Critical Items List | not applicable | The report's chain table, sorted by priority then severity, stands in its place | [paraphrased:C118] [skill-authored] |
| Pruning a defect catalog to what the system contains | direct | A catalog row enters an analysis only when tied to a named element and function and rewritten for it | [paraphrased:C103] [skill-authored] |
| Listing a software item's modes as failing to execute or terminating, and line-by-line analysis | not applicable | Both are rejected in the corpus itself and neither is offered by the catalog | [paraphrased:C103] [skill-authored] |
| Bi-directional analysis, an SFMEA paired with a software fault tree | not applicable | v1 ships no fault tree; the pairing is recorded as prior art only | [paraphrased:C106] [skill-authored] |
| MIL-STD-1629A's worksheet column set | not applicable | No worksheet record is in the evidence base, so the report and conversion column set is the skill's own | [skill-authored] |
| PFMEA scoped to manufacturing and assembly processes | not applicable | The design side is v1; the process side is a stub that names this scope mismatch as the reason software delivery is an adaptation rather than a transfer | [paraphrased:C082] [skill-authored] |
| FMEA-MSR | not applicable | J1739 carries it as one of its three FMEA types; v1 has no MSR branch | [paraphrased:C082] [skill-authored] |

## The four-way prioritization split

Four prioritization shapes reach the corpus, and no two of them agree. [skill-authored]

| Shape | What it prioritizes on | What it lacks | Provenance |
|---|---|---|---|
| AIAG-VDA, as implemented by the prior-art skill | Three factors with Action Priority replacing RPN, severity leading, occurrence next and detection last; H must act, M should act or justify the current controls, L acts at discretion; RPN kept only for legacy comparison | The handbook's own table is unread here, so no cell value is available to this skill and none ships [skill-authored]; after the June 2020 errata the handbook's value set is H, M and L alone, and N/A is not among them [paraphrased:C062] | [paraphrased:C086] [paraphrased:C062] [skill-authored] |
| IEC 60812:2018 | Mandates no prioritization method; its informative Annex B offers a criticality matrix, the risk priority number and an alternative risk priority number | No Action Priority table, and none of the informative Annex B methods is transferred here | [cites:C054] [skill-authored] |
| NASA | A severity by likelihood risk matrix yielding a risk index, plus MIL-STD-1629-style criticality categories keyed to redundancy or single-point failure | No numeric detection factor, no RPN, no Action Priority; and one document carries three incompatible risk-index scales while telling each project and Center to define its own | [paraphrased:C109] [paraphrased:C129] |
| Neufelder | Book: severity and likelihood rolled into an RPN, ending in a Critical Items List. Deck: severity, likelihood as the average of a manifestation and a controls sub-rating, and detectability, multiplied into an RPN | The book's procedure has no separate detection step [paraphrased:C118]; the deck folds a numeric controls sub-rating into likelihood and keeps detectability as a separate factor, with no prevention or detection control columns [paraphrased:C104] | [paraphrased:C118] [paraphrased:C104] |

Both software lineages are two-factor at heart: NASA multiplies nothing and reads severity against likelihood in a matrix, and the book-era Neufelder method rates severity and likelihood only. [paraphrased:C109] [paraphrased:C129] [paraphrased:C118]
Deployed tooling adds a further data point, on the value set rather than on the method: an AP catalog can extend the range beyond L, M and H, an OEM catalog maps S, O and D to its own risk priority level, and the same values can be displayed as numbers. [paraphrased:C122]

### Why severity-first

Ruling D2: three ratings on 1 to 10 with software anchors the skill authors, a rationale and an evidence kind on every rating, a severity-first priority table the skill owns, and RPN computed for reference only. [skill-authored]
The reason severity leads is the one the prior-art skill gives for Action Priority: a product of three factors lets a high-severity row be outranked by low occurrence and low detection, whereas a severity-first table keeps such a row from being ignored. [paraphrased:C086]
What NASA and the book-era Neufelder method carry is two factors apiece, with detection never multiplied into the priority. [paraphrased:C109] [paraphrased:C118]
Putting severity first is this skill's own ruling and is inherited from neither of them. [skill-authored]
Detection stays as a third factor even though NASA's SFMEA has none, because this skill keys Detection on the controls a row actually carries. [paraphrased:C129] [skill-authored]
That keying is the skill's own: no standard in the corpus, IEC included, binds a control class to a rating column. [cites:C055] [skill-authored]
Priority is written as a value plus the id of the table it came from, never as a closed enum, because deployed tooling declares its vocabulary per catalog. [paraphrased:C122]
The shipped vocabulary is H, M, L in that order, which coincides with the handbook's post-errata value set without carrying a single one of its cells. [paraphrased:C062] [skill-authored]
The table's bands, cell map and properties make no claim to be any standard's and are tested as properties, not as a reproduction; a licensed table supplied at run time replaces it without changing any rule here. [skill-authored]
RPN is stored for reference and never ranks anything, so a row's place in the report is decided by its priority from the table, then by severity, and never by RPN. [skill-authored]

## What this file never carries

No AIAG-VDA handbook cell value of any kind, from any table, in any form. [skill-authored]
No IEC 60812 text, paraphrased or adapted: statements resting on IEC records carry `cites:` and nothing else. [skill-authored]
No Google SRE Book text, adapted or paraphrased. [skill-authored]
Nothing specific to a consuming application: no service name, team name, incident id or architecture detail from any real system. [skill-authored]
