/**
 * HTTP transport abstraction for the Cloud Reader API.
 *
 * Amazon blocks non-browser TLS fingerprints, so the concrete transport must
 * impersonate a real browser. The interface is intentionally tiny so we can
 * swap strategies (decision log): CycleTlsTransport (local TLS impersonation,
 * default) → PlaywrightTransport (local headless browser, fallback).
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
 * Baseline transport using Node's built-in fetch. Simplest possible impl and
 * useful for wiring/tests, but Amazon will likely challenge it due to TLS
 * fingerprinting — use only to validate the pipeline. Real runs should use a
 * TLS-impersonating transport (see roadmap Checkpoint 1 follow-up).
 */
export class FetchTransport implements HttpTransport {
  async get(req: HttpRequest): Promise<HttpResponse> {
    const res = await fetch(req.url, { method: "GET", headers: req.headers });
    return { status: res.status, body: await res.text() };
  }
}
