# Coral Native POS Ordering API Design

## Purpose

This document is the integration reference for the Coral iOS and Android POS
applications. The mobile apps take and edit orders. They do not take, create,
or settle payments. Payments remain in the Coral web application.

The API is online-only in this release. An app must have a network connection
before it creates, changes, or cancels an order. Offline storage, queues, and
reconciliation are intentionally outside this version of the contract.

## Environments

| Environment | Base URL | Data and payment mode | Intended use |
| --- | --- | --- | --- |
| UAT | `https://admin-uat.coral.restaurant` | Isolated UAT DynamoDB tables and Stripe test configuration | Development and acceptance testing |
| Production | `https://admin.coral.restaurant` | Production DynamoDB tables and live web payment configuration | Restaurant operations |

All endpoints below are relative to the environment base URL. For example,
the UAT menu URL is `https://admin-uat.coral.restaurant/api/pos/v1/menu`.

## Authentication and authorization

The apps authenticate Coral staff through the `coral-native-pos` Cognito
client using OAuth authorization code flow with PKCE. Both iOS and Android
currently use the registered callback `coralapp://auth/callback`; each app
must register that scheme with its operating system.

Send the Cognito **ID token** on every API request:

```http
Authorization: Bearer <id-token>
```

The token is valid for one hour. Use the Cognito refresh token flow before it
expires. A request without a valid token is rejected by API Gateway before it
reaches the application.

The caller must belong to one of these Cognito groups: `POS`, `Mesero`,
`Manager`, `Administrator`, or `Overlord`. `Administrator` and `Overlord`
remain management roles; the recommended mobile role is `POS` or `Mesero`.

Never embed AWS credentials, an app client secret, Stripe keys, or a shared
restaurant password in the app. The native Cognito client is a public client
and does not use a client secret.

## API conventions

- Requests and responses use JSON with UTF-8 encoding.
- Use `Content-Type: application/json` for request bodies.
- Amounts are decimal Mexican pesos, not centavos. For example, `125.5` means
  MXN $125.50.
- Times are ISO 8601 UTC strings, for example `2026-11-18T20:30:00.000Z`.
- IDs are opaque strings, except `clientRequestId`, which must be a UUID.
- Treat unknown response fields as forward-compatible additions.
- Do not retry non-idempotent updates automatically. Order creation is safe to
  retry only when the exact same `clientRequestId` and body are used.

## Order lifecycle

```text
Mobile creates open order
          |
          +-- Mobile edits or cancels while open
          |
          +-- Web app takes payment and marks paid
                    |
                    +-- Mobile may read paid status but cannot modify it
```

`open` is the only status mobile clients can change. A mobile client receives
`409 Conflict` when it attempts to edit or cancel a paid, held, cancelled, or
otherwise non-open order.

## Menu

### Get sellable menu

```http
GET /api/pos/v1/menu
Authorization: Bearer <id-token>
```

Only items marked available and whose required ingredients are available are
returned. The response contains current prices and modifier groups. Cache it
briefly for rendering, but refresh it when the app enters the foreground and
before submitting an order; the server is authoritative.

`imageUrl` is a private S3 pre-signed download URL, not encoded image data.
It is `null` when an item has no image and otherwise expires after the number
of seconds in `imageUrlExpiresIn` (currently 300). Download and cache the
image bytes locally; never construct an S3 URL from an item ID or retain an
expired signed URL.

```json
{
  "generatedAt": "2026-11-18T20:30:00.000Z",
  "imageUrlExpiresIn": 300,
  "items": [
    {
      "id": "menu-burger-classic",
      "name": "Classic Burger",
      "description": "Beef, lettuce, tomato and house sauce",
      "category": "Burgers",
      "price": "185.00",
      "imageUrl": "https://coral-admin-receipts.s3.amazonaws.com/menu-items/burger.jpg?...",
      "order": 10,
      "modifierGroups": [
        {
          "id": "cook",
          "name": "Cook temperature",
          "type": "single",
          "required": true,
          "options": [
            { "id": "medium", "name": "Medium", "price": 0 },
            { "id": "well", "name": "Well done", "price": 0 }
          ]
        }
      ]
    }
  ]
}
```

For a `single` group, send at most one option. For a required group, send at
least one option. For a `multi` group, send zero or more options. A modifier
selection must belong to the selected menu item.

## Orders

### Create order

```http
POST /api/pos/v1/orders
Authorization: Bearer <id-token>
Content-Type: application/json
```

```json
{
  "clientRequestId": "b74d61b8-732f-4a0a-a790-637696261e8e",
  "tableLabel": "Table 8",
  "seat": 2,
  "serviceType": "dine-in",
  "customerName": "Ana",
  "notes": "Birthday party",
  "items": [
    {
      "menuItemId": "menu-burger-classic",
      "quantity": 2,
      "modifierSelections": [
        { "groupId": "cook", "optionId": "medium" }
      ],
      "instructions": "No onion on one"
    }
  ]
}
```

`clientRequestId` is the idempotency key and becomes the Coral order ID. Generate
it once when the user confirms the order and retain it until a successful
response. If the network fails after submission, retry the same request with
the same value. A `201` response means the order was created; `200` with
`"created": false` means that idempotency key already exists and the API has
returned the canonical existing order.

