// The Playwright configuration both runs share: the gate's checks and the screenshots. Each run
// writes under its own folder of build/browser/, and every path is absolute so the configuration
// means the same wherever Playwright is started from.

import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { ENGINES } from "./matrix.ts";

/** Where the screenshot command writes its images and the print PDF. */
export const SHOTS_DIR = join(import.meta.dirname, "..", "..", "build", "shots");

/** What both builders share: one project per engine, nothing retried, no `.only` allowed. */
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

/** The configuration of one run: one project per engine, nothing retried, no `.only` allowed. */
export function browserConfig(run: "gate" | "shots", testMatch: string): PlaywrightTestConfig {
  const out = join(import.meta.dirname, "..", "..", "build", "browser", run);
  return {
    ...sharedConfig(),
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
