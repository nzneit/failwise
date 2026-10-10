// Writes a screenshot of every part of the HTML report at every width, and the print PDF, for a
// person or an agent to judge by eye:
//
//   node tools/shots.ts                         # the checkout fixture, Chromium
//   node tools/shots.ts --engines chromium,firefox,webkit --report path/to/report.html
//
// `bun tools/shots.ts` works as well. It takes the gate's --engines and --report (not --fetch:
// tools/check-browser.ts fetches the browsers) and runs Playwright's test runner with
// dev/browser/shots.config.ts. Under build/shots/<engine>/<width>/ it writes page.png, one image
// per part of the report (each section but the chains, the key, the index, each group section,
// each row section), none taller than 1,600 px, a taller part in pieces <stem>-p1.png,
// <stem>-p2.png and so on; and build/shots/chromium/print.pdf. build/shots is removed first, so
// an earlier run's files cannot stand in. The command reads from the report which files it owes
// and exits 1 with an `error UNVERIFIED: build/shots/<folder>/ lacks <stem>` line for each one
// missing; otherwise it prints how many files it found. Its other coded lines are the gate's
// (tools/lib/browser.ts).

import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultMachine, runBrowser, type Machine, type Run } from "./lib/browser.ts";
import { groupStems } from "./lib/compare-views.ts";
import { rowFileStem, SECTION_PARTS, WIDTHS, type Engine } from "../dev/browser/matrix.ts";

const SHOTS = "build/shots";
const PDF = "chromium/print.pdf";

/** What the report owes in each folder: the parts photographed whole or in pieces, and the row count. */
interface Owed {
  parts: string[];
  rows: number;
}

function owedBy(html: string): Owed {
  const chains = html.includes('<table class="index"') ? ["key", "index"] : [];
  return { parts: [...SECTION_PARTS, ...chains, ...groupStems(html)], rows: html.split('<article class="row" id="').length - 1 };
}

/** The names in a folder, or none when it cannot be listed, so everything owed there is missing. */
function listed(machine: Machine, folder: string): string[] {
  try {
    return machine.host.listDir(join(machine.root, SHOTS, folder));
  } catch {
    return [];
  }
}

/** The stems owed in a folder that none of its names covers. */
function lacking(names: string[], owed: Owed): string[] {
  const page = names.includes("page.png") ? [] : ["page"];
  const parts = owed.parts.filter((part) => !names.includes(`${part}.png`) && !names.includes(`${part}-p1.png`));
  // rowFileStem with the bare prefix "row-" gives "row-NN-", the start every row file shares.
  const rows = Array.from({ length: owed.rows }, (_, i) => rowFileStem(i + 1, "row-"));
  return [...page, ...parts, ...rows.filter((prefix) => !names.some((name) => name.startsWith(prefix)))];
}

/** Whether every file the report owes was written; one UNVERIFIED line per missing file, else the count. */
function verifyShots(machine: Machine, engines: readonly Engine[], report: string): boolean {
  const html = machine.files.readText(report);
  if (html === null) {
    machine.writeError(`error UNVERIFIED: ${report} could not be read, so the files it owes are unknown`);
    return false;
  }
  const owed = owedBy(html);
  let count = 0;
  const missing: string[] = [];
  for (const folder of engines.flatMap((engine) => WIDTHS.map((width) => `${engine}/${width}`))) {
    const names = listed(machine, folder);
    count += names.length;
    missing.push(...lacking(names, owed).map((stem) => `${folder}/ lacks ${stem}`));
  }
  if (engines.includes("chromium")) {
    if (machine.host.exists(join(machine.root, SHOTS, PDF))) count += 1;
    else missing.push("chromium/ lacks print.pdf");
  }
  for (const line of missing) machine.writeError(`error UNVERIFIED: ${SHOTS}/${line}`);
  if (missing.length === 0) machine.write(`## shots: ${count} files under ${SHOTS}/`);
  return missing.length === 0;
}

const SHOTS_RUN: Run = {
  name: "shots",
  config: "dev/browser/shots.config.ts",
  out: "build/browser/shots",
  accepts: { fetch: false, report: true, base: false },
  prepare: (machine) => machine.files.remove(join(machine.root, SHOTS)),
  after: verifyShots,
};

export function runShots(argv: string[], machine: Machine): number {
  return runBrowser(SHOTS_RUN, argv, machine);
}

if (isEntry(import.meta)) {
  process.exit(runShots(process.argv.slice(2), defaultMachine()));
}