For `dine-in` orders, `tableLabel` identifies the table and `seat` identifies
the guest at that table. `seat` is a positive integer from 1 through 100 and
is required for dine-in orders; omit it for takeout orders. Both fields are
returned on the canonical order, so clients should preserve them when replacing
an order. For dine-in orders, the server also copies the order seat onto each
canonical line item so kitchen tickets route items to the correct guest.

The app must not submit menu names, item prices, discounts, tax, totals,
payment details, or a caller-selected order status. The server looks up the
menu, validates selections, and calculates the stored price snapshot.

### Read and list orders

```http
GET /api/pos/v1/orders/{orderId}
GET /api/pos/v1/orders?status=open
GET /api/pos/v1/orders?updatedSince=2026-11-18T00:00:00.000Z
```

Valid `status` values are `open`, `held`, `paid`, and `cancelled`. The list is
intended for active/recent order reconciliation and currently returns up to 500
orders newest first. `updatedSince` is accepted as an ISO timestamp; clients
should treat it as a creation-time filter in this first release and periodically
refresh the open-order list, because the API does not yet provide a durable
cursor, change token, or true last-updated timestamp.

### Replace an open order

```http
PATCH /api/pos/v1/orders/{orderId}
Authorization: Bearer <id-token>
Content-Type: application/json
```

The body is the create-order body without `clientRequestId`. It replaces all
order lines and editable details, so the client must send the complete desired
order, not a partial patch. The server revalidates the current menu and
recalculates totals. Keep the returned order as the local source of truth.

### Cancel an open order

```http
POST /api/pos/v1/orders/{orderId}/cancel
Authorization: Bearer <id-token>
```

The cancellation body is empty. A successful response is:

```json
{ "cancelled": true }
```

## Canonical order response

Create, get, and update responses wrap the stored canonical order:

```json
{
  "order": {
    "id": "b74d61b8-732f-4a0a-a790-637696261e8e",
    "createdAt": "2026-11-18T20:30:00.000Z",
    "tableLabel": "Table 8",
    "seat": 2,
    "server": "staff@example.com",
    "serviceType": "dine-in",
    "source": "pos",
    "status": "open",
    "items": [
      {
        "lineId": "8b2b7429-373d-4e42-b0a4-b2ff75e5d7b4",
        "menuItemId": "menu-burger-classic",
        "name": "Classic Burger",
        "basePrice": 185,
        "unitPrice": 185,
        "quantity": 2,
        "modifiers": [
          { "groupId": "cook", "group": "Cook temperature", "id": "medium", "name": "Medium", "price": 0 }
        ],
        "instructions": "No onion on one"
      }
    ],
    "subtotal": 370,
    "tax": 0,
    "tip": 0,
    "total": 370,
    "notes": "Birthday party"
  },
  "created": true
}
```

`total` does not imply payment. A mobile-created order starts open. The web app
is responsible for recording any cash, card, transfer, tip, refund, or payment
provider state.

## Errors and client behavior

| Status | Meaning | App behavior |
| --- | --- | --- |
| `400` | Invalid JSON, missing required field, invalid modifier, unavailable item, or malformed filter | Show the API error and refresh the menu if selection-related |
| `401` | Missing, expired, or invalid token at API Gateway | Refresh session or require sign-in |
| `403` | Authenticated user lacks a POS group | Show access denied; do not retry |
| `404` | Order ID does not exist | Remove stale local reference and refresh list |
| `409` | Duplicate/invalid order transition or order no longer open | Fetch the canonical order and show its current state |
| `429` | API Gateway throttle limit | Retry with exponential backoff and jitter |
| `500` | Unexpected server failure | Preserve the unsent draft locally for user-directed retry; do not fabricate success |

## Required app behavior

1. Keep the menu and active order list in memory while online.
2. Generate a UUID only when a user explicitly confirms a new order.
3. Disable the submit button while a create request is in flight, but support a
   safe retry with the same UUID if the result is uncertain.
4. Use the canonical response to replace local order state after every create
   or update.
5. Show a clear read-only state for `paid`, `held`, and `cancelled` orders.
6. Refresh an order after `409 Conflict`; another staff member may have paid it
   in the web app.
7. Do not build an offline order queue in this release. If offline, explain
   that the order could not be sent and leave it as an unsaved draft.

## UAT acceptance checklist

- Sign in on each platform with a POS-authorized test user.
- Load the UAT menu and render required/single/multi modifier groups.
- Create an order and verify it appears in the UAT web Orders and Checkout
  views.
- Repeat the create request with the same `clientRequestId` and verify one
  order exists.
- Edit and cancel an open order from mobile.
- Pay an open mobile-created order in the UAT web app, then verify mobile sees
  `paid` and receives `409` when attempting to edit it.
- Confirm an unavailable menu item cannot be ordered after a menu refresh.
- Verify UAT data does not appear in production, and vice versa.

## Future work not in this version

- Offline drafts, queueing, conflict resolution, and reconciliation.
- Cursor-based synchronization or push notifications.
- Per-device registration, device audit trail, and remote device revocation.
- Kitchen workflow endpoints and printer integration.
- Split checks and payment initiation from mobile.
