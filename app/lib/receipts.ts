import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fetchAuthSession } from "aws-amplify/auth";

const REGION = "us-east-1";
const BUCKET = "coral-admin-receipts";

async function getS3Client(): Promise<S3Client> {
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error("No AWS credentials available.");
  }

  return new S3Client({ region: REGION, credentials });
}

/**
 * Generates a pre-signed URL for a receipt image.
 * URL expires in 5 minutes — only authenticated users can generate one.
 */
export async function getReceiptUrl(key: string): Promise<string> {
  if (!key) return "";
  const client = await getS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

/**
 * Generates a pre-signed GET URL for an S3 object. Alias of getReceiptUrl —
 * reused for menu item images and any other object in the bucket.
 */
export async function getObjectUrl(key: string): Promise<string> {
  return getReceiptUrl(key);
}

/**
 * Uploads a menu item image to S3 under the `menu-items/` key prefix using a
 * pre-signed PUT URL. Returns the stored object key to persist on the item.
 */
export async function uploadMenuItemImage(file: File): Promise<string> {
  const client = await getS3Client();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const key = `menu-items/${Date.now()}${ext ? `.${ext}` : ""}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: file.type || "application/octet-stream",
  });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  const response = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.status}`);
  }

  return key;
}
