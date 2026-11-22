# Android Kitchen Print Relay

## Goal

Allow the Coral web app, when running on the Android kitchen tablet, to receive an iPad-requested kitchen print and hand the canonical order to the Android native printing bridge. The iPad never accesses a printer directly.

The first release supports kitchen tickets only. It does not change payments, order editing, or the existing native POS ordering contract.

## Architecture

```text
iPad POS -> Coral API + DynamoDB -> Android kitchen tablet
           durable print job        web app subscribes
           AppSync event (job ID)   fetches canonical job/order
                                            |
                                            v
                                     Android native bridge -> kitchen printer
                                            |
                                            v
                                  completion or failure is recorded in Coral
```

AppSync Events is a delivery signal, not the system of record. The API and DynamoDB persist the job, state, and attempts. This prevents a missed WebSocket event, browser reload, or tablet outage from losing a kitchen ticket.

## Backend work in this repository

### Durable jobs

Create an environment-specific `kitchen-print-jobs` DynamoDB table. Each record needs `id`, `orderId`, `locationId` (use `default` initially), `destination` (`kitchen`), `status` (`pending`, `claimed`, `printed`, `failed`), timestamps, `requestedBy`, `claimedBy`, `claimExpiresAt`, `failureReason`, and `attemptCount`.

Use a conditional DynamoDB write so one iPad action is stored once. The iPad supplies UUID `clientRequestId`; uniqueness is per `locationId`, `destination`, and `clientRequestId`. Fetch the canonical order when Android claims the job; never put complete order data on the event channel.

### API routes

Add these routes to production and UAT API Gateway maps, Lambda route loader, authorization checks, OpenAPI, and tests. They use the existing Cognito ID-token convention.

| Method and path | Caller | Behavior |
| --- | --- | --- |
| `POST /api/pos/v1/orders/{orderId}/print-jobs` | iPad POS | Creates one kitchen job and publishes its ID after the successful write. |
| `GET /api/kitchen/v1/print-jobs?status=pending` | Android tablet | Lists pending and expired-claim jobs for the caller's location. |
| `POST /api/kitchen/v1/print-jobs/{jobId}/claim` | Android tablet | Atomically leases the job and returns it plus canonical order. |
| `POST /api/kitchen/v1/print-jobs/{jobId}/complete` | Android tablet | Marks the caller's active claim `printed`. |
| `POST /api/kitchen/v1/print-jobs/{jobId}/fail` | Android tablet | Releases or marks a job failed with a bounded, non-sensitive reason. |
| `POST /api/kitchen/v1/printer-status` | Android tablet | Records a bridge/printer heartbeat. |
| `GET /api/pos/v1/kitchen-printer-status` | iPad POS | Returns server-calculated printer availability for the caller location. |

Example create request:

```http
POST /api/pos/v1/orders/6ef.../print-jobs
Authorization: Bearer <id-token>
Content-Type: application/json

{ "clientRequestId": "2f0e0c5b-4fec-4cc0-b7d8-ff1c42d1fd31", "destination": "kitchen" }
```

Return `201` for a new job and `200` with `created: false` for a retry using the same request ID. Never publish before the durable write succeeds. If publish fails, leave the job pending; Android polling recovers it.

### AppSync Events

Create one AppSync Event API per environment and never share endpoints or
credentials between them. Publish only:

```json
{ "type": "kitchen-print-requested", "jobId": "40c6d6eb-7c4b-4db2-9f5f-252071fa248a", "locationId": "default", "destination": "kitchen", "createdAt": "2026-11-19T20:00:00.000Z" }
```

Channels are also environment-prefixed, even though the Event APIs are
separate:

```text
/uat/locations/{locationId}/kitchen/print-jobs
/production/locations/{locationId}/kitchen/print-jobs
```

The UAT backend may publish only to the UAT Event API and `/uat/...` channel;
the production backend may publish only to the production Event API and
`/production/...` channel. Do not make a wildcard subscription spanning
environments.

Configure Cognito authorization. Do not use API keys in either app or the web bundle. A `KitchenPrinter` device principal can subscribe only to its location; the backend publishes with IAM. Re-enforce location/device role when a job is claimed.

Expose only non-secret config:

```text
NEXT_PUBLIC_KITCHEN_EVENTS_HTTP_URL=
NEXT_PUBLIC_KITCHEN_EVENTS_REALTIME_URL=
NEXT_PUBLIC_KITCHEN_EVENTS_REGION=us-east-1
NEXT_PUBLIC_KITCHEN_EVENTS_ENVIRONMENT=uat
```

Never expose AWS access keys, publisher credentials, or an AppSync API key.

### Android web relay

1. Subscribe after authenticated startup and reconnect with jittered exponential backoff.
2. Validate event shape, then call `claim`; never print event payload data.
3. Render the returned canonical order into a versioned ticket and pass `{ jobId, ticket }` to the Android native bridge.
4. Call `complete` only after bridge spool/print success; on error call `fail` and show the failed job.
5. On startup, foreground, reconnect, and every 30 seconds while visible, fetch pending jobs and claim them. This is missed-event recovery.

While active, the bridge sends a status heartbeat every 20 seconds and probes
the printer every 30 seconds while idle. The API returns `offline` after 90
seconds without a heartbeat. The iPad may queue a job during an outage, but it
must describe that request as queued, not printed.

Suggested bridge contract:

```ts
type KitchenPrinterBridge = {
  printKitchenTicket(input: { jobId: string; ticket: KitchenTicket }): Promise<{
    jobId: string; printed: boolean; printerJobId?: string; errorCode?: string;
  }>;
};
```

Treat a printer timeout as unknown, not failed. Retrying may duplicate a physical ticket, so show the job to an operator if delivery cannot be confirmed.

### Security and operations

- Add `KitchenPrinter` as a dedicated Cognito group/device identity; never use an administrator session for the kitchen tablet.
- Derive and enforce location and destination server-side on every call.
- Log job create, claim, completion, failure, expiry, and publish error with `jobId`, `orderId`, and request ID. Do not log notes or tokens.
- Alarm on aged pending jobs, repeated failures, and AppSync publish failures.
- Do not TTL-expire a pending or failed job.

## Delivery and UAT acceptance

1. Define kitchen-device/location mapping and the ticket format.
2. Deliver table, routes, conditional writes, and API tests in UAT.
3. Provision UAT AppSync and least-privilege authorization.
4. Add relay/bridge acknowledgement, test recovery, then promote to production.

UAT must demonstrate: one iPad request produces one ticket; retrying the same `clientRequestId` does not duplicate it; Android processes a job sent while it was offline; reconnect recovery works; a printer failure remains visible/auditable; and a different-location device cannot access the job.

## Out of scope

Direct iPad-to-Android networking, iOS printer access, receipts, bar tickets, payments, and automatic reprints. Native bridge spool/print acknowledgement is the first reliable completion boundary; paper output itself cannot be guaranteed.
