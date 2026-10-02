// The seam between the tracker-neutral items and a tracker's adapter: types only, no behaviour.

export interface Fact { label: string; value: string }
interface Origin { analysis: string; chain: string; action: string; url?: string }
export interface ItemContent { title: string; action: string; facts: Fact[]; origin: Origin }
export interface TrackedItem { key: string; text: string; label: string; due: string; content: ItemContent }
