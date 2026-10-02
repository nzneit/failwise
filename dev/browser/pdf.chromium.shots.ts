// The report as Chromium prints it, build/shots/chromium/print.pdf. Only Chromium prints to PDF,
// so this file runs on the chromium project alone (config.ts ignores *.chromium.* elsewhere).

import { join } from "node:path";
import { test } from "@playwright/test";
import { SHOTS_DIR } from "./config.ts";
import { PRINT_WIDTH } from "./matrix.ts";
import { openReport } from "./report.ts";

test("print: the PDF", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  await page.pdf({ path: join(SHOTS_DIR, "chromium", "print.pdf"), preferCSSPageSize: true, printBackground: true });
});
