// The frames checks: every table of the report sits in a frame, and every frame scrolls on screen
// and does not clip in print. The right-edge check ignores what is inside a frame, so these keep a
// frame from hiding what it holds. At rest, at every width of WIDTHS from 1280 px up and in print, no
// table passes its frame either; below that whether the index fits depends on the reader's font, so
// it is not held there.
// The report is loaded and measured first, then compared.

import { expect, test } from "@playwright/test";
import { PRINT_WIDTH, WIDTHS } from "./matrix.ts";
import { frameFaults, openReport } from "./report.ts";

for (const width of WIDTHS) {
  test(`${width}px: every table is in a frame, and every frame scrolls`, async ({ page }) => {
    await openReport(page, width);
    const faults = await frameFaults(page, "auto", width >= 1280);
    expect(faults).toEqual([]);
  });
}

test("print: every table is in a frame, and no frame clips", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const faults = await frameFaults(page, "visible", true);
  expect(faults).toEqual([]);
});
