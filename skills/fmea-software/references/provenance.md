# Provenance: tags, permissions and the source register

Every sourced statement in a reference file cites a record id; every unsourced statement is tagged `skill-authored`. [skill-authored]
An untagged sentence is a defect, and so is a tag the cited record's source status does not permit. [skill-authored]
This file is the rule the rest of the build is checked against: the tag vocabulary, the permission table keyed on source status, and the register that gives each of the 39 sources, in 44 rows, its status. [skill-authored]
Records are cited, never findings: a record id `C###` is verified evidence, a finding id `F-WSn-NN` is the research report's synthesis and is not a citable unit. [skill-authored]

## Tag vocabulary

| Tag | What it claims | Provenance |
|---|---|---|
| `sourced:C###` | The words are reproduced from the source, under a license that permits reproduction. | [skill-authored] |
| `paraphrased:C###` | The source's content, restated in other words. | [skill-authored] |
| `adapted-from:C###` | The source's content, changed for this domain. | [skill-authored] |
| `cites:C###` | Text authored by the skill that names the record for the concept only; no wording, selection or arrangement is derived from the source. | [skill-authored] |
| `skill-authored` | Nothing from any source. | [skill-authored] |

The record id is the letter `C` followed by three digits; the five tags above are the whole vocabulary, and no sixth tag exists. [skill-authored]
The analysis JSON carries the same grammar: a chain's catalog reference stores the catalog row's tag, and the report's provenance appendix prints every entry. [skill-authored]

## Tag syntax

A tag sits in square brackets at the end of the sentence, bullet or table cell it covers. [skill-authored]
A statement resting on several records carries several brackets, one per record. [skill-authored]
A table row's tag sits in its last column, headed `Provenance`; every table in every reference file carries that column, with one exemption named below. [skill-authored]
Every sentence of prose belongs to exactly one tagged statement; a sentence with no tag is reported by the checker as untagged. [skill-authored]

## Tag-permission rule

Each source has one status, and that status decides which tags a statement citing that source's records may carry, mechanically, without judgement. [skill-authored]

| Source status | Permitted tags | Barred tags | Condition on use | Provenance |
|---|---|---|---|---|
| reproduce | `sourced:` `paraphrased:` `adapted-from:` `cites:` | none | Anything tagged `sourced:`, `paraphrased:` or `adapted-from:` carries the attribution elements the license requires, held in the citing file's attribution block or in the source's entry in the skill's `licenses/NOTICES.md`, and changed text also indicates the changes. | [skill-authored] |
| paraphrase-only | `paraphrased:` `adapted-from:` `cites:` | `sourced:` | No passage of the source's prose is reproduced; its names, titles, terms of art and short lists of labels may be carried word for word, with citation. | [skill-authored] |
| cite-only | `cites:` | `sourced:` `paraphrased:` `adapted-from:` | Name the record for the concept; take no passage of the source's prose and no arrangement of it, beyond the names, titles, terms of art and short lists of labels the rule below allows word for word with the citation. | [skill-authored] |
| public domain | `sourced:` `paraphrased:` `adapted-from:` `cites:` | none | Anything reproduced carries the government-work note, which names the document and the basis of its public-domain status. | [skill-authored] |
| unknown | `cites:` `adapted-from:` | `sourced:` `paraphrased:` | Facts and category labels only, with attribution; the register marks the source unchecked. | [skill-authored] |

Reading a status: in the 26 bibliography rows, the register's License status cell holds the research report's own words, and the Treatment cell holds the operative treatment those words resolve to in v1; the 18 element-kinds rows take their status from the records of their range, as the element-kinds design §6.2 and Appendix A record. [skill-authored]
Where the two differ, the Treatment cell governs, and the Permitted tags cell is derived from it, not from the License status wording. [skill-authored]
Each bracket is checked against the status of its own record's source; a statement resting on several records carries one bracket per record, each within what that record's source permits. [skill-authored]
A statement whose source status is `unknown` names the source in the sentence itself, because attribution is the condition on which the fact is usable at all. [skill-authored]
A source's names, titles, terms of art and short lists of labels may appear word for word under any status, with the citation the statement already carries, and they do not make a statement `sourced:`. [skill-authored]
A clause or sentence of a source's prose is wording, and the rule above applies to it in full. [skill-authored]
Generic industry terms, such as Failure Mode and Effects Analysis, belong to no source and need no citation. [skill-authored]
The source register may quote a source's copyright or license notice, because there the notice states that source's license. [skill-authored]

