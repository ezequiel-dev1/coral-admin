// Bundles the production API Lambda into infra/api-dist/index.mjs.
// Terraform (infra/api.tf) zips that folder and deploys it.
//
//   npm run build:api
//
// - NEXT_PUBLIC_APP_ENV is fixed to "production" so the bundle can only ever
//   address the coral-prod-* DynamoDB tables (see app/lib/tables.ts).
// - `next/server` is aliased to a tiny shim; the real Next.js is not bundled.
// - @aws-sdk/* is provided by the Lambda nodejs22.x runtime, so it is external.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "infra", "api-dist");

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
    "process.env.NEXT_PUBLIC_APP_ENV": JSON.stringify("production"),
  },
  // Some bundled CommonJS deps call require() on Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
