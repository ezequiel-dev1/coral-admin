import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { isPosRequest } from "@/app/lib/adminAuth";
import { fetchMenuForSync } from "@/app/lib/dynamodb-server";
import { isMenuItemAvailable } from "@/app/lib/dynamodb";

const signer = new S3Client({ region: "us-east-1" });
const RECEIPTS_BUCKET = "coral-admin-receipts";
const IMAGE_URL_EXPIRES_IN = 300;

/** Sellable menu contract for the online native POS clients. */
export async function GET(request: NextRequest) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { items, ingredients } = await fetchMenuForSync();
  const sellableItems = items
    .filter((item) => isMenuItemAvailable(item, ingredients))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const menu = await Promise.all(sellableItems.map(async ({ id, name, description, category, price, order, modifierGroups, imageKey }) => ({
    id, name, description, category, price, order, modifierGroups: modifierGroups ?? [],
    // The S3 key remains private; native clients receive an expiring download URL.
    imageUrl: imageKey ? await getSignedUrl(signer, new GetObjectCommand({ Bucket: RECEIPTS_BUCKET, Key: imageKey }), { expiresIn: IMAGE_URL_EXPIRES_IN }) : null,
  })));
  return NextResponse.json({ generatedAt: new Date().toISOString(), imageUrlExpiresIn: IMAGE_URL_EXPIRES_IN, items: menu }, { headers: { "Cache-Control": "private, max-age=60" } });
}
