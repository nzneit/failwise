// The PDF check, which only Chromium can make: every page the report prints is wider than tall.
// The ".chromium." in the file name keeps the other engines' projects from matching it.

import { expect, test } from "@playwright/test";
import { PRINT_WIDTH } from "./matrix.ts";
import { openReport } from "./report.ts";

test("print: every page of the PDF is wider than it is tall", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const boxes = [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g)];
  expect(boxes.length).toBeGreaterThan(0);
  const notLandscape = boxes.filter((box) => Number(box[3]) - Number(box[1]) <= Number(box[4]) - Number(box[2])).map((box) => box[0]);
  expect(notLandscape).toEqual([]);
});
