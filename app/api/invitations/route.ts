import { AdminAddUserToGroupCommand, AdminCreateUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const allowedGroups = new Set(["Administrator", "Manager", "Mesero"]);
const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });

function isOverlord(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "").split(".")[1];
    const payload = token && JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return Array.isArray(payload?.["cognito:groups"]) && payload["cognito:groups"].includes("Overlord");
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!isOverlord(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const pool = process.env.COGNITO_USER_POOL_ID;
  if (!pool) return NextResponse.json({ error: "Invitations are not configured" }, { status: 500 });
  let body: { email?: string; groups?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase();
  const groups = Array.isArray(body.groups) ? body.groups.filter((group) => allowedGroups.has(group)) : [];
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || groups.length === 0) return NextResponse.json({ error: "Email and at least one group are required" }, { status: 400 });
  try {
    await cognito.send(new AdminCreateUserCommand({ UserPoolId: pool, Username: email, UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }, { Name: "name", Value: email.split("@")[0] }], DesiredDeliveryMediums: ["EMAIL"] }));
    await Promise.all(groups.map((GroupName) => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: pool, Username: email, GroupName }))));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[invitations] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not send invitation" }, { status: 502 });
  }
}
