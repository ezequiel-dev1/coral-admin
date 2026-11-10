/**
 * Minimal stand-in for "next/server", used ONLY when bundling the API Lambda
 * (esbuild aliases `next/server` to this file; see scripts/build-api.mjs).
 *
 * The Stripe route handlers under app/api/** are written against NextRequest /
 * NextResponse. Inside Lambda there is no Next.js server, and pulling the real
 * `next` package into the bundle is heavy, so this shim provides just the
 * surface those handlers use: a Request with `nextUrl`, and NextResponse.json.
 */
export class NextRequest extends Request {
  get nextUrl(): URL {
    return new URL(this.url);
  }
}

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit): Response {
    return Response.json(data, init);
  }
}
