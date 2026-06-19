import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KosyncClient } from "../../../src/kosync/client.js";
import type {
  KosyncRequest,
  KosyncResponse,
  KosyncTransport,
} from "../../../src/kosync/transport.js";

/** A scripted transport: returns a queued response and records the request. */
class FakeTransport implements KosyncTransport {
  readonly requests: KosyncRequest[] = [];
  constructor(private readonly responses: KosyncResponse[]) {}
  send(req: KosyncRequest): Promise<KosyncResponse> {
    this.requests.push(req);
    const res = this.responses.shift();
    if (!res) throw new Error("no scripted response left");
    return Promise.resolve(res);
  }
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const newClient = (transport: KosyncTransport, over: Partial<{ serverUrl: string }> = {}) =>
  new KosyncClient(transport, {
    serverUrl: over.serverUrl ?? "https://sync.example.com",
    username: "alice",
    password: "hunter2",
  });

describe("KosyncClient.authorize", () => {
  it("sends auth headers (x-auth-key = md5(password)) and accepts 200 OK", async () => {
    const t = new FakeTransport([{ status: 200, body: JSON.stringify({ authorized: "OK" }) }]);
    await newClient(t).authorize();

    const req = t.requests[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://sync.example.com/users/auth");
    expect(req.headers["x-auth-user"]).toBe("alice");
    expect(req.headers["x-auth-key"]).toBe(md5("hunter2"));
    expect(req.headers["Accept"]).toBe("application/vnd.koreader.v1+json");
  });

  it("throws a credential error on 401", async () => {
    const t = new FakeTransport([{ status: 401, body: '{"message":"Forbidden"}' }]);
    await expect(newClient(t).authorize()).rejects.toThrow(/authorization failed/i);
  });

  it("strips a trailing slash from the server URL", async () => {
    const t = new FakeTransport([{ status: 200, body: "{}" }]);
    await newClient(t, { serverUrl: "https://sync.example.com/" }).authorize();
    expect(t.requests[0]!.url).toBe("https://sync.example.com/users/auth");
  });
});

describe("KosyncClient.getProgress", () => {
  it("requests the document path (URL-encoded) and parses the record", async () => {
    const body = JSON.stringify({
      document: "a/b",
      progress: "/body/p[1]",
      percentage: 0.3,
      timestamp: 100,
    });
    const t = new FakeTransport([{ status: 200, body }]);
    const res = await newClient(t).getProgress("a/b");

    expect(t.requests[0]!.url).toBe("https://sync.example.com/syncs/progress/a%2Fb");
    expect(res.percentage).toBe(0.3);
    expect(res.progress).toBe("/body/p[1]");
  });

  it("treats an empty body as an empty (no-progress) record", async () => {
    const t = new FakeTransport([{ status: 200, body: "" }]);
    const res = await newClient(t).getProgress("abc");
    expect(res.progress).toBeUndefined();
    expect(res.percentage).toBeUndefined();
  });

  it("throws on a non-200 status", async () => {
    const t = new FakeTransport([{ status: 500, body: "boom" }]);
    await expect(newClient(t).getProgress("abc")).rejects.toThrow(/HTTP 500/);
  });
});
