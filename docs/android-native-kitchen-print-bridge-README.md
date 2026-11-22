# Android Native Kitchen Print Bridge

## Goal

Make the Android tablet the always-on kitchen-print worker, even when another Android app is visible and the Coral web app is backgrounded or not open. The native bridge owns order-job delivery, printing, acknowledgement, and recovery. The Coral web app is optional for this workflow and only provides setup/status UI when it is open.

This plan builds on [Android Kitchen Print Relay](android-kitchen-print-relay-README.md). The backend print-job API and durable `kitchen-print-jobs` record remain mandatory; moving the listener into native Android does not make WebSocket delivery durable.

## Recommended design

```text
iPad -> Coral API creates durable kitchen job -> AppSync Events / push wake-up
                                                    |
                                                    v
                                         Android native bridge service
                                         list + claim canonical job
                                                    |
                                                    v
                                      native printer SDK / network printer
                                                    |
                                                    v
                                    complete or fail job through Coral API

Coral web app (when open) <-> local native bridge status/control interface
```

The Android native app, not the web page or WebView JavaScript, subscribes to events and calls the print-job API. Therefore switching to another app cannot stop the printing workflow merely because the web page has been paused.

## Android lifecycle decision

Use a user-enabled `KitchenPrintService` as a **foreground service** while the device is assigned as an active kitchen printer. Its persistent notification should say `Kitchen printer active` and expose `Pause`/`Stop` actions. A foreground service is the appropriate model for a continuously active operation that remains noticeable to staff; it can continue after the user moves to another app. [Android service overview](https://developer.android.com/develop/background-work/services)

Do not rely on an ordinary background service or a permanent background WebSocket. Android restricts background services on modern Android releases. [Android service overview](https://developer.android.com/develop/background-work/services)

The service must be explicitly started while the bridge app is visible, for example when a manager enables `Kitchen printer active`. Android 12+ restricts starting foreground services from the background, so an arbitrary background event cannot be assumed to start the worker. [Foreground-service start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)

Use `WorkManager` for reconciliation after boot, process restart, connectivity restoration, and periodic recovery; it persists scheduled work across restarts and reboots, but it is not the low-latency print path. [Android task scheduling](https://developer.android.com/develop/background-work/background-tasks/persistent)

The system cannot print if the user force-stops the bridge, disables its notification/service, marks it Restricted, removes its printer/network access, or powers off the tablet. The UI must make this operational state obvious.

## Native components

| Component | Responsibility |
| --- | --- |
| `KitchenPrintService` | Foreground-service lifecycle, authenticated event connection, connectivity state, and single-worker coordination. |
| `PrintJobRepository` | Calls list/claim/complete/fail endpoints; stores local metadata and retries safely. |
| `EventClient` | Receives AppSync Events while service is active; sends only a job ID into the repository. |
| `ReconciliationWorker` | WorkManager worker that lists pending/expired jobs and wakes/resumes processing when allowed. |
| `PrinterAdapter` | One interface over the selected vendor SDK, ESC/POS Bluetooth/USB, or network printer. |
| `TicketRenderer` | Converts the canonical order returned by `claim` into the versioned kitchen ticket. |
| `BridgeDatabase` | Room database for service state, claimed job metadata, printer configuration, and non-sensitive diagnostics. |
| `BridgeActivity` | Pair/configure printer, select location, show printer and queue health, and explicitly start/stop the service. |
| `WebAppBridge` | Optional authenticated local integration for the Coral web app to read status or open settings; it never supplies printing authority. |

All blocking I/O and printer calls run off the service main thread. Android services execute on their hosting process's main thread unless the app explicitly uses a worker/coroutine/dispatcher. [Android service overview](https://developer.android.com/develop/background-work/services)

## Job-processing protocol

1. The service starts after a staff member enables the kitchen printer and shows its notification immediately.
2. It signs in as the registered `KitchenPrinter` device identity, then
   subscribes only to its configured environment channel:
   `/{environment}/locations/{locationId}/kitchen/print-jobs`.
3. An AppSync event is a hint only. On receipt, and on every recovery scan, the repository asks the API for pending jobs.
4. For each job, call `claim`. The backend conditionally leases one job to one device and returns the canonical order.
5. Store the claim locally, render the ticket, and send it to `PrinterAdapter` with `jobId` as its correlation ID.
6. On confirmed printer spool/print success, call `complete`. On a known failure, call `fail` with a stable error code and surface it in the bridge UI.
7. If the result is unknown (for example, printer call timeout), retain `unknown-outcome`; do not automatically reprint. Require an operator retry/decision to avoid duplicate kitchen tickets.
8. Process one job at a time per physical printer unless the selected printer SDK explicitly guarantees safe ordering.

The service should renew a long-running claim or use a sufficiently short ticket timeout and reclaim rules. It must never call `complete` for a job it no longer owns.

## Event delivery and recovery

Primary low-latency path: keep an AppSync Events connection from the active foreground service. If the connection drops, reconnect with jittered exponential backoff and immediately reconcile jobs after reconnect.

Recovery path: schedule a unique WorkManager job with network constraints at service start, after a failed event connection, after boot, and after the connectivity callback. It lists pending and expired claims and resumes work only if the bridge is still enabled. WorkManager is intentionally not expected to deliver an instant print.

Optional second trigger: send a high-priority FCM data message containing only `jobId` to the registered bridge device. It can prompt immediate reconciliation when the foreground service is not alive. Treat it only as a wake-up hint: Android may downgrade high-priority messages when they are not used for time-sensitive, user-visible work, and background foreground-service starts have restrictions. [Android restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)

The durable API queue is the only correctness mechanism. AppSync, FCM, and periodic work are all accelerators.

## Printer health and keep-alive

While active, `KitchenPrintService` posts `POST /api/kitchen/v1/printer-status`
every 20 seconds and immediately on a state change. It reports only
`bridgeState` (`active` or `paused`), `printerState` (`ready`, `reconnecting`,
`error`, or `paused`), an optional printer label, and a stable bounded error
code. Coral records server time and declares the printer `offline` after 90
seconds without a heartbeat.

Probe the printer using the vendor SDK or a transport-safe status operation
every 30 seconds while idle. On failure, report `reconnecting` and retry with
jittered backoff of 1, 2, 5, 10, 30, then 60 seconds. Keep the connection
alive only while a manager-enabled foreground service is running; WorkManager
is for post-reboot/network recovery, not continuous connectivity. The iPad
reads its status from Coral and has no control of the bridge.

### Environment isolation

Provision separate UAT and production AppSync Event APIs, Cognito/device
principals, API base URLs, DynamoDB tables, and FCM configurations. Channel
names remain explicitly separated inside those APIs:

```text
/uat/locations/{locationId}/kitchen/print-jobs
/production/locations/{locationId}/kitchen/print-jobs
```

The bridge has one immutable active environment per installation/build (or a
manager-only environment switch that clears enrollment and requires explicit
re-enrollment). It must reject an event whose environment does not match local
configuration and must never subscribe with an environment wildcard. A UAT
device must not hold production endpoints or credentials.

## Authentication and device registration

Do not use a shared staff login or credentials embedded in the APK. Add a backend-managed device enrollment flow:

1. A manager signs in and registers the tablet against a `locationId` and printer label.
2. The backend issues/associates a least-privilege `KitchenPrinter` principal or device-bound refresh session.
3. The bridge stores refresh credentials with Android Keystore-backed encrypted storage.
4. API authorization derives permitted location and destination from that device identity. The bridge cannot claim another location's jobs.
5. A manager can revoke the device; the service stops, clears its token, and shows `Re-enrollment required`.

The native bridge needs the same `claim`, `complete`, `fail`, and pending-list endpoints described in the relay plan. It must not publish its own success event or write DynamoDB directly.

## Web-app interaction

The web app should not need to stay open. When it is open on the same Android tablet, it can query a narrow bridge API for `active`, printer name, queue count, last ticket result, and error state, and it can deep-link to bridge settings.

If a WebView JavaScript bridge is used, expose only commands such as `getStatus()` and `openPrinterSettings()`. Avoid a JavaScript `print(order)` method. All printing must originate from a claimed backend job, otherwise any open page or stale order can bypass authorization and idempotency.

## Android permissions and deployment

- Declare the foreground-service type and required foreground-service permission appropriate to the final SDK/target version; confirm exact manifest requirements during implementation.
- Request Bluetooth/nearby-device, USB, network, or printer-vendor permissions only for the chosen connection method.
- On dedicated kitchen tablets, document the one-time operational setup: disable battery optimization for the bridge if appropriate under device policy, allow its foreground notification, grant printer permissions, and start the service after reboot if the OS permits it.
- Test on the actual OEM tablet image. Battery management can differ substantially by manufacturer.

## Delivery plan

1. Complete the backend durable print-job API, location/device mapping, and UAT AppSync Event API.
2. Build `BridgeActivity`, enrollment, Room state, and a fake `PrinterAdapter` for UAT.
3. Implement foreground `KitchenPrintService`, AppSync listener, API claim flow, and serialized ticket worker.
4. Add WorkManager reconciliation and reboot/connectivity recovery.
5. Integrate the production printer adapter and native error/status UI.
6. Optionally add FCM wake-up after the durable path is proven.
7. Add the web app's read-only bridge status integration last; printing must already work without it.

## Acceptance tests

- Start the bridge, switch to another Android app, request a kitchen print from iPad, and verify one ticket prints.
- Background the Coral web app or terminate its WebView; the native bridge still prints.
- Disconnect/reconnect Wi-Fi and verify event reconnect plus pending-job reconciliation.
- Restart the tablet, reopen/enable bridge, and verify a previously pending job prints exactly once.
- Simulate printer failure and unknown timeout; verify failures are visible and unknown outcomes are not auto-reprinted.
- Revoke enrollment and verify the device cannot claim jobs; verify a different location cannot receive them.
- Force-stop/restrict the bridge and verify monitoring correctly shows the printer unavailable rather than claiming it is active.