## Refuted records

Every record carries a verification of confirmed or refuted. [skill-authored]
A refuted record may be named only as a claim that failed verification, never as a fact about the world; citing one as fact is the defect kind `refuted-cited-as-fact`. [skill-authored]
The tag on such a statement is still `cites:`, and the sentence says the record was refuted. [skill-authored]

## The source register

The first 26 rows follow the research report's §9 bibliography, one per source, with the record range that source produced; later rows are added, one per record range, as a research run admits a source. [skill-authored]
A source that was fetched as more than one document or page has one row per range, so the same source can appear in more than one row. [skill-authored]
The 26 bibliography rows are license statements about the sources themselves, taken from the report's bibliography and license lines rather than from any record's claim; the 18 element-kinds rows take their status from the records of their range, as the element-kinds design §6.2 and Appendix A record. [skill-authored]
Either way a row states a source's license and not a record's claim, so this table alone carries no `Provenance` column and its rows carry no tag. [skill-authored]
The Address column carries the web address the source's records share, so a record id can be traced to its source without the records file. [skill-authored]

| Source | Address | License status | Treatment | Permitted tags |
|---|---|---|---|---|
| The VOID / Courtney Nash on incident metrics, InfoQ (C001–C005) | https://www.infoq.com/articles/incident-metrics-void/ | proprietary-paraphrase-only (Verica vendor report, free download, no open licence located; InfoQ article quotable with attribution). | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| dora.dev, DORA's software delivery performance metrics (C006–C010) | https://dora.dev/guides/dora-metrics/ | open (CC BY 4.0, Google LLC). | Reproduce with the CC BY 4.0 attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Azure Well-Architected Framework, failure mode analysis RE:03 (C011–C015) | https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis | proprietary-paraphrase-only (Microsoft Learn conceptual documentation; verifiers record it as Microsoft copyright and recommend paraphrase with citation). | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| Google SRE Book, Appendix E, Launch Coordination Checklist (C016–C020) | https://sre.google/sre-book/launch-checklist/ | proprietary-paraphrase-only (CC BY-NC-ND 4.0, Copyright © 2017 Google, Inc.). | Cite-only in v1: no reproduction, no paraphrase, no adaptation. | `cites:` |
| Google SRE Book, Ch. 32, The Evolving SRE Engagement Model (C021–C025) | https://sre.google/sre-book/evolving-sre-engagement-model/ | proprietary-paraphrase-only (CC BY-NC-ND 4.0, Copyright © 2017 Google, Inc.). | Cite-only in v1. | `cites:` |
| Yuan et al., Simple Testing Can Prevent Most Critical Failures, OSDI '14 (C026–C030) | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf | unknown (not in evidence); verifiers record USENIX open-access proceedings that are free to download and advise checking the specific reuse license before reproducing figures or tables. | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| Bronson et al., Metastable Failures in Distributed Systems, HotOS '21 (C031–C035) | https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf | proprietary-paraphrase-only (ACM copyright recorded on p. 221; verifiers permit short cited quotation only). | Paraphrase or adapt with citation. | `paraphrased:` `adapted-from:` `cites:` |
| Google SRE Book, Ch. 22, Addressing Cascading Failures (C036–C040) | https://sre.google/sre-book/addressing-cascading-failures/ | open (CC BY-NC-ND 4.0), with NonCommercial and NoDerivatives restrictions that make it unusable as a source of shipped adapted text. | Cite-only in v1. | `cites:` |
| MIL-STD-1629A Notice 3, Notice of Cancellation, DoD ASSIST (C041–C045) | https://quicksearch.dla.mil/WMX/Default.aspx?token=114346 | public domain. Verifiers found no copyright or distribution notice in either document and identified the basis as US government work. | Reproduce with the government-work note; nothing is reproduced from it in v1. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Nygard, Release It! Second Edition, Pragmatic Bookshelf, 2018 (C046–C050) | https://pragprog.com/titles/mnee2/release-it-second-edition/ | proprietary-paraphrase-only; the excerpt carries "Copyright (c) 2018 The Pragmatic Programmers, LLC. All rights reserved. No part of this publication may be reproduced, stored in a retrieval system, or transmitted, in any form". | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| IEC 60812:2018 Edition 3.0, sample pages with full table of contents (C051–C055) | https://cdn.standards.iteh.ai/samples/21903/331059ef02794b548d049d58b18e456f/IEC-60812-2018.pdf | proprietary-paraphrase-only. | Cite-only in v1; see the IEC 60812 entry below. | `cites:` |
| Gunawi et al., Why Does the Cloud Stop Computing?, SoCC '16 (C056–C060) | https://dl.acm.org/doi/10.1145/2987550.2987583 | unknown (not in evidence); the verifiers read the author-hosted copy at ucare.cs.uchicago.edu and record no copyright or license notice. | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| AIAG & VDA FMEA Handbook 1st Edition English Translation Errata Sheet, June 2020 (C061–C065) | https://www.aiag.org/docs/default-source/training-and-resources/errata-documents/aiag-vda-fmea-handbook-errata-june-2020.pdf?sfvrsn=498e0c1f_1 | proprietary-paraphrase-only. The errata sheet carries no notice of its own, but it quotes handbook text that AIAG and VDA assert copyright over. | Paraphrase with citation; no handbook cell value of any kind. | `paraphrased:` `adapted-from:` `cites:` |
| Nair et al., Use of Large Language Models to Enhance FMEA, Adv Radiat Oncol (C066–C070) | https://pmc.ncbi.nlm.nih.gov/articles/PMC13235337/ | open (CC BY 4.0, PMC full text). | Reproduce with the CC BY 4.0 attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| El Hassani et al., AI-driven FMEA, Design Science, 2025 (C071–C075) | https://www.cambridge.org/core/journals/design-science/article/aidriven-fmea-integration-of-large-language-models-for-faster-and-more-accurate-risk-analysis/22F110A2BF0DB4D01A69472CF17A0B43 | open (CC BY 4.0; Crossref license URL http://creativecommons.org/licenses/by/4.0 effective 2025-04-14). | Reproduce with the CC BY 4.0 attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Howie: The Post-Incident Guide, Jeli, hosted by PagerDuty (C076–C080) | https://howie-guide.pagerduty.com/ | open (Apache-2.0, Copyright 2024 PagerDuty, Inc.). | Reproduce or adapt with the Apache-2.0 attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| SAE J1739_202605, Potential FMEA, Stabilized May 2026 (C081–C085) | https://saemobilus.sae.org/standards/j1739_202605-potential-failure-mode-effects-analysis-fmea-including-design-fmea-supplemental-fmea-msr-process-fmea | proprietary-paraphrase-only. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| ddunnock/claude-plugins fmea-analysis SKILL.md, the inspiration skill (C086–C090) | https://github.com/ddunnock/claude-plugins/blob/main/skills/fmea-analysis/SKILL.md | open (MIT, "Copyright (c) 2026 David Dunnock", repo LICENSE fetched at /main/LICENSE). | Reproduce or adapt with the MIT attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Georgieva, Conducting FMEA over the software development process, ACM SIGSOFT SEN 35(3), 2010 (C091–C095) | https://dl.acm.org/doi/10.1145/1764810.1764819 | proprietary-paraphrase-only (ACM copyright; abstract quoted, body closed access). | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| IEEE 1633-2016, IEEE Recommended Practice on Software Reliability (C096–C100) | https://standards.ieee.org/ieee/1633/5726/ | proprietary-paraphrase-only. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| Neufelder, The Software Common Defect Enumeration, 2022 SRE Huntsville deck (C101–C105) | https://srehsv.com/wp-content/uploads/2022/11/6thSession_A6_Neufelder.pdf | proprietary-paraphrase-only. Copyright notice on every slide reads "Copyright Mission Ready Software, 2022". | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| NASA-GB-8719.13, NASA Software Safety Guidebook, 2004 (C106–C110) | https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/0/nasa-gb-871913.pdf | public domain. Verifiers record it as a US Government work, freely reproducible, hosted at standards.nasa.gov. | Reproduce with the government-work note. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Dokas, From hallucinations to hazards, Safety Science 194, 2026 (C111–C115) | https://www.sciencedirect.com/science/article/pii/S0925753525002814 | open (CC BY 4.0 on the version of record). | Reproduce with the CC BY 4.0 attribution elements. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Neufelder, Effective Application of Software FMEA, 2nd ed., Quanterion Solutions (C116–C120) | https://www.quanterion.com/product/publications/effective-application-of-software-failure-modes-effects-analysis/ | proprietary-paraphrase-only. The page states verbatim: "This publication is protected by U.S. Copyright Law and may not be copied, automated, re-sold, or re-distributed in part or in whole, without the express written permission of Ann Marie Neufelder." Hardcopy only, 256 pages, SKU 1-933904-80-1, $125. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| APIS IQ-Software 8.0 release notes, MSR FMEA exchange format (C121–C125) | https://www.apis.de/en/info/service-packs/8-0 | proprietary-paraphrase-only. The page carries a 2026 APIS copyright notice. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| NASA Software Engineering Handbook, SWEHB Ver C, topic 8.05 (C126–C130) | https://swehb.nasa.gov/display/SWEHBVC/8.05+-+SW+Failure+Modes+and+Effects+Analysis | public domain (the NASA page; the IEEE Std 610.12-1990 clause it quotes stays IEEE-owned, as the verifiers record). | Reproduce with the government-work note; the quoted IEEE clause stays paraphrase-only. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| MIL-STD-1629A, Procedures for Performing a Failure Mode, Effects and Criticality Analysis, the standard's body, NASA KSC copy (C131–C134) | https://extapps.ksc.nasa.gov/reliability/Documents/milstd1629_FMEA.pdf | public domain. A US Government work, read from the copy hosted by NASA Kennedy Space Center. | Reproduce with the government-work note, as the licence permits; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| NASA Software Engineering Handbook, SWEHB Ver D, topic 8.05 (C135) | https://swehb.nasa.gov/display/SWEHBVD/8.05+-+SW+Failure+Modes+and+Effects+Analysis | public domain. | Reproduce with the government-work note, as the licence permits; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| NASA-GB-8719.13, NASA Software Safety Guidebook, Appendix D, Software FMEA (C136–C138) | https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/0/nasa-gb-871913.pdf | public domain. A US Government work, hosted at standards.nasa.gov. | Reproduce with the government-work note, as the licence permits; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Neufelder, Effective Application of Software FMEA, 2nd ed., Quanterion product page (C139) | https://www.quanterion.com/?p=3511 | proprietary-paraphrase-only, the status the row for C116–C120 records for the same book, whose page there states that the publication is protected by U.S. copyright. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| Haapanen and Helminen, Failure mode and effects analysis of software-based automation systems, STUK-YTO-TR 190, 2002 (C140–C141) | https://www.julkari.fi/bitstreams/3f68dd3d-2412-47b1-a594-0a2ca744f2ec/download | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| Azure Well-Architected Framework, failure mode analysis RE:03, the 2026 page (C142–C144) | https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis | proprietary-paraphrase-only (Microsoft Learn conceptual documentation; verifiers record it as Microsoft copyright and recommend paraphrase with citation), the status the row for C011–C015 records for the same page. | Paraphrase with citation. | `paraphrased:` `adapted-from:` `cites:` |
| Treynor, Dahlin, Rau and Beyer, The Calculus of Service Availability, ACM Queue 15(2), the sre.google-hosted PDF (C145) | https://sre.google/static/pdf/calculus_of.pdf | unknown (no licence notice in evidence for the PDF). | Unchecked. Cite-only in v1, because the PDF is hosted on sre.google. | `cites:` |
| AWS Well-Architected Framework, Reliability Pillar, REL05-BP01 (C146) | https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_graceful_degradation.html | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| Hernan, Lambert, Ostwald and Shostack, Uncover Security Design Flaws Using The STRIDE Approach, MSDN Magazine, November 2006 (C147–C149) | https://learn.microsoft.com/en-us/archive/msdn-magazine/2006/november/uncover-security-design-flaws-using-the-stride-approach | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| Osterman, Threat Modeling Again, STRIDE per Element, Microsoft blog archive, 2007 (C150) | https://learn.microsoft.com/en-us/archive/blogs/larryosterman/threat-modeling-again-stride-per-element | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| OWASP Threat Dragon documentation, Threat categories (C151) | https://www.threatdragon.com/docs/usage/threat-categories.html | open (Apache-2.0, per the OWASP Threat Dragon repository). | Reproduce or adapt with the Apache-2.0 attribution elements, as the licence permits; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| OWASP Threat Modeling Cheat Sheet (C152) | https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html | open (CC BY-SA 4.0). | Cite-only by the user's ruling of 2026-10-07, until a reading of ShareAlike is recorded. | `cites:` |
| Brown, The C4 model, the Abstractions and Queues and topics pages (C153–C154) | https://c4model.com/abstractions and https://c4model.com/abstractions/queues-and-topics | open (CC BY 4.0, Simon Brown). | Reproduce with the CC BY 4.0 attribution elements, as the licence permits and the C4 model entry in `licenses/NOTICES.md` gives them; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| arc42, Section 5, Building Block View (C155) | https://docs.arc42.org/section-5/ | open (CC BY-SA 4.0). | Cite-only by the user's ruling of 2026-10-07, until a reading of ShareAlike is recorded. | `cites:` |
| NIST SP 800-53 Rev. 5, controls SC-3 and SA-17(2) (C156–C157) | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf | public domain. A US Government work. | Reproduce with the government-work note, as the licence permits; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07. | `sourced:` `paraphrased:` `adapted-from:` `cites:` |
| Common Criteria for Information Technology Security Evaluation, Part 1, v3.1 Rev. 5 (C158) | https://www.commoncriteriaportal.org/files/ccfiles/CCPART1V3.1R5.pdf | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| Chockalingam et al., Integrated Safety and Security Risk Assessment Methods: A Survey, arXiv 1707.02140 (C159) | https://arxiv.org/pdf/1707.02140 | unknown (not in evidence). | Unchecked. Cite findings and category labels as facts with attribution; reproduce nothing. | `cites:` `adapted-from:` |
| NIST CSRC Glossary, system element (C160) | https://csrc.nist.gov/glossary/term/system_element | public domain (the NIST page; the definition it gives is ISO/IEC/IEEE 15288's). | Paraphrase or adapt with citation; nothing from the range is reproduced in this version, by the user's ruling of 2026-10-07, and a later ruling may restore reproduction with the government-work note; the quoted definition is ISO/IEC/IEEE 15288's and stays paraphrase-only. | `paraphrased:` `adapted-from:` `cites:` |

