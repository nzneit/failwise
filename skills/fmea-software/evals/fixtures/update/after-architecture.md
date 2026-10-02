# Checkout service: architecture after the September change

Synthetic input for the fmea-software update-mode eval. It describes the same system as
`before.fmea.json` after one release, and it is the only description of the new structure.

## What changed

1. The payment gateway is no longer on the confirmation path. Checkout now writes an
   authorization intent and settles it asynchronously, so a gateway outage delays settlement
   instead of blocking checkout. The dependency is weak from this release on.
2. Session authentication now binds a token to the client fingerprint recorded when the token
   was issued, and rejects a token presented from a different fingerprint. The component's
   function statement changed with it.
3. A new in-process price cache, `checkout.pricing-cache`, holds priced carts for the length of
   a shopper's session and is read before the pricing service is called.
4. Two controls were retired in the same release (see the control inventory below).

## Component inventory

| Element | Kind | Parent | What it is |
|---|---|---|---|
| checkout | service | none | Orchestrates pricing, payment authorization, and order persistence for a submitted cart. |
| checkout.payment-gateway | external_dependency | checkout | The third-party card authorization gateway, now settled against asynchronously. |
| checkout.session-auth | security_component | checkout | The session token issuer and verifier that authenticates a shopper. |
| checkout.order-store | datastore | checkout | The relational store holding orders and their state transitions. |
| checkout.pricing-cache | component | checkout | In-process cache of priced carts, new in this release. |
| pricing | service | none | Returns a priced cart for a shopper and a locale. |

## Function statements

Unchanged statements are restated here word for word, so that a statement that differs from the
stored analysis differs because the function changed.

- checkout: Turn a submitted cart into a confirmed order exactly once
- checkout.payment-gateway: Return an authorization decision for a card and an amount within the client's timeout budget
- checkout.session-auth: Admit a request only when it carries a session token this component issued, that has not expired, and that is presented from the client fingerprint recorded when the token was issued
- checkout.order-store: Durably persist a confirmed order before acknowledging the write
- checkout.pricing-cache: Return a priced cart held for this session without calling pricing
- pricing: Return a current priced cart for a shopper and a locale

## Dependencies

- checkout depends on checkout.payment-gateway. Weak from this release: a failed authorization
  delays settlement and does not fail the checkout.
- checkout depends on checkout.pricing-cache and, on a miss, on pricing. Weak: a miss on both
  falls back to the price held in the cart.

## Control inventory after the change

This is the complete list of controls in place after the release. Anything not on it is no
longer in place. A control that survived the release is named here with the wording the stored
analysis uses for it, so that a control missing from this list is missing because it was retired.

- latency and error-rate alerting on gateway calls
- idempotency keys on submissions
- contract tests on the checkout interface
- session token signature verification on every request
- fingerprint binding check on every session token
- settlement reconciliation, comparing authorization intents against settled authorizations daily
- cache age dashboard for the last quoted price
