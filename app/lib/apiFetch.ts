import { fetchAuthSession } from "aws-amplify/auth";

/**
 * fetch() for the app's own /api/* routes that attaches the signed-in user's
 * Cognito ID token. In production, API Gateway rejects unauthenticated calls to
 * the protected routes (checkout, cancel, reading feedback). Locally the Next
 * route handlers simply ignore the header.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
