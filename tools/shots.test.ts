import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { runShots } from "./shots.ts";
import { rowFileStem, SECTION_PARTS, WIDTHS } from "../dev/browser/matrix.ts";
import { FAKE_REPORT, fakeMachine, type FakeOptions } from "./lib/fake-machine.ts";

const ROOT = "/repo";
const SHOTS = "/repo/build/shots";
const DRY_RUN = "browser: chromium version 1\n  Install location:    /cache/chromium-1\n  Download url:        https://example.invalid/c.zip\n";

/** The default report: every section part, the key and the index, one group section and two rows. */
const HTML = FAKE_REPORT;

/** Everything the default report owes in one folder, with `structure` in two pieces. */
const WRITTEN = [
  "page.png",
  ...SECTION_PARTS.flatMap((id) => (id === "structure" ? ["structure-p1.png", "structure-p2.png"] : [`${id}.png`])),
  "key.png",
  "index.png",
  "group-checkout.png",
  "row-01-ch-1.png",
  "row-02-ch-2.png",
];

/** The fake machine's options, and three for the screenshot command: the report's text, the file
 *  names `playwright test` leaves in each build/shots/<engine>/<width>/ folder (and print.pdf when
 *  chromium is among the engines), and the files then taken away again, as paths under build/shots/.
 *  A null `html` leaves the report off the disk, so it cannot be read. */
type Fake = Omit<FakeOptions, "written"> & { html?: string | null; written?: string[]; drop?: string[] };

/** The value of `flag` in `argv`, or undefined. */
function flagValue(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

/** The files `playwright test` leaves, as paths under build/shots/. */
function shotFiles(engines: string[], names: string[]): string[] {
  const folders = engines.flatMap((engine) => WIDTHS.map((width) => `${engine}/${width}`));
  return [...folders.flatMap((folder) => names.map((name) => `${folder}/${name}`)), ...(engines.includes("chromium") ? ["chromium/print.pdf"] : [])];
}

/** Runs the screenshot command on a fake machine. */
function run(argv: string[], fake: Fake = {}): { status: number; lines: string[]; errors: string[]; removed: string[] } {
  const { html = HTML, written = WRITTEN, drop = [], ...options } = fake;
  const engines = (flagValue(argv, "--engines") ?? "chromium").split(",");
  const given = flagValue(argv, "--report");
  const reportPath = given === undefined ? "/repo/build/browser/report.html" : resolve(options.cwd ?? ROOT, given);
  const files = shotFiles(engines, written).filter((path) => !drop.includes(path));
  const { machine, lines, errors, removed } = fakeMachine("shots", ROOT, {
    ...options,
    present: { ...(html === null ? {} : { [reportPath]: html }), ...options.present },
    written: Object.fromEntries(files.map((path) => [join(SHOTS, path), "image"])),
  });
  return { status: runShots(argv, machine), lines, errors, removed };
}

test("everything owed is there, one part in two pieces: the count, exit 0", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.equal(result.lines.at(-2), "## shots: 76 files under build/shots/"); // 5 widths × 15 files, and the PDF
  assert.equal(result.lines.at(-1), "## not run here: firefox, webkit");
  assert.ok(!result.lines.some((line) => line.startsWith("## not asserted")), result.lines.join("\n"));
});

test("build/shots is removed before the run, so an earlier run's files cannot stand in", () => {
  assert.ok(run([]).removed.includes("/repo/build/shots"));
});

test("a run that ends in a BROWSER line has removed the earlier run's files; a TOOLING line removes nothing", () => {
  const browser = run([], { missing: ["/cache/chromium-1"] });
  assert.equal(browser.status, 1);
  assert.match(browser.errors[0], /^error BROWSER: /);
  assert.ok(browser.removed.includes("/repo/build/shots"));
  assert.ok(browser.removed.includes("/repo/build/browser/shots"));
  assert.deepEqual(run([], { missing: ["dev/node_modules"] }).removed, []);
});

