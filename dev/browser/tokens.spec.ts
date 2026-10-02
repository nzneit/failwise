// The tokens check: identifiers, paths and URLs are ordinary content of a software FMEA, so at each
// width of TOKEN_WIDTHS a long token with no place to break is written into every text of the
// report that may wrap, and the page must still neither scroll sideways nor put an element past
// the right edge. The check plants the token itself, so it does not depend on the fixture. A run
// that planted nothing fails. The report is loaded, planted and measured first, then compared.

import { expect, test } from "@playwright/test";
import { TOKEN_WIDTHS } from "./matrix.ts";
import { openReport, pastRightEdge, plantLongToken, sidewaysScroll } from "./report.ts";

for (const width of TOKEN_WIDTHS) {
  test(`${width}px: a long token in any text that may wrap does not widen the page`, async ({ page }) => {
    await openReport(page, width);
    const planted = await plantLongToken(page);
    const measured = { planted: planted > 0, scroll: await sidewaysScroll(page), past: await pastRightEdge(page) };
    expect(measured).toEqual({ planted: true, scroll: 0, past: [] });
  });
}
