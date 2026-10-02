// The Playwright configuration both runs share: the gate's checks and the screenshots. Each run
// writes under its own folder of build/browser/, and every path is absolute so the configuration
// means the same wherever Playwright is started from.

import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { ENGINES } from "./matrix.ts";

/** Where the screenshot command writes its images and the print PDF. */
export const SHOTS_DIR = join(import.meta.dirname, "..", "..", "build", "shots");

/** The configuration of one run: one project per engine, nothing retried, no `.only` allowed. */
export function browserConfig(run: "gate" | "shots", testMatch: string): PlaywrightTestConfig {
  const out = join(import.meta.dirname, "..", "..", "build", "browser", run);
  return {
    testDir: import.meta.dirname,
    testMatch,
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    use: { trace: "retain-on-failure" },
    projects: ENGINES.map((name) => ({ name, use: { browserName: name }, ...(name === "chromium" ? {} : { testIgnore: "**/*.chromium.*" }) })),
    outputDir: join(out, "output"),
    reporter: [
      ["list"],
      ["json", { outputFile: join(out, "results.json") }],
      ["html", { outputFolder: join(out, "html"), open: "never" }],
    ],
  };
}
