import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MenuItem } from "./dynamodb";

const BUCKET = "coral-admin-receipts";
// Only menu photos are ever handed to Uber; never receipts, payroll or ID documents.
const KEY_PREFIX = "menu-items/";
// Uber downloads the image while it processes the upload, so a short life is enough.
const EXPIRES_SECONDS = 60 * 60;

let s3: S3Client | null = null;

/** Temporary public GET URLs for menu item photos, keyed by Coral item id. */
export async function menuImageUrls(items: Pick<MenuItem, "id" | "imageKey">[]): Promise<Map<string, string>> {
  s3 ??= new S3Client({ region: "us-east-1" });
  const client = s3;
  const entries = await Promise.all(
    items
      .filter((item) => item.imageKey?.startsWith(KEY_PREFIX))
      .map(async (item) => {
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: item.imageKey }), {
          expiresIn: EXPIRES_SECONDS,
        });
        return [item.id, url] as const;
      })
  );
  return new Map(entries);
}
