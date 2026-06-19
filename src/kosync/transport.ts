/**
 * Tiny HTTP seam for the KOSync REST API.
 *
 * KOSync servers (KOReader's own sync server, Crosspoint, self-hosted) are
 * ordinary JSON REST endpoints — no TLS-fingerprint games like Amazon — so the
 * default transport is just Node's `fetch`. The interface is kept narrow and
 * injectable so tests can supply a fake without touching the network, and so a
 * different client can be dropped in later if needed.
 *
 * Separate from `kindle/transport.ts` on purpose: that seam is GET-only and
 * exists to swap in browser TLS impersonation; this one carries the method/body
 * KOSync needs (GET to read now, PUT to write in Checkpoint 4).
 */
export type HttpMethod = "GET" | "POST" | "PUT";

export interface KosyncRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface KosyncResponse {
  readonly status: number;
  readonly body: string;
}

export interface KosyncTransport {
  send(req: KosyncRequest): Promise<KosyncResponse>;
}

/** Default transport using Node's built-in fetch. */
export class FetchKosyncTransport implements KosyncTransport {
  async send(req: KosyncRequest): Promise<KosyncResponse> {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body !== undefined ? { body: req.body } : {}),
    });
    return { status: res.status, body: await res.text() };
  }
}
