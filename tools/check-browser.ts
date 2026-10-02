// Checks the HTML report the plugin renders in real browsers, the gate's browser checks:
//
//   node tools/check-browser.ts                                      # the checkout fixture, Chromium
//   node tools/check-browser.ts --engines chromium,firefox,webkit    # CI's form
//   node tools/check-browser.ts --report path/to/report.html         # a report that already exists
//   node tools/check-browser.ts --fetch                              # fetch the browsers for the engines named
//
// `bun tools/check-browser.ts` works wherever `bun tools/check.ts` does. Without --report it renders
// skills/fmea-software/evals/fixtures/checkout-service.fmea.json into build/browser/report.html, then
// starts Playwright's test runner with dev/browser/playwright.config.ts, one project per engine, and
// the report's absolute path in FAILWISE_REPORT. `--fetch` fetches Playwright's builds for the
// engines named and runs no check; with `--with-deps` it also installs the system packages they
// need, which is CI's form and needs root. The work is tools/lib/browser.ts. Exit status 0 only
// when every engine asked for ran every check and every check passed or failed as expected; 1
// otherwise, with Playwright's own output for a failing check and these coded lines for the rest.
// A passing run names the checks that are measured and not asserted (NOT_ASSERTED of
// dev/browser/matrix.ts) in a `## not asserted` line, since they are not verified.
//
//   error USAGE: ...       an unknown flag, an unknown engine, a flag without its value, no such report
//   error NODE: ...        no Node 24.2 or later found
//   error TOOLING: ...     dev/node_modules or Playwright absent or unstartable, the fixture not rendered
//   error BROWSER: ...     the build of an engine asked for is not installed
//   error UNVERIFIED: ...  Playwright's JSON report absent or unreadable, an engine with no test, a skip,
//                          a test whose status the runner does not know

import { isEntry } from "./lib/entry.ts";
import { defaultMachine, runBrowser, type Machine, type Run } from "./lib/browser.ts";
import { NOT_ASSERTED } from "../dev/browser/matrix.ts";

/** Names the checks measured and not asserted, so a passing run never counts them silently; nothing when there are none. */
function nameNotAsserted(machine: Machine): boolean {
  if (NOT_ASSERTED.length > 0) {
    const checks = NOT_ASSERTED.map((open) => `${open.width}px ${open.check}`).join(", ");
    machine.write(`## not asserted: ${checks} (reasons in dev/browser/matrix.ts)`);
  }
  return true;
}

const GATE: Run = { name: "gate", config: "dev/browser/playwright.config.ts", fetch: true, after: nameNotAsserted };

export function runGate(argv: string[], machine: Machine): number {
  return runBrowser(GATE, argv, machine);
}

if (isEntry(import.meta)) {
  process.exit(runGate(process.argv.slice(2), defaultMachine()));
}