## IEC 60812:2018

IEC 60812:2018 is cite-only in v1: facts about the document's structure, taken from its free 15-page preview, are cited, and no IEC text is paraphrased into skill content. [cites:C051] [cites:C052]
IEC holds the copyright and grants no reuse; the free sample runs 15 pages and the rest of the document is paywalled. [cites:C052]
The IEC Webstore terms bar use of IEC publications for developing a software program or AI tool without written permission, and state no quotation exemption. [cites:C052]
That clause, not the paywall alone, is why v1 takes nothing from IEC 60812 beyond citations. [skill-authored]
User ruling on v1 scope, recorded 2026-09-11: IEC 60812:2018 is cite-only. [skill-authored]
A statement citing C051–C055 carries `cites:` and nothing else. [skill-authored]

## MIL-STD-1629A

MIL-STD-1629A is public domain under US government-work rules; the cancellation notice carries no distribution restriction, copyright or licensing statement, so its status rests on those rules rather than on anything the document says. [paraphrased:C045]
Government-work note, the template attached to anything reproduced from any public-domain source in the register: *Reproduced from <document>, a work of the United States Government; public domain in the United States.* [skill-authored]
`<document>` is that source's own name — MIL-STD-1629A, NASA-GB-8719.13, or the NASA Software Engineering Handbook (SWEHB Ver C) — so a `sourced:C110` or `sourced:C130` statement in another reference file carries the note with that name in it. [skill-authored]
Records C131 to C134 are read from the standard's body, so MIL-STD-1629A content is citable through them; nothing is reproduced from it in this version, so no statement carries the note with that document's name. [skill-authored]
The evidence base holds the cancellation notice, the base document's cover and foreword in verifier evidence, and, since the element-kinds research of 2026-10-07, the standard's body as records C131 to C134: the standard, dated 24 November 1980, was cancelled on 4 August 1998, and the notice names no successor, directing users generically to national and international FMECA documents. [paraphrased:C041] [paraphrased:C042] [paraphrased:C043] [paraphrased:C045] [cites:C131]

