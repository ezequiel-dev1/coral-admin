import type { NextConfig } from "next";

// Static export (S3 deploy) is the production target. Disable it when
// STRIPE_DEV=1 so `npm run dev` runs a real server and the Stripe route
// handlers under app/api/* work for the local proof-of-concept.
const isStripeDev = process.env.STRIPE_DEV === "1";

const nextConfig: NextConfig = {
  ...(isStripeDev
    ? {}
    : {
        output: "export",
        // A static export has no server, so the Stripe route handlers under
        // app/api/**/route.ts cannot be part of it (they would fail the build).
        // Dropping "ts" from pageExtensions makes Next ignore every route.ts
        // while still recognizing page.tsx / layout.tsx. The route files are
        // only used by `npm run dev:stripe` (STRIPE_DEV=1).
        pageExtensions: ["tsx", "jsx"],
      }),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
