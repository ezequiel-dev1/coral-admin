import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/adminAuth";
import { fetchMenuForSync } from "@/app/lib/dynamodb-server";

const signer = new S3Client({ region: "us-east-1" });
const bucket = "coral-admin-receipts";

/** Authenticated UAT contract shared by native iPad and Android clients. */
export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "uat") return NextResponse.json({ error: "Not found" }, { status: 404 });
  // API Gateway verifies the JWT; this defense-in-depth check limits private
  // menu data and signed image URLs to the established management roles.
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { items } = await fetchMenuForSync();
  const menu = await Promise.all(items.filter((item) => item.available).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(async (item) => ({
    id: item.id, name: item.name, description: item.description ?? "", category: item.category, price: item.price, order: item.order ?? 0,
    imageUrl: item.imageKey ? await getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: item.imageKey }), { expiresIn: 300 }) : null,
  })));
  return NextResponse.json({ environment: "uat", generatedAt: new Date().toISOString(), imageUrlExpiresIn: 300, items: menu }, { headers: { "Cache-Control": "private, max-age=60" } });
}