## dora.dev, CC BY 4.0

The dora.dev metrics page states: "DORA is a program run by Google Cloud." [sourced:C010] It continues: "All content on this site is licensed by Google LLC under CC BY 4.0, unless otherwise specified." [sourced:C010]
Anything tagged `sourced:`, `paraphrased:` or `adapted-from:` from dora.dev carries the attribution elements CC BY 4.0 requires: the author's name, Nathen Harvey; the page's title and address; a link to the CC BY 4.0 license; and a note of any changes made to the text. [paraphrased:C010]
The grant is per page, because of the *unless otherwise specified* clause, and was checked for the metrics page only. [paraphrased:C010]
Attribution block for the quotation above, and for any other `sourced:` use of that page: Nathen Harvey, "DORA's software delivery performance metrics", https://dora.dev/guides/dora-metrics/; licensor Google LLC; license CC BY 4.0, https://creativecommons.org/licenses/by/4.0/; unchanged unless the citing statement says otherwise. [paraphrased:C010]

## Howie, Apache-2.0

The guide is published under the Apache License 2.0, copyright PagerDuty, Inc., and its checklists may be reproduced and adapted with attribution and license notice. [paraphrased:C080]
Anything tagged `sourced:`, `paraphrased:` or `adapted-from:` from Howie carries the attribution elements Apache-2.0 §4 requires: a copy of the license, retention of the copyright and attribution notices, and a statement of the changes made. [paraphrased:C080]
The repository has no NOTICE file, so there is no NOTICE passthrough obligation. [paraphrased:C080]

