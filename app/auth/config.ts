/**
 * Cognito configuration.
 *
 * After running `terraform apply`, replace these values with the outputs:
 *   - cognito_user_pool_id
 *   - cognito_client_id
 *   - cognito_domain
 *
 * For local development, you can also set these via environment variables
 * prefixed with NEXT_PUBLIC_.
 */

export const authConfig = {
  userPoolId:
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "us-east-1_REPLACE_ME",
  userPoolClientId:
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "REPLACE_ME",
  domain:
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN ||
    "coral-admin-auth.auth.us-east-1.amazoncognito.com",
  redirectSignIn:
    typeof window !== "undefined" ? window.location.origin + "/" : "http://localhost:3000/",
  redirectSignOut:
    typeof window !== "undefined" ? window.location.origin + "/" : "http://localhost:3000/",
};
