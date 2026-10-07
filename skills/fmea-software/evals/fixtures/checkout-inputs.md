# Checkout service: design inputs

Synthetic inputs for the fmea-software evals. Nothing here describes a real system.

## Critical flows

1. A signed-in shopper submits a cart; the checkout service prices it, authorizes payment, writes the order, and returns a confirmation.
2. A shopper retries a submission after a timeout; the checkout service must not authorize the same cart twice.
3. A shopper resumes an abandoned session from a saved link.

## Component inventory

| Element | Role | Boundary | Security-relevant | Parent | What it is |
|---|---|---|---|---|---|
| checkout | service | in_scope | no | none | The checkout service: orchestrates pricing, payment authorization, and order persistence. |
| checkout.api | interface | in_scope | no | checkout | The public HTTP interface the storefront calls to submit and confirm a cart. |
| checkout.payment-gateway | service | third_party | no | checkout | A third-party card authorization gateway reached over HTTPS. |
| checkout.order-store | datastore | in_scope | no | checkout | The relational store holding orders and their state transitions. |
| checkout.session-auth | component | in_scope | yes | checkout | The session token issuer and verifier that authenticates a shopper. |
| pricing | service | owned_outside | no | none | The pricing service that returns a priced cart for a shopper and a locale. |

## Dependencies

- checkout depends on checkout.payment-gateway. Strong: a failed authorization fails the checkout.
- checkout depends on pricing. Weak: checkout falls back to the last quoted price held in the cart when pricing does not answer.
- pricing is run by the platform team and is not under analysis here; checkout sees only its published contract.

## SLAs and limits

- checkout.payment-gateway: 99.95% monthly availability; 50 rps per merchant, enforced by the gateway with HTTP 429.
- pricing: 99.9% monthly availability.
- checkout.order-store: 99.99% monthly availability; no published request ceiling.

## Existing controls

- Circuit breaker on gateway calls, opening after consecutive authorization timeouts.
- Latency and error-rate alerting on gateway calls, paging the on-call engineer.
- Daily comparison of gateway authorizations against confirmed orders.
- Idempotency keys on submissions, deduplicating a retried cart.
- Contract tests on checkout.api, run in the storefront's pipeline.
- Write-ahead audit reconciler on checkout.order-store, comparing acknowledged writes against stored rows nightly.
- Session token signature verification on every request.
- Alert on a session token presented from two distinct client fingerprints within one session.
- Cache age dashboard for the last quoted price held in the cart.
- Fallback to the last quoted price held in the cart when pricing does not answer.

## Incidents

- INC-2026-0314: payment gateway authorization timeouts during a promotion.
- INC-2026-0502: stale prices served from the cart's last quoted price.
- INC-2026-0621: a retry storm from the storefront during a partial pricing outage.

## Contracts

- Storefront to checkout.api: submissions carry an idempotency key; the storefront retries a 5xx at most twice with backoff.
- checkout to checkout.payment-gateway: authorization requests carry a merchant id; the gateway returns 429 above the per-merchant rate.
- checkout to pricing: a quote request carries a cart id and a locale; a quote is valid for the shopper's session.

## Ground rules

- The analysis covers the design of the checkout service and the interfaces it owns, not the storefront and not the gateway's internals.
- A failure whose agent is an adversary is recorded and handed off to threat modeling; it is not rated as a lower-severity reliability failure.
