// The Playwright configurations of the three browser commands: the gate's checks, the screenshots
// and the two passes of the report comparison. The gate and the screenshots each write under their
// own folder of build/browser/, the comparison under build/compare/, and every path is absolute so
// a configuration means the same wherever Playwright is started from. In CI the gate runs one worker
// per logical core of the runner; the screenshots, the comparison and every local run keep
// Playwright's default, half the logical cores. The gate takes no screenshot, and a screenshot can
// fail when the cores are contended.

import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { ENGINES } from "./matrix.ts";

/** Where the screenshot command writes its images and the print PDF. */
export const SHOTS_DIR = join(import.meta.dirname, "..", "..", "build", "shots");

/** What every configuration shares: one project per engine, nothing retried, no `.only` allowed. */
function sharedConfig(): PlaywrightTestConfig {
  return {
    testDir: import.meta.dirname,
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    projects: ENGINES.map((name) => ({ name, use: { browserName: name }, ...(name === "chromium" ? {} : { testIgnore: "**/*.chromium.*" }) })),
  };
}

/** The configuration of one pass of the comparison, from FAILWISE_COMPARE_PASS ("1" or "2"): references are
 *  written under build/compare/refs/<project>/<view>/<part>.png and compared at zero tolerance. */
export function compareConfig(): PlaywrightTestConfig {
  const pass = process.env.FAILWISE_COMPARE_PASS;
  if (pass !== "1" && pass !== "2") throw new Error("FAILWISE_COMPARE_PASS must be 1 or 2: run the comparison through tools/compare.ts");
  const out = join(import.meta.dirname, "..", "..", "build", "compare");
  return {
    ...sharedConfig(),
    testMatch: "**/*.compare.ts",
    use: { trace: "off" },
    outputDir: join(out, "output"),
    snapshotPathTemplate: join(out, "refs", "{projectName}", "{arg}{ext}"),
    expect: { toHaveScreenshot: { threshold: 0, maxDiffPixels: 0 } },
    reporter: [
      ["list"],
      ["json", { outputFile: join(out, `pass${pass}`, "results.json") }],
      ...(pass === "2" ? [["html", { outputFolder: join(out, "html"), open: "never" }] as const] : []),
    ],
  };
}

/** The configuration of one run: one project per engine, nothing retried, no `.only` allowed. The gate's, with CI
 *  set to a non-empty value, read at each call, uses every core of the runner; the screenshots' never sets
 *  workers and keeps Playwright's default, half the logical cores, since the gate takes no screenshot and a
 *  screenshot can fail when the cores are contended. */
export function browserConfig(run: "gate" | "shots", testMatch: string): PlaywrightTestConfig {
  const out = join(import.meta.dirname, "..", "..", "build", "browser", run);
  const ci = process.env.CI;
  return {
    ...sharedConfig(),
    ...(run === "gate" && ci !== undefined && ci !== "" ? { workers: "100%" } : {}),
    testMatch,
    use: { trace: "retain-on-failure" },
    outputDir: join(out, "output"),
    reporter: [
      ["list"],
      ["json", { outputFile: join(out, "results.json") }],
      ["html", { outputFolder: join(out, "html"), open: "never" }],
    ],
  };
}
