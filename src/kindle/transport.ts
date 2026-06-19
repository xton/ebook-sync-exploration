/**
 * HTTP transport abstraction for the Cloud Reader API.
 *
 * The interface is intentionally tiny so we can swap strategies (decision log):
 * FetchTransport (Node's built-in fetch, default) → CycleTlsTransport (local TLS
 * impersonation, opt-in fallback for connections Amazon fingerprint-challenges).
 */
export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

export interface HttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface HttpTransport {
  get(req: HttpRequest): Promise<HttpResponse>;
}

/**
 * Default transport using Node's built-in fetch. Proven against read.amazon.com
 * both behind the container's TLS-re-originating egress proxy and on a direct
 * connection. If a direct connection is ever fingerprint-challenged, fall back
 * to the CycleTLS transport (`--cycletls` / `EBOOK_SYNC_TRANSPORT=cycletls`).
 */
export class FetchTransport implements HttpTransport {
  async get(req: HttpRequest): Promise<HttpResponse> {
    const res = await fetch(req.url, { method: "GET", headers: req.headers });
    return { status: res.status, body: await res.text() };
  }
}
