"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PosSwaggerUI = dynamic(
  () => import("./SwaggerUI").then((module) => module.PosSwaggerUI),
  { ssr: false },
);

export function SwaggerClient() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("coral.swagger.idToken");
    if (stored) setIdToken(stored);

    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    if (!code) {
      if (query.get("error")) setMessage(query.get("error_description") ?? "Sign-in was cancelled.");
      return;
    }
    const expectedState = sessionStorage.getItem("coral.swagger.state");
    if (!expectedState || query.get("state") !== expectedState) {
      setMessage("Sign-in state could not be verified. Please try again.");
      return;
    }
    const verifier = sessionStorage.getItem("coral.swagger.verifier");
    if (!verifier) {
      setMessage("The sign-in verifier is missing. Please try again.");
      return;
    }
    const domain = cognitoDomain();
    const clientId = process.env.NEXT_PUBLIC_COGNITO_NATIVE_POS_CLIENT_ID;
    if (!clientId) {
      setMessage("The native POS Cognito client is not configured for this site.");
      return;
    }
    fetch(`${domain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri(), code_verifier: verifier }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Cognito could not exchange the authorization code.");
        return response.json() as Promise<{ id_token?: string }>;
      })
      .then((tokens) => {
        if (!tokens.id_token) throw new Error("Cognito did not return an ID token.");
        sessionStorage.setItem("coral.swagger.idToken", tokens.id_token);
        setIdToken(tokens.id_token);
        setMessage("Signed in. Swagger requests now include your ID token.");
        window.history.replaceState({}, "", "/api-docs");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Sign-in failed."));
  }, []);

  async function signIn() {
    const clientId = process.env.NEXT_PUBLIC_COGNITO_NATIVE_POS_CLIENT_ID;
    if (!clientId) { setMessage("The native POS Cognito client is not configured for this site."); return; }
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    sessionStorage.setItem("coral.swagger.verifier", verifier);
    sessionStorage.setItem("coral.swagger.state", state);
    const url = new URL(`${cognitoDomain()}/oauth2/authorize`);
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri(), scope: "openid email profile", state, code_challenge_method: "S256", code_challenge: challenge }).toString();
    window.location.assign(url);
  }

  function signOut() {
    sessionStorage.removeItem("coral.swagger.idToken");
    sessionStorage.removeItem("coral.swagger.state");
    sessionStorage.removeItem("coral.swagger.verifier");
    setIdToken(null);
    setMessage("Signed out of Swagger.");
  }

  return <>
    <div style={{ maxWidth: 1460, margin: "0 auto", padding: "8px 32px 16px", display: "flex", gap: 12, alignItems: "center" }}>
      <button type="button" onClick={idToken ? signOut : signIn}>{idToken ? "Sign out" : "Sign in with Coral"}</button>
      <span aria-live="polite">{message ?? (idToken ? "Signed in" : "Sign in to run protected requests.")}</span>
    </div>
    <PosSwaggerUI idToken={idToken} />
  </>;
}

function redirectUri() { return `${window.location.origin}/api-docs`; }

function cognitoDomain() {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "coral-admin-auth.auth.us-east-1.amazoncognito.com";
  return domain.startsWith("http") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
