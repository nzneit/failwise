# INC-2026-0314: payment gateway authorization timeouts during a promotion

## Summary

During a two-hour promotion the payment gateway answered authorization calls slower than the
checkout service's timeout budget. Checkout abandoned the calls and shoppers could not complete
checkout. Some abandoned authorizations were later settled by the gateway, so a small number of
shoppers were charged without an order.

## Timeline

| Time (UTC) | Event |
|---|---|
| 09:00 | Promotion opens. Submission rate rises to roughly three times the daily peak. |
| 09:14 | Gateway p99 authorization latency crosses the client timeout budget. |
| 09:16 | Gateway begins returning 429 for the merchant; the client treats 429 as retryable. |
| 09:18 | Latency alert on gateway calls pages the on-call engineer. |
| 10:05 | Submission rate falls below the merchant rate limit; authorizations recover. |
| 11:30 | Reconciliation finds authorizations settled at the gateway with no confirmed order. |

## Impact

Checkout was unavailable or degraded for sixty-six minutes, and roughly nine per cent of
submissions in the window failed. Fourteen shoppers were charged for carts that were never
confirmed; all fourteen were refunded by support within two days.

This is the fourth authorization-timeout incident on this gateway in the twelve months to
2026-03-14, counting only incidents in which authorization calls exceeded the client timeout
budget and no decision was returned.

## Root cause

The client timeout budget was longer than the storefront's own request budget, so the storefront
gave up while checkout was still waiting. The per-merchant rate limit was reached because the
promotion was not rate-shaped, and the client retried the resulting 429 responses.

## Detection

Latency and error-rate alerting on gateway calls paged four minutes after the first timeout. The
charge-without-order effect had no alert and surfaced in the next day's manual reconciliation.

## Action items

| id | action | owner | status |
|---|---|---|---|
| AI-1 | Align the gateway client timeout with the storefront request budget | Payments team | Open |
| AI-2 | Treat 429 from the gateway as a shed signal rather than a retryable error | Payments team | Open |
| AI-3 | Reconcile abandoned authorizations within the settlement window and void the ones with no confirmed order | Payments team | Open |
| AI-4 | Rate-shape promotion traffic ahead of the merchant limit | Checkout team | Completed |
