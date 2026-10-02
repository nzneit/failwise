// The stepped check: the viewport steps through every width of STEPPED_WIDTHS, 320 to 1280 px in
// 4 px steps and the last width under the breakpoint, and at each the report neither scrolls
// sideways nor puts an element past the right edge. It covers the seam at the breakpoint and every
// width between the fixed ones. At each width it first reads the page's innerWidth, and a viewport
// that is not the width set is a failed width, so the check proves the widths it measured on every
// engine. The number of widths measured is recorded as an annotation; a failure names the first ten
// widths that failed.

import { expect, test } from "@playwright/test";
import { STEPPED_WIDTHS, VIEWPORT_HEIGHT } from "./matrix.ts";
import { openReport, pastRightEdge, sidewaysScroll } from "./report.ts";

test("320 to 1280px in 4px steps, and 767px: no sideways scroll and nothing past the right edge", async ({ page }) => {
  test.setTimeout(120_000);
  const first = STEPPED_WIDTHS[0];
  if (first === undefined) throw new Error("STEPPED_WIDTHS is empty: the stepped check would measure nothing");
  await openReport(page, first);
  const kept: string[] = [];
  let measured = 0;
  for (const width of STEPPED_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const inner = await page.evaluate(() => window.innerWidth);
    const scroll = await sidewaysScroll(page);
    const past = await pastRightEdge(page);
    measured += 1;
    if (inner !== width) kept.push(`${width}px: the viewport is ${inner}px wide`);
    else if (scroll !== 0 || past.length > 0) kept.push(`${width}px: scroll ${scroll}, past ${past.join(" ")}`);
  }
  test.info().annotations.push({ type: "widths measured", description: String(measured) });
  expect(kept.slice(0, 10)).toEqual([]);
});
