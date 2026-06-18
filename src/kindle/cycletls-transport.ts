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
    const body =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data);
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
