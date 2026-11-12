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

/** True for Administrator/Overlord callers (or any caller in local dev, where there is no gateway). */
export function isAdminRequest(req: NextRequest): boolean {
  const groups = groupsOf(req);
  // No token: only acceptable in local dev. In Lambda the gateway always supplies one.
  if (groups === null) return !process.env.AWS_LAMBDA_FUNCTION_NAME;
  return groups.some((g) => g === "Administrator" || g === "Overlord");
}
