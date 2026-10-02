// Compares the HTML report the working tree renders with the one the base commit renders, part by
// part and view by view, in real browsers:
//
//   node tools/compare.ts                       # the working tree against where it left main, Chromium
//   node tools/compare.ts --base HEAD           # the working tree against its own last commit
//   node tools/compare.ts --engines chromium,firefox,webkit
//
// `bun tools/compare.ts` works as well. The before side is the merge base of --base (default main)
// and HEAD: its skills/ folder is exported with `git archive` and `tar` into build/compare/before-tree/,
// which touches neither the working tree, the index nor a branch, and its checkout fixture is
// rendered by its own renderer into build/compare/before.html; the tar file and the tree are then
// removed. The after side is the working tree's render, build/compare/after.html. Playwright's test
// runner then runs dev/browser/compare.config.ts twice over the parts both reports have: the first
// pass writes a reference image of each part at each view from the before report, the second
// compares the after report with them at zero tolerance. Each view is same, changed or unverified,
// read from the second pass's JSON report and never from the wording of a message. Under
// build/compare/ it writes summary.md, and for each changed view the before, after and difference
// images in changed/<engine>/<view>/; build/compare/html/ is Playwright's own viewer of the second
// pass. build/compare is removed first, so an earlier run's files cannot stand in. With
// GITHUB_STEP_SUMMARY set the summary is appended to it; with GITHUB_OUTPUT set and exit status 0,
// `changed=<count>`. Exit status 0 when every view is same or changed, 1 otherwise, and 1 when no
// part of the report is on both sides, since then nothing was compared. The work of the
// runner is tools/lib/browser.ts, the comparison's own in tools/lib/compare-views.ts. When a git or
// tar step fails, the child's own stderr, if it wrote any, is shown before the coded line. Coded lines:
//
//   error USAGE: ...       an unknown flag (--report and --fetch among them), an unknown engine, a
//                          flag without its value, a --base that names no commit
//   error NODE: ...        no Node 24.2 or later found
//   error TOOLING: ...     dev/node_modules or Playwright absent or unstartable, git that cannot be
//                          started, no merge base, git status, git archive or tar failing, either
//                          renderer failing
//   error BROWSER: ...     the build of an engine asked for is not installed
//   error UNVERIFIED: ...  a report that could not be read, no part of the report on both sides, a
//                          pass's JSON report absent or unreadable, and each view that is neither
//                          same nor changed

import { createHash } from "node:crypto";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultMachine, FIXTURE, RENDER, runBrowser, type Machine, type Run, type ReportedTest, type Session } from "./lib/browser.ts";
import { judge, partsOf, planParts, summaryText, type PartPlan, type Verdict } from "./lib/compare-views.ts";
import { VIEWS, type Engine, type View } from "../dev/browser/matrix.ts";

const OUT = "build/compare";
const TAR = `${OUT}/before.tar`;
const TREE = `${OUT}/before-tree`;

/** The two passes of Playwright: the before report updates the references, the after report is compared. */
const PASSES = [
  { pass: "1", side: "before", update: "all", label: "the base commit's report" },
  { pass: "2", side: "after", update: "none", label: "the working tree's report" },
] as const;

/** The before commit: the merge base's full SHA, and whether the working tree has uncommitted changes. */
interface Base {
  sha: string;
  dirty: boolean;
}

/** The two rendered reports' text. */
interface Sides {
  before: string;
  after: string;
}

/** One owed view: a part of the report at a view on an engine. */
interface OwedView {
  engine: Engine;
  view: View;
  part: string;
}

/** What the summary is written from: the before commit, both reports and the plan of their parts. */
interface Compared {
  base: Base;
  sides: Sides;
  plan: PartPlan;
}

/** The lines of the summary's two lists that decide the verdict. */
interface Classes {
  changed: string[];
  unverified: string[];
}

/** A child's result as Session.exec gives it. */
type Child = ReturnType<Session["exec"]>;

/** Writes a failed child's own stderr, when it has any, then the coded line. */
function fail(session: Session, line: string, child?: Child): false {
  const said = child?.stderr.trim() ?? "";
  if (said !== "") session.machine.writeError(said);
  session.machine.writeError(line);
  return false;
}

function exited(status: number | null): string {
  return status === null ? "without a status" : String(status);
}

