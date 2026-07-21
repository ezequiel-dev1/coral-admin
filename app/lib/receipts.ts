import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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
