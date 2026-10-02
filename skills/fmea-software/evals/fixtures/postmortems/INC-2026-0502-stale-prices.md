# INC-2026-0502: stale prices served from the cart quote

## Summary

A catalogue price change rolled out while shoppers had open sessions. Checkout priced those carts
from the quote held in the cart, which had no maximum age, so orders were confirmed at prices the
catalogue no longer offered. Finance corrected the difference by hand.

## Timeline

| Time (UTC) | Event |
|---|---|
| 06:00 | Catalogue price change begins rolling out. |
| 06:02 | Pricing service starts returning the new prices. |
| 06:05 | Checkout continues to price open carts from quotes taken before the rollout. |
| 08:40 | A merchandising analyst notices confirmed orders below the new price. |
| 09:10 | Cache age dashboard confirms quotes older than two hours are still in use. |
| 09:35 | Open sessions are invalidated by an operator, forcing a re-quote. |
| 09:50 | New orders price at the current catalogue price. |

## Impact

Two hundred and six orders over three hours and forty-five minutes were confirmed at the previous
price. The average difference was small; the total was absorbed by finance rather than passed back
to shoppers.

This is the second stale-price incident since 2026-01-01; the first, on 2026-02-11, followed the
same rollout pattern and was closed without bounding the quote's age.

## Root cause

The fallback quote held in the cart has no maximum age. It exists so that a pricing outage does
not block checkout, and nothing bounds how long it may be used after the catalogue has moved. The
rollout was not treated as an event that should invalidate held quotes.

## Detection

No alert fired. A human noticed the discrepancy in a merchandising report two and a half hours
after the rollout began. The cache age dashboard could have shown the condition from the start but
is only consulted during an investigation.

## Action items

| id | action | owner | status |
|---|---|---|---|
| AI-1 | Give the fallback quote a maximum age and refuse to price a cart from an older quote | Pricing team | Completed |
| AI-2 | Invalidate held quotes when a catalogue price rollout starts | Pricing team | Open |
| AI-3 | Emit a metric for every checkout priced from the fallback quote and alert when the share rises | Checkout team | Implementation pending |