/** Steps 1 to 3: the base names a commit, it has a merge base with HEAD, and whether the tree is dirty. */
function findBase(session: Session): Base | null {
  const { base } = session;
  const noBase = (line: string, child: Child): null => {
    fail(session, line, child);
    return null;
  };
  const commit = session.exec("git", ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (commit.status === null) return noBase("error TOOLING: git could not be started", commit);
  if (commit.status !== 0) return noBase(`error USAGE: --base names no commit: ${base}`, commit);
  const merge = session.exec("git", ["merge-base", base, "HEAD"]);
  const sha = merge.stdout.split("\n")[0].trim();
  if (merge.status !== 0 || sha === "") return noBase(`error TOOLING: ${base} and HEAD have no merge base`, merge);
  const status = session.exec("git", ["status", "--porcelain"]);
  if (status.status !== 0) return noBase(`error TOOLING: git status exited ${exited(status.status)}`, status);
  return { sha, dirty: status.stdout !== "" };
}

/** Step 4: the base commit's skills/ folder, unpacked into build/compare/before-tree. */
function exportBase(session: Session, sha: string): boolean {
  session.machine.files.makeDir(join(session.machine.root, TREE));
  const archive = session.exec("git", ["archive", "--format=tar", `--output=${TAR}`, sha, "skills"]);
  if (archive.status !== 0) {
    return fail(session, `error TOOLING: git archive exited ${exited(archive.status)}; the base commit could not be exported`, archive);
  }
  const tar = session.exec("tar", ["-xf", TAR, "-C", TREE]);
  if (tar.status !== 0) return fail(session, `error TOOLING: tar exited ${exited(tar.status)}; the base commit could not be unpacked`, tar);
  return true;
}

/** Renders one side's checkout fixture with that side's renderer into build/compare/<side>.html. */
function renderSide(session: Session, side: "before" | "after"): boolean {
  const prefix = side === "before" ? `${TREE}/` : "";
  const status = session.render(prefix + RENDER, prefix + FIXTURE, `${OUT}/${side}.html`);
  if (status === 0) return true;
  return fail(
    session,
    side === "before"
      ? `error TOOLING: the base commit's render.ts exited ${exited(status)}; its checkout fixture could not be rendered`
      : `error TOOLING: render.ts exited ${exited(status)}; the checkout fixture could not be rendered`,
  );
}

/** Steps 4 and 5: the before report; the tar file and the unpacked tree are removed whatever happened. */
function renderBefore(session: Session, sha: string): boolean {
  const rendered = exportBase(session, sha) && renderSide(session, "before");
  const { files, root } = session.machine;
  files.remove(join(root, TAR));
  files.remove(join(root, TREE));
  return rendered;
}

/** Step 7: both reports' text, or null after an UNVERIFIED line for each that could not be read. */
function readSides(session: Session): Sides | null {
  const read = (side: "before" | "after"): string | null => {
    const text = session.machine.files.readText(join(session.machine.root, OUT, `${side}.html`));
    if (text === null) session.machine.writeError(`error UNVERIFIED: ${OUT}/${side}.html could not be read`);
    return text;
  };
  const before = read("before");
  const after = read("after");
  return before === null || after === null ? null : { before, after };
}

/** Steps 8 and 9: both passes over the parts photographed; false when Playwright ended without a status. */
function runPasses(session: Session, parts: string[]): boolean {
  const { machine, engines } = session;
  return PASSES.every(({ pass, side, update, label }) => {
    machine.write(`## compare: ${label}, playwright test over ${engines.join(", ")} (node v${session.nodeVersion})`);
    const env = { FAILWISE_REPORT: join(machine.root, OUT, `${side}.html`), FAILWISE_COMPARE_PASS: pass, FAILWISE_COMPARE_PARTS: parts.join(",") };
    // Playwright's own exit status is not a verdict: a changed view fails its test.
    return session.playwright([`--update-snapshots=${update}`], env) !== null;
  });
}

/** Every owed view, in the order engine, view, part. */
function owedViews(engines: readonly Engine[], owed: string[]): OwedView[] {
  return engines.flatMap((engine) => VIEWS.flatMap((view) => owed.map((part) => ({ engine, view, part }))));
}

function nameOf(view: OwedView): string {
  return `${view.engine} ${view.view} ${view.part}`;
}

function unverified(reason: string): Verdict {
  return { kind: "unverified", reason };
}

/** A changed view's three images, copied to build/compare/changed/<engine>/<view>/; unverified when one cannot be. */
function keepImages(session: Session, view: OwedView, verdict: Verdict & { kind: "changed" }): Verdict {
  const { files, root } = session.machine;
  const folder = join(root, OUT, "changed", view.engine, String(view.view));
  const images = [["before", verdict.expected], ["after", verdict.actual], ["diff", verdict.diff]] as const;
  const copied = images.every(([kind, from]) => files.copy(from, join(folder, `${view.part}.${kind}.png`)));
  return copied ? verdict : unverified("its images could not be copied");
}

/** One owed view's class, from both passes' tests. */
function classOf(session: Session, plan: PartPlan, passes: [ReportedTest[], ReportedTest[]], view: OwedView): Verdict {
  const ids = plan.collided.get(view.part);
  if (ids !== undefined) return unverified(`more than one row id reduces to this file name (${ids.join(", ")})`);
  const title = `${view.view} ${view.part}`;
  const [first, second] = passes.map((tests) => tests.find((one) => one.projectName === view.engine && one.title === title));
  const reference = join(session.machine.root, OUT, "refs", view.engine, String(view.view), `${view.part}.png`);
  const verdict = judge(first?.status === "expected" && session.machine.host.exists(reference), second);
  return verdict.kind === "changed" ? keepImages(session, view, verdict) : verdict;
}

/** Step 10: each owed view's class, with an UNVERIFIED line for each view that is neither same nor changed;
 *  when a pass left no JSON report, one line and every owed view unverified. With nothing photographed no
 *  pass ran, and every owed view is a collided one, unverified before any result is looked for. */
function classify(session: Session, plan: PartPlan): Classes {
  const views = owedViews(session.engines, plan.owed);
  const ran = plan.photographed.length > 0;
  const passes = PASSES.map(({ pass }) => (ran ? session.readTests(`${OUT}/pass${pass}/results.json`) : []));
  const absent = passes.findIndex((tests) => tests === null);
  if (absent !== -1) {
    const reason = `${OUT}/pass${absent + 1}/results.json is absent or is not Playwright's JSON report`;
    session.machine.writeError(`error UNVERIFIED: ${reason}`);
    return { changed: [], unverified: views.map((view) => `${nameOf(view)}: ${reason}`) };
  }
  const classes: Classes = { changed: [], unverified: [] };
  for (const view of views) {
    const verdict = classOf(session, plan, passes as [ReportedTest[], ReportedTest[]], view);
    if (verdict.kind === "changed") classes.changed.push(`${nameOf(view)}: ${verdict.detail}`);
    if (verdict.kind === "unverified") {
      classes.unverified.push(`${nameOf(view)}: ${verdict.reason}`);
      session.machine.writeError(`error UNVERIFIED: ${nameOf(view)}: ${verdict.reason}`);
    }
  }
  return classes;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Step 11: writes the summary, and appends it to GITHUB_STEP_SUMMARY when that is set; the number of owed views. */
function writeSummary(session: Session, compared: Compared, classes: Classes): number {
  const { machine, engines } = session;
  const { base, sides, plan } = compared;
  const views = plan.owed.length * VIEWS.length * engines.length;
  const summary = summaryText({
    base: session.base,
    commit: base.sha,
    dirty: base.dirty,
    hashes: { before: sha256(sides.before), after: sha256(sides.after) },
    engines,
    views,
    ...classes,
    added: plan.added,
    removed: plan.removed,
  });
  machine.files.writeText(join(machine.root, OUT, "summary.md"), summary);
  const stepSummary = machine.host.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) machine.files.appendText(stepSummary, summary);
  return views;
}

/** Steps 11 and 12: the summary, then the verdict line; true when no view is unverified. */
function conclude(session: Session, compared: Compared, classes: Classes): boolean {
  const views = writeSummary(session, compared, classes);
  if (classes.unverified.length > 0) return false;
  const { machine } = session;
  const short = compared.base.sha.slice(0, 7);
  const count = classes.changed.length;
  machine.write(
    count === 0
      ? `## compare: no view of ${views} changed against ${short}`
      : `## compare: ${count} of ${views} views changed against ${short} (${OUT}/summary.md)`,
  );
  const output = machine.host.env.GITHUB_OUTPUT;
  if (output) machine.files.appendText(output, `changed=${count}\n`);
  return true;
}

/** Steps 6 to 10 of the runner, for the comparison: build/compare was removed before the browsers were checked.
 *  A comparison with no owed view compared nothing, so it is unverified and starts no pass; one whose owed parts
 *  all collided starts none either, since every view of them is unverified without a photograph. */
function compareViews(session: Session): boolean {
  const base = findBase(session);
  if (base === null || !renderBefore(session, base.sha) || !renderSide(session, "after")) return false;
  const sides = readSides(session);
  if (sides === null) return false;
  const compared: Compared = { base, sides, plan: planParts(partsOf(sides.before), partsOf(sides.after)) };
  const { plan } = compared;
  if (plan.owed.length === 0) {
    session.machine.writeError("error UNVERIFIED: no part of the report is on both sides, so nothing was compared");
    writeSummary(session, compared, { changed: [], unverified: [] });
    return false;
  }
  if (plan.photographed.length > 0 && !runPasses(session, plan.photographed)) return false;
  return conclude(session, compared, classify(session, plan));
}

const COMPARE: Run = {
  name: "compare",
  config: "dev/browser/compare.config.ts",
  out: OUT,
  accepts: { fetch: false, report: false, base: true },
  execute: compareViews,
};

export function runCompare(argv: string[], machine: Machine): number {
  return runBrowser(COMPARE, argv, machine);
}

if (isEntry(import.meta)) {
  process.exit(runCompare(process.argv.slice(2), defaultMachine()));
}