test("playwright test exits 1: exit 1, and neither the count nor the engines not run is printed", () => {
  const result = run([], { statuses: { test: 1 } });
  assert.equal(result.status, 1);
  // The opening line "## shots: playwright test over ..." is printed; the closing count is not.
  assert.ok(!result.lines.some((line) => /^## shots: \d+ files/.test(line) || line.startsWith("## not run here")), result.lines.join("\n"));
});

test("a missing part, a missing row and a missing PDF are each UNVERIFIED, exit 1", () => {
  const result = run([], { drop: ["chromium/375/key.png", "chromium/768/row-02-ch-2.png", "chromium/print.pdf"] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, [
    "error UNVERIFIED: build/shots/chromium/375/ lacks key",
    "error UNVERIFIED: build/shots/chromium/768/ lacks row-02-",
    "error UNVERIFIED: build/shots/chromium/ lacks print.pdf",
  ]);
});

test("results but no screenshot at all, over an earlier run's files: one UNVERIFIED line per file owed, exit 1", () => {
  const earlier = Object.fromEntries(shotFiles(["chromium"], WRITTEN).map((path) => [join(SHOTS, path), "old"]));
  const result = run([], { written: [], drop: ["chromium/print.pdf"], present: earlier });
  assert.equal(result.status, 1);
  const owed = ["page", ...SECTION_PARTS, "key", "index", "group-checkout", "row-01-", "row-02-"];
  const expected = WIDTHS.flatMap((width) => owed.map((stem) => `error UNVERIFIED: build/shots/chromium/${width}/ lacks ${stem}`));
  assert.deepEqual(result.errors, [...expected, "error UNVERIFIED: build/shots/chromium/ lacks print.pdf"]);
});

test("a missing group image is UNVERIFIED, exit 1", () => {
  const result = run([], { drop: ["chromium/320/group-checkout.png"] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error UNVERIFIED: build/shots/chromium/320/ lacks group-checkout"]);
});

test("a tall group written in pieces is owed and found", () => {
  const written = WRITTEN.flatMap((name) => (name === "group-checkout.png" ? ["group-checkout-p1.png", "group-checkout-p2.png"] : [name]));
  assert.equal(run([], { written }).status, 0);
});

test("a tile-group section of the header owes no group image", () => {
  const html = HTML.replace('<section id="header"></section>', '<section id="header"><section class="tile-group" aria-labelledby="strip-found"></section></section>');
  assert.equal(run([], { html }).status, 0);
});

test("a report that cannot be read owes an unknown set: UNVERIFIED, exit 1", () => {
  const result = run([], { html: null });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error UNVERIFIED: /repo/build/browser/report.html could not be read, so the files it owes are unknown"]);
});

test("a report with no chains owes no key, no index and no row", () => {
  const html = SECTION_PARTS.map((id) => `<section id="${id}"></section>`).join("") + '<p class="empty">No chains.</p>';
  const result = run(["--report", "/work/empty.html"], { html, written: ["page.png", ...SECTION_PARTS.map((id) => `${id}.png`)] });
  assert.equal(result.status, 0);
  assert.equal(result.lines.at(-2), "## shots: 46 files under build/shots/"); // 5 widths × 9 files, and the PDF
});

test("an index inside a frame still owes the key and the index", () => {
  const html = HTML.replace('<table class="index">', '<div class="frame" tabindex="0" role="region" aria-label="Index of failure chains"><table class="index" aria-labelledby="index-caption">');
  assert.equal(run([], { html }).status, 0);
  const lacking = run([], { html, drop: ["chromium/375/index.png"] });
  assert.equal(lacking.status, 1);
  assert.deepEqual(lacking.errors, ["error UNVERIFIED: build/shots/chromium/375/ lacks index"]);
});

test("without chromium among the engines no PDF is owed", () => {
  assert.equal(run(["--engines", "firefox"], { dryRun: DRY_RUN.replaceAll("chromium", "firefox") }).status, 0);
});

test("--fetch belongs to the gate's runner: USAGE", () => {
  assert.deepEqual(run(["--fetch"]).errors, ["error USAGE: unknown flag --fetch"]);
});

test("--base belongs to the comparison: USAGE", () => {
  assert.deepEqual(run(["--base", "main"]).errors, ["error USAGE: unknown flag --base"]);
});

test("a row's file stem carries its position and its id reduced to file-name characters", () => {
  assert.equal(rowFileStem(1, "row-ch-2"), "row-01-ch-2");
  assert.equal(rowFileStem(12, "row-a/b c"), "row-12-a-b-c");
});
