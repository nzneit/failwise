// The seam between the tracker-neutral items and a tracker's adapter: types only, no behaviour.

import type { ObservedState, TrackerProvider } from "../types.ts";

/**
 * One block of a section. `value` and `items` hold text from the analysis, and the renderers make it
 * literal. `heading`, `label` and `text` are the renderer's own words and are written as they are,
 * so the builder never puts analysis text in a `text` block.
 */
export type Block =
  | { kind: "fact"; label: string; value: string }
  | { kind: "list"; label: string; items: string[] }
  | { kind: "text"; text: string };
export interface Section { heading: string; blocks: Block[] }
interface Origin { analysis: string; version: number; chain: string; action: string; url?: string }
export interface ItemContent { title: string; action: string; sections: Section[]; origin: Origin }
export interface TrackedItem { key: string; text: string; label: string; due: string; content: ItemContent }

export type Visibility = "public" | "internal" | "private" | "unknown";
/** `no_create`, when present, says why this target cannot take a new item from this person; reading back needs none of it.
 *  `type` and `parent`, Jira only, are the work type new items are created as and the key of their parent. */
export interface Target { provider: TrackerProvider; host: string; project: string; label: string; visibility: Visibility; write_gap_ms: number; no_create?: string; type?: string; parent?: string }
/** `id` is the tracker's stable id; `key` is its own short name for the item, such as `owner/repo#12`. */
export interface Link { provider: TrackerProvider; id: string; key: string; url: string }
export interface Marker { key: string; text: string }
export interface RemoteItem { link: Link; marker: Marker | null }
/** What `read` saw of one linked item; `link` carries the item's current key and URL. `marker`, present
 *  only on a Jira observation, is the action key the item's marker names, or null when it has none. */
export interface Observation { link: Link; state: ObservedState; detail: string; closed_date?: string; marker?: string | null }

export interface Provider {
  describe(): Promise<Target>;
  listMarked(): Promise<RemoteItem[]>;
  create(item: TrackedItem): Promise<Link>;
  read(links: Link[]): Promise<Observation[]>;
}

/** The tracker refused a request and asked the client to wait. */
export class TrackerWait extends Error {
  readonly seconds: number;

  constructor(seconds: number) {
    super(`the tracker asked to wait ${seconds} seconds`);
    this.name = "TrackerWait";
    this.seconds = seconds;
  }
}

/** The item exists, so its link must be recorded, and the run must then stop (§6.4). */
export class CreatedWithFault extends Error {
  readonly link: Link;

  constructor(link: Link, message: string) {
    super(message);
    this.name = "CreatedWithFault";
    this.link = link;
  }
}
