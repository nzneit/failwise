// Document types for an fmea-software analysis. Types only: this file emits no runtime code,
// so every import of it elsewhere is an `import type`.

export type ElementKind = "service" | "external_dependency" | "interface" | "event_stream" | "datastore" | "security_component" | "component";
export type SourceKind = "document" | "repo" | "interview" | "incident" | "contract" | "catalog";
export type ControlKind = "prevention" | "detection" | "compensating";
export type ControlStatus = "existing" | "planned";
export type ControlEvidenceKind = "observed_incident" | "test_result" | "estimate" | "none";
export type RatingEvidenceKind = "observed_incident" | "test_result" | "estimate";
export type ReviewStatus = "provisional" | "rescored" | "authored";
export type ActionStatus = "Open" | "Decision pending" | "Implementation pending" | "Completed" | "Not Implemented";
export type CauseOrigin = "specification" | "design" | "code";
export type StaleReason = "element-changed" | "function-changed" | "control-removed" | "scales-version";
export type AssumptionStatus = "open" | "closed";
export type Strength = "strong" | "weak";
export type Factor = "S" | "O" | "D";
export type Severity = "blocker" | "warning";

export interface HistoryEntry { version: number; date: string; change: string }
export interface Assumption { text: string; owner: string; status: AssumptionStatus }
export interface Review { date: string; reviewers: string[]; outcome: string }
export interface Boundary { included: string[]; excluded: string[]; security: string }
export interface Scales { version: number; priority_table: string }
export interface Meta {
  id: string; name: string; version: number; branch: "DFMEA"; scope: string; boundary: Boundary;
  ground_rules: string[]; assumptions: Assumption[]; reviews: Review[]; scales: Scales;
  created: string; updated: string; history: HistoryEntry[];
}
export interface Dependency { strength: Strength; sla?: string; limits?: string }
export interface Source { kind: SourceKind; ref: string }
export interface Element { id: string; kind: ElementKind; name: string; description: string; parent: string | null; dependency?: Dependency; sources: Source[] }
export interface Fn { id: string; element: string; statement: string; conditions: string[]; for_whom: string }
export interface Cause { text: string; origin?: CauseOrigin; adversarial?: boolean }
export interface ControlEvidence { kind: ControlEvidenceKind; ref?: string }
export interface Control { kind: ControlKind; description: string; status: ControlStatus; evidence: ControlEvidence }
export interface RatingReview { status: ReviewStatus; by?: string; date?: string }
export interface Rating { value: number; rationale: string; evidence_kind: RatingEvidenceKind; evidence_ref?: string; review: RatingReview }
export interface Ratings { S: Rating; O: Rating; D: Rating }
export interface Priority { value: string; table: string; rpn: number }
export interface Action { id: string; description: string; owner: string; status: ActionStatus; target_date: string; completed_date?: string; source_incident?: string }
export interface Handoff { to: "threat-model"; reason: string; adversary_cause: string }
export interface CatalogRef { id: string; provenance: string }
export interface Stale { flag: boolean; reason?: StaleReason; since_version?: number }
export interface Effects { local: string; next_level: string; end: string }
export interface Chain {
  id: string; function: string; failure_mode: string; effects: Effects; causes: Cause[]; trigger?: string;
  controls: Control[]; ratings: Ratings; priority: Priority; actions: Action[]; post_ratings?: Ratings; post_priority?: Priority;
  handoff?: Handoff; source_incident?: string; catalog_refs: CatalogRef[]; stale: Stale; history: HistoryEntry[];
}
export interface Lint { rule: string; severity: Severity; pointer: string; message: string }
export interface Computed { quality_score: number; lints: Lint[]; validated_at: string; validator_version: string }
export interface FmeaDocument { meta: Meta; elements: Element[]; functions: Fn[]; chains: Chain[]; computed?: Computed }
