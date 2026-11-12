// Bundles the API Lambda for one environment.
//
//   npm run build:api        -> infra/api-dist/index.mjs      (production)
//   npm run build:api:uat    -> infra/api-dist-uat/index.mjs  (UAT)
//
// Terraform (infra/api.tf and infra/api-uat.tf) zips those folders and deploys them.
//
// - NEXT_PUBLIC_APP_ENV is fixed per bundle so each Lambda can only ever address
//   its own DynamoDB tables (see app/lib/tables.ts): coral-prod-* or coral-*.
// - `next/server` is aliased to a tiny shim; the real Next.js is not bundled.
// - @aws-sdk/* is provided by the Lambda nodejs22.x runtime, so it is external.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appEnv = process.argv[2] ?? "production";
if (appEnv !== "production" && appEnv !== "uat") {
  console.error(`Usage: build-api.mjs [production|uat] (got "${appEnv}")`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "infra", appEnv === "uat" ? "api-dist-uat" : "api-dist");

rmSync(outDir, { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: ["infra/api/lambda.ts"],
  outfile: path.join(outDir, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: false,
  sourcemap: false,
  external: ["@aws-sdk/*"],
  alias: { "next/server": "./infra/api/next-server-shim.ts" },
  define: {
    "process.env.NEXT_PUBLIC_APP_ENV": JSON.stringify(appEnv),
  },
  // Some bundled CommonJS deps call require() on Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
