/**
 * TLS-impersonating transport backed by CycleTLS.
 *
 * Amazon's read.amazon.com checks the TLS fingerprint of incoming connections
 * and blocks clients that don't look like a real browser (decision log). This
 * transport uses CycleTLS to impersonate Chrome's TLS handshake locally — no
 * cookies or data leave the machine via a third party.
 */
// CycleTLS is a CJS package; the callable initialiser is on .default at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initCycleTLS = (await import("cycletls")).default as unknown as (
  opts?: Record<string, unknown>,
) => Promise<{
  get(url: string, opts: Record<string, unknown>): Promise<{ status: number; data: unknown }>;
  exit(): void;
}>;

import type { HttpRequest, HttpResponse, HttpTransport } from "./transport.js";

/**
 * CycleTLS can return the response body as a string, a plain object (already
 * parsed JSON), or a Node Buffer (when the response was binary / not decoded).
 * Normalise all three to a UTF-8 string so callers always get text.
 */
function decodeBody(data: unknown): string {
  if (typeof data === "string") return data;
  // Buffer-like: { type: "Buffer", data: number[] }
  if (
    data !== null &&
    typeof data === "object" &&
    "type" in data &&
    (data as Record<string, unknown>)["type"] === "Buffer" &&
    Array.isArray((data as Record<string, unknown>)["data"])
  ) {
    return Buffer.from(
      (data as { type: string; data: number[] }).data,
    ).toString("utf8");
  }
  // Anything else (already-parsed object) — re-serialise so callers can JSON.parse it.
  return JSON.stringify(data);
}

type CycleTLSClient = Awaited<ReturnType<typeof initCycleTLS>>;

export class CycleTlsTransport implements HttpTransport {
  private client: CycleTLSClient | null = null;

  private async getClient(): Promise<CycleTLSClient> {
    if (!this.client) {
      this.client = await initCycleTLS();
    }
    return this.client;
  }

  async get(req: HttpRequest): Promise<HttpResponse> {
    const client = await this.getClient();
    const res = await client.get(req.url, {
      headers: req.headers,
      userAgent: req.headers["User-Agent"] ?? "",
      tlsClientIdentifier: "chrome_112",
    });
    const body = decodeBody(res.data);
    return { status: res.status, body };
  }

  /** Close the underlying CycleTLS worker process. Call when done. */
  async close(): Promise<void> {
    if (this.client) {
      this.client.exit();
      this.client = null;
    }
  }
}
