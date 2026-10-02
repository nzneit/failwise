// A provider that keeps its tracker in memory, for the tests of track.ts: no process, no network.

import { ScriptError } from "./lib/codes.ts";
import { CreatedWithFault, TrackerWait } from "./lib/tracker/provider.ts";
import type { Link, Observation, Provider, RemoteItem, Target, TrackedItem } from "./lib/tracker/provider.ts";

export interface FakeOptions { target?: Partial<Target>; marked?: RemoteItem[]; observations?: Observation[]; failCreateAt?: number; waitOnCreate?: number[]; createFault?: boolean; linkUrl?: (n: number) => string }
export interface FakeProvider extends Provider { calls: string[]; created: TrackedItem[] }

/** Item n of the fake tracker. */
function linkFor(n: number, options: FakeOptions): Link {
  const url = options.linkUrl ? options.linkUrl(n) : `https://github.example.com/acme/checkout/issues/${n}`;
  return { provider: "github", id: `N${n}`, key: `acme/checkout#${n}`, url };
}

/** A private github.com target unless `target` says otherwise. `create` numbers its items from 1;
 *  a call answered with a wait takes no number. */
export function fakeProvider(options: FakeOptions = {}): FakeProvider {
  const waits = [...(options.waitOnCreate ?? [])];
  let count = 0;
  const fake: FakeProvider = {
    calls: [],
    created: [],
    async describe() {
      fake.calls.push("describe");
      return { provider: "github", host: "github.com", project: "acme/checkout", label: "failwise", visibility: "private", write_gap_ms: 0, ...options.target };
    },
    async listMarked() {
      fake.calls.push("listMarked");
      return options.marked ?? [];
    },
    async create(item) {
      fake.calls.push("create");
      const wait = waits.shift();
      if (wait !== undefined) throw new TrackerWait(wait);
      count += 1;
      if (count === options.failCreateAt) throw new ScriptError("TRACKER_REJECTED", `create ${count} was refused`);
      const link = linkFor(count, options);
      fake.created.push(item);
      if (options.createFault === true) throw new CreatedWithFault(link, "the item came back without the label");
      return link;
    },
    async read(links) {
      fake.calls.push("read");
      const ids = new Set(links.map((l) => l.id));
      return (options.observations ?? []).filter((o) => ids.has(o.link.id));
    },
  };
  return fake;
}
