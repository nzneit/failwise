# INC-2026-0621: retry storm from the storefront during a partial pricing outage

## Summary

The pricing service was partially unavailable for eleven minutes. Checkout submissions slowed, the
storefront retried them, and the retried load kept the checkout work queue full for six minutes
after pricing had recovered. A change to the storefront's retry policy ended the event and has
been in place since.

## Timeline

| Time (UTC) | Event |
|---|---|
| 13:02 | One pricing replica fails readiness checks; quote latency rises. |
| 13:05 | Checkout submissions slow past the storefront's request budget and are retried. |
| 13:09 | Checkout work queue depth passes its drain threshold. |
| 13:13 | Pricing replica recovers; quote latency returns to normal. |
| 13:19 | Storefront retry policy is reduced to one attempt by configuration change. |
| 13:22 | Queue drains; checkout recovers. |

## Impact

Checkout was degraded for twenty minutes, of which six were after the pricing fault had cleared.
No data was lost and no shopper was charged incorrectly.

## Root cause

The storefront retried a slow submission twice without a retry budget, so retried load was added
to the offered load rather than replacing it.

## Detection

Queue depth was visible on an existing dashboard throughout. No alert is attached to it, so the
on-call engineer found the sustained queue only after the pricing fault had cleared.

## Action items

| id | action | owner | status |
|---|---|---|---|
| AI-1 | Keep the reduced storefront retry policy and record it in the interface contract | Checkout team | Completed |
| AI-2 | Alert on checkout work queue depth and retry rate | Checkout team | Open |
