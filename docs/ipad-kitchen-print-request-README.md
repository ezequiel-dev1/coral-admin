# iPad Kitchen Print Request

## Goal

When a staff member needs a kitchen ticket, the iPad POS creates a durable kitchen-print job in Coral. It does not format a ticket, discover an Android device, or connect to a printer. The Android kitchen tablet receives and prints the job.

This extends [Native POS Ordering API Design](native-pos-api-design.md). The contract is proposed work and must be implemented in the Coral admin backend before the iPad app depends on it.

## User flow

```text
Staff confirms order -> iPad POSTs print job -> job persisted -> Android tablet prints
```

Show “Kitchen print requested” once the API accepts the job. Do not show “printed”: iPad has requested a job, not received physical-printer confirmation.

## Authentication

Use the existing Cognito authorization-code-with-PKCE session and ID token:

```http
Authorization: Bearer <id-token>
```

The iPad does not connect to AppSync Events and must not contain printer credentials, AWS IAM credentials, AppSync API keys, or Android device data.

## Request a kitchen print

After the canonical order exists, call:

```http
POST /api/pos/v1/orders/{orderId}/print-jobs
Authorization: Bearer <id-token>
Content-Type: application/json
```

```json
{ "clientRequestId": "2f0e0c5b-4fec-4cc0-b7d8-ff1c42d1fd31", "destination": "kitchen" }
```

`clientRequestId` is a UUID generated once per explicit user print action. Persist it with the action until there is a definitive response. If a request times out or the app restarts, retry the identical request and UUID; never make a new UUID for an automatic retry. The server derives `locationId` from authenticated staff/device context, not iPad input.

Example successful response:

```json
{
  "job": {
    "id": "40c6d6eb-7c4b-4db2-9f5f-252071fa248a",
    "orderId": "6ef...",
    "locationId": "default",
    "destination": "kitchen",
    "status": "pending",
    "createdAt": "2026-11-19T20:00:00.000Z"
  },
  "created": true
}
```

- `201 Created`, `created: true`: new request recorded.
- `200 OK`, `created: false`: an earlier request was recorded; treat as success and do not submit again.

Android may advance the job to `claimed`, `printed`, or `failed`. These states do not require iPad retry in the first release.

## When to request

Call only after create/update order returns a canonical order ID. For this release make it explicit: a `Send to kitchen` button after creation, or a deliberate `Print kitchen ticket` action on an existing open order.

Do not enqueue on screen open, refresh, or reconciliation. Automatic prints on edits need later product rules for new, change, and reprint tickets.

Disable the control while in flight. On network failure retain “Sending kitchen request…” and retry with the same UUID when online. If the user leaves the screen before a response, retain—not replace—the pending UUID.

## Error handling

| Response | iPad behavior |
| --- | --- |
| `400` | Show a non-retryable validation error and report app build/request ID. |
| `401` | Refresh/sign in, then retry the same request UUID. |
| `403` | Explain that the account cannot request kitchen prints; do not auto-retry. |
| `404` | Refresh the order; it may be removed or the environment is wrong. |
| `409` | Refresh canonical order and follow server message; do not create a new UUID. |
| `5xx` / timeout | Retain UUID and retry with bounded exponential backoff when online. |

Do not infer Android print status from a socket, printer state, or an API timeout. The iPad guarantee is only that the backend accepted the job.

## Environment configuration

Use the existing POS base URLs:

| Environment | Base URL |
| --- | --- |
| UAT | `https://admin-uat.coral.restaurant` |
| Production | `https://admin.coral.restaurant` |

Keep the selected environment visible in non-production builds. A UAT iPad
enqueues only to the UAT backend, which publishes only to the separate UAT
AppSync Event API and `/uat/locations/{locationId}/kitchen/print-jobs` channel.
Production uses its own Event API and
`/production/locations/{locationId}/kitchen/print-jobs` channel. The iPad does
not connect to either channel directly.

## Kitchen printer availability

Poll `GET /api/pos/v1/kitchen-printer-status` every 20 seconds while the
order screen is visible. Render `ready`, `reconnecting`, `error`, or
server-calculated `offline` honestly, including heartbeat age when available.
Keep `Send to kitchen` available while offline: it creates a durable job, but
the UI must say **queued**, never **printed**. The iPad never contacts Android
directly and receives no bridge credentials.

## Checklist and UAT tests

1. Add a typed API client and persistent UUID for each in-flight request.
2. Add the explicit action only where an order has a canonical ID.
3. Implement retry and app-relaunch recovery exactly as above.
4. Log `orderId`, `jobId` when available, and anonymized outcomes—never tokens or full notes.
5. In UAT, verify one request produces one Android ticket; timeout retry with the stored UUID produces no duplicate; Android offline then started later prints the ticket; unauthorized users create no job; and UAT never reaches production.

## Out of scope

Ticket rendering, printer-failure retry, receipts, and direct iPad-to-Android communication.
