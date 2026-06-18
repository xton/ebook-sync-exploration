/**
 * TLS-impersonating transport backed by CycleTLS.
 *
 * Amazon's read.amazon.com checks the TLS fingerprint of incoming connections
 * and blocks clients that don't look like a real browser (decision log). This
 * transport uses CycleTLS to impersonate Chrome's TLS handshake locally — no
 * cookies or data leave the machine via a third party.
 */
import { unzipSync } from "node:zlib";

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
 * parsed JSON), or a Node Buffer (when the response is binary or gzip-compressed).
 * Normalise all to a UTF-8 string so callers always get text.
 */
function bufferToString(bytes: Buffer): string {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return unzipSync(bytes).toString("utf8");
  }
  return bytes.toString("utf8");
}

function decodeBody(data: unknown): string {
  if (typeof data === "string") {
    // CycleTLS sometimes JSON-serialises a Buffer object into the string field.
    // Detect '{"type":"Buffer","data":[...]}' and decode it recursively.
    if (data.startsWith('{"type":"Buffer"')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return data; // not valid JSON after all — treat as plain string
      }
      return decodeBody(parsed); // decompression errors propagate rather than silently falling back
    }
    return data;
  }
  // Buffer-like object: { type: "Buffer", data: number[] }
  if (
    data !== null &&
    typeof data === "object" &&
    "type" in data &&
    (data as Record<string, unknown>)["type"] === "Buffer" &&
    Array.isArray((data as Record<string, unknown>)["data"])
  ) {
    return bufferToString(Buffer.from((data as { type: string; data: number[] }).data));
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
    process.stderr.write(
      `[DECODE] res keys=${Object.keys(res).join(",")} | typeof data=${typeof res.data}` +
        (res.data && typeof res.data === "object"
          ? ` | data keys=${Object.keys(res.data as object).join(",")} | data.type=${(res.data as Record<string, unknown>)["type"]}`
          : ` | data preview=${String(res.data).slice(0, 40)}`) +
        `\n`,
    );
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
