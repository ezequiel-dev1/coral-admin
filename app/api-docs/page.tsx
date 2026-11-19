import type { Metadata } from "next";
import { SwaggerClient } from "./SwaggerClient";

export const metadata: Metadata = {
  title: "Native POS API Reference | Coral",
  description: "OpenAPI reference for the Coral iOS and Android ordering API.",
};

export default function ApiDocsPage() {
  return (
    <main>
      <header style={{ maxWidth: 1460, margin: "0 auto", padding: "24px 32px 4px" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Coral Native POS API</h1>
        <p>Online ordering API for the iOS and Android POS apps. Use Sign in with Coral to authorize protected requests. Payments are web-only.</p>
      </header>
      <SwaggerClient />
    </main>
  );
}
