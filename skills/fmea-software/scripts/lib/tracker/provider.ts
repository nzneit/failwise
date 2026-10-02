// The seam between the tracker-neutral items and a tracker's adapter: types only, no behaviour.

import type { ObservedState, TrackerProvider } from "../types.ts";

/** The line every created item carries before its marker (§7). */
export const CLOSING_LINE = "The status of this action is recorded in the analysis, and closing this item proposes a change there.";

export interface Fact { label: string; value: string }
interface Origin { analysis: string; chain: string; action: string; url?: string }
export interface ItemContent { title: string; action: string; facts: Fact[]; origin: Origin }
export interface TrackedItem { key: string; text: string; label: string; due: string; content: ItemContent }

export type Visibility = "public" | "internal" | "private" | "unknown";
export interface Target { provider: TrackerProvider; host: string; project: string; label: string; visibility: Visibility; write_gap_ms: number }
/** `id` is the tracker's stable id; `key` is its own short name for the item, such as `owner/repo#12`. */
export interface Link { provider: TrackerProvider; id: string; key: string; url: string }
export interface Marker { key: string; text: string }
export interface RemoteItem { link: Link; marker: Marker | null }
/** What `read` saw of one linked item; `link` carries the item's current key and URL. */
export interface Observation { link: Link; state: ObservedState; detail: string; closed_date?: string }

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
