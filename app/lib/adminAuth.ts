import type { NextRequest } from "next/server";

/** Cognito groups from the ID token. API Gateway already verified the signature. */
function groupsOf(req: NextRequest): string[] | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  try {
    const payload = JSON.parse(Buffer.from(header.replace(/^Bearer /i, "").split(".")[1], "base64url").toString("utf8"));
    const groups = payload["cognito:groups"];
    return Array.isArray(groups) ? groups.map(String) : [];
  } catch {
    return [];
  }
}

function claimsOf(req: NextRequest): Record<string, unknown> | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header.replace(/^Bearer /i, "").split(".")[1], "base64url").toString("utf8"));
  } catch { return {}; }
}

/** True for Administrator/Overlord callers (or any caller in local dev, where there is no gateway). */
export function isAdminRequest(req: NextRequest): boolean {
  const groups = groupsOf(req);
  // No token: only acceptable in local dev. In Lambda the gateway always supplies one.
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.some((g) => g === "Administrator" || g === "Overlord");
}

/** Destructive operations (such as order cancellation) require Overlord. */
export function isOverlordRequest(req: NextRequest): boolean {
  const groups = groupsOf(req);
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.includes("Overlord");
}

/** Staff allowed to operate the native POS ordering API. Payments remain web-only. */
export function isPosRequest(req: NextRequest): boolean {
  const groups = groupsOf(req);
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.some((g) => ["Administrator", "Overlord", "Manager", "Mesero", "POS"].includes(g));
}

/** Kitchen tablets have a dedicated principal; staff roles cannot claim jobs. */
export function isKitchenPrinterRequest(req: NextRequest): boolean {
  const groups = groupsOf(req);
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.includes("KitchenPrinter");
}

/** Location is server-derived. The default is retained until device enrollment ships. */
export function locationOf(req: NextRequest): string {
  const location = claimsOf(req)?.["custom:locationId"];
  return typeof location === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(location) ? location : "default";
}
