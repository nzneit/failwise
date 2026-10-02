// The comparison's screenshots: for each view and each owed part, one test that photographs the part
// and compares it with the reference pass 1 wrote, at zero tolerance. tools/compare.ts passes the
// owed parts' stems in FAILWISE_COMPARE_PARTS, joined by commas.

import { expect, test } from "@playwright/test";
import { PRINT_WIDTH, VIEWS } from "./matrix.ts";
import { openReport, partLocator } from "./report.ts";

const parts = process.env.FAILWISE_COMPARE_PARTS;
if (parts === undefined || parts === "") throw new Error("FAILWISE_COMPARE_PARTS is unset: run the comparison through tools/compare.ts");

for (const view of VIEWS) {
  for (const stem of parts.split(",")) {
    test(`${view} ${stem}`, async ({ page }) => {
      if (view === "print") await page.emulateMedia({ media: "print" });
      await openReport(page, view === "print" ? PRINT_WIDTH : view);
      await expect(await partLocator(page, stem)).toHaveScreenshot([String(view), `${stem}.png`]);
    });
  }
}