## Trademarks

Neither license grants trademark rights: CC BY 4.0 withholds them and Apache-2.0 withholds them. [paraphrased:C010] [paraphrased:C080]
So DORA, Google Cloud, Howie and PagerDuty may be named nominatively, and never used as branding or as a claim of endorsement. [skill-authored]

## Google SRE Book, CC BY-NC-ND 4.0

The Google SRE Book web pages carry a CC BY-NC-ND 4.0 notice whose NonCommercial term withdraws the grant from a commercially distributed skill and whose NoDerivatives term bars distributing an adaptation. [cites:C020] [cites:C040]
No Google SRE Book text is reproduced, paraphrased or adapted anywhere in this plugin; `cites:` is the only tag its records permit. [skill-authored]

## Sources with no license status in evidence

Yuan et al. and Gunawi et al. carry no license status in evidence, so both are marked unchecked in the register. [cites:C026] [cites:C058]
Seven sources of the element-kinds research are marked unchecked in the register for the same reason: the STUK report by Haapanen and Helminen, the sre.google-hosted PDF of The Calculus of Service Availability by Treynor et al., the AWS Well-Architected REL05-BP01 page, the MSDN Magazine article on the STRIDE approach, Osterman's STRIDE-per-Element post, Common Criteria Part 1 and the arXiv survey by Chockalingam et al. [skill-authored]
Their findings and category labels are usable as facts, with the source named in the sentence; no text of theirs is reproduced. [skill-authored]
The user's ruling of 2026-10-07 withholds `sourced:` on records C131 to C160 in this version, even where a row's licence permits it, so the register keeps stating the licence and the ruling is enforced as a ruling. [skill-authored]
arc42 and the OWASP Threat Modeling Cheat Sheet are licensed CC BY-SA 4.0, and by the user's ruling of 2026-10-07 both are cite-only, with no direct quotation on the public side, until a reading of ShareAlike is recorded. [skill-authored]
If a license is later established for any unchecked source, its register row changes: a `cites:` tag already in use stays valid, because `cites:` is permitted under every status; an `adapted-from:` tag stays valid unless the status resolves to cite-only, in which case the statement is retagged or removed. [skill-authored]

