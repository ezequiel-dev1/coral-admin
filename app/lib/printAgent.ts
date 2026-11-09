// Client for the Coral Print Agent (Android app on the same tablet).
// Access is restricted by the page's Origin (must be on the agent's allow list); no token is sent.

export const AGENT_URL = "http://127.0.0.1:8765";

/** Paper is 48 columns wide at size 1 (48/N characters at size N). */
export const PRINT_COLUMNS = 48;

export type AgentErrorKind = "network" | "timeout" | "unsupported" | "other";

export interface AgentResult {
  ok: boolean;
  message: string; // agent-provided message (empty for network/timeout)
  status: number | null; // null = network error or timeout
  error?: AgentErrorKind;
}

export type Align = "left" | "center" | "right";

export interface PrintLine {
  text: string; // max 200 chars
  align?: Align; // default "left"
  bold?: boolean;
  underline?: boolean;
  size?: 1 | 2 | 3 | 4; // character magnification, default 1
}

/** "kitchen" = kitchen order tickets; "register" = cashier/receipts (only one wired to the cash drawer). */
export type PrinterName = "kitchen" | "register";

export interface PrintJob {
  printer: PrinterName; // always sent explicitly
  lines: (string | PrintLine)[]; // 1..500 entries
  feed?: number; // blank lines before the cut, 0..10, default 3
  cut?: boolean; // default true
  openDrawer?: boolean; // pulse the cash drawer, default false; only valid with printer "register"
  /** Print the Coral logo (bundled in the agent app) centered above `lines`. Register printer only: the agent answers 400 for "kitchen", so always send `printer: "register"` with it. */
  logo?: boolean;
}

// Characters the printer's IBM437 code page can show beyond plain ASCII.
const CP437_EXTRA = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥ƒáíóúñÑªº¿¬½¼¡«»";

/**
 * Make text safe for the IBM437 thermal printer: keep ASCII and the accents
 * IBM437 has, reduce other accented letters to their base letter (Á -> A) and
 * replace anything else (emoji, symbols) with "?".
 */
export function toPrinterText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 32 && code < 127) || CP437_EXTRA.includes(ch)) {
      out += ch;
      continue;
    }
    if (ch === "—" || ch === "–") {
      out += "-";
      continue;
    }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += base.length > 0 && base.charCodeAt(0) < 127 && base.charCodeAt(0) >= 32 ? base : "?";
  }
  return out;
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<AgentResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_URL}${path}`, {
      method,
      signal: ctrl.signal,
      ...(body !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    const data = await res.json().catch(() => ({ message: res.statusText }));
    const ok = res.ok && data.ok === true;
    if (res.status === 400 || res.status === 413) {
      // Invalid or oversized payload is a bug on our side: log it.
      console.error(`Print agent rejected the job (${res.status}):`, data.message);
    }
    return {
      ok,
      message: data.message ?? "",
      status: res.status,
      // 403 (origin not allowed) carries no CORS headers, so it normally surfaces as a network error.
      error: ok ? undefined : res.status === 403 ? "network" : res.status === 404 ? "unsupported" : "other",
    };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return { ok: false, status: null, message: "", error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export const printAgent = {
  status: () => call("GET", "/status"),
  testPrint: (printer: PrinterName) => call("POST", "/print/test", { printer }),
  /** Pulse the cash drawer (the agent always uses the register printer). */
  openDrawer: () => call("POST", "/drawer/open"),
  /**
   * Print a custom job. Kitchen tickets go to "kitchen"; customer receipts go to "register"
   * (set openDrawer for cash payments). Never retried automatically: a 502 may still have printed.
   */
  print: (job: PrintJob) => call("POST", "/print", job),
};

/** Printing only works in Chrome on the tablet itself (the agent listens on its loopback). */
export function canUsePrintAgent(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}
