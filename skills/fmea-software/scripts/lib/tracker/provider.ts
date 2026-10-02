// The seam between the tracker-neutral items and a tracker's adapter: types only, no behaviour.

import type { TrackerProvider } from "../types.ts";

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