## Why record ids and not clause numbers

The inspiration skill ships reconstructed rating tables labelled *per AIAG-VDA methodology* and instructs citing handbook table numbers, but its anchors are the older AIAG 4th-edition style and its Action Priority band structure does not match the handbook's. [paraphrased:C088]
That citation cannot be resolved against the handbook. [cites:C088]
It is the failure this file exists to prevent: a statement here points at a verified record, never at a clause number in a document the corpus never read. [skill-authored]

## Where the evidence lives

The records file and the research report live in the private repository failwise-research, under its `docs/evidence/`; the public plugin repository carries neither. [skill-authored]
Neither is part of `skills/fmea-software/`, so neither ships with the plugin. [skill-authored]
The records file carries verbatim quotes from paraphrase-only and no-derivatives sources, which is why it stays private; a record id is traced to its source through the register's Address column. [skill-authored]

## The skill's own column set

The report and conversion column set is the skill's own and cites no record id: element, function, failure mode, the three effect levels (local, next level, end user), causes, controls by kind (prevention, detection, compensating), S, O and D each with rationale and evidence kind, priority with the id of the table it came from, and actions with owner and status. [skill-authored]
It reproduces neither the AIAG-VDA handbook forms nor any other standard's worksheet, because no worksheet from any standard is in the evidence base. [skill-authored]
The priority table the plugin ships is likewise the skill's own, and carries no cell value from any standard. [skill-authored]

## Never ships

No AIAG-VDA handbook cell value of any kind, anywhere in the plugin. [skill-authored]
No Google SRE Book text, adapted or paraphrased. [skill-authored]
No paraphrase of IEC 60812 text. [skill-authored]
Nothing specific to a consuming application: no service name, team name, incident id or architecture detail from any real system. [skill-authored]
