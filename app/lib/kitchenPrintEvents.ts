import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { APP_ENV } from "./tables";
import type { KitchenPrintJob } from "./kitchenPrintJobs";

/** Publish only routing metadata; the kitchen device fetches the canonical order. */
export async function publishKitchenPrintRequested(job: KitchenPrintJob): Promise<void> {
  const endpoint = process.env.KITCHEN_EVENTS_HTTP_URL;
  if (!endpoint) return; // Local development and unprovisioned environments still retain the job.
  const url = new URL(endpoint);
  const event = { type: "kitchen-print-requested", jobId: job.id, locationId: job.locationId, destination: job.destination, createdAt: job.createdAt };
  const signer = new SignatureV4({ credentials: defaultProvider(), region: process.env.KITCHEN_EVENTS_REGION ?? "us-east-1", service: "appsync", sha256: Sha256 });
  const signed = (await signer.sign({ protocol: url.protocol, hostname: url.hostname, path: url.pathname, method: "POST", headers: { host: url.hostname, "content-type": "application/json" }, body: JSON.stringify({ channel: `/${APP_ENV}/locations/${job.locationId}/kitchen/print-jobs`, events: [JSON.stringify(event)] }) } as never)) as unknown as { headers: HeadersInit; body?: BodyInit };
  const response = await fetch(url.toString(), { method: "POST", headers: signed.headers, body: signed.body });
  if (!response.ok) throw new Error(`AppSync publish returned ${response.status}`);
}
