import { describe, expect, it, vi } from "vitest";
import { KosyncApiSource } from "../../../src/kosync/api-source.js";
import type { KosyncClient } from "../../../src/kosync/client.js";
import type { ProgressResponse } from "../../../src/kosync/api-types.js";
import type { TrackedDocument } from "../../../src/kosync/source.js";

/** Build a stub client whose getProgress is driven by a hash→response map. */
const stubClient = (
  byHash: Record<string, ProgressResponse | Error>,
  authorize = vi.fn().mockResolvedValue(undefined),
): KosyncClient =>
  ({
    authorize,
    getProgress: vi.fn((hash: string) => {
      const r = byHash[hash];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? {});
    }),
  }) as unknown as KosyncClient;

const docs: TrackedDocument[] = [
  { hash: "h1", title: "Book One", authors: ["A"] },
  { hash: "h2", title: "Book Two" },
];

describe("KosyncApiSource.listBooks", () => {
  it("authorizes once, then maps each tracked document's progress", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const client = stubClient(
      {
        h1: { progress: "/p[1]", percentage: 0.5, timestamp: 1 },
        h2: {},
      },
      authorize,
    );
    const books = await new KosyncApiSource(client, { documents: docs }).listBooks();

    expect(authorize).toHaveBeenCalledOnce();
    expect(books).toHaveLength(2);
    expect(books[0]?.title).toBe("Book One");
    expect(books[0]?.progress?.fraction).toBeCloseTo(0.5);
    // No record → no progress, title falls back later but here it has a title.
    expect(books[1]?.progress).toBeUndefined();
  });

  it("keeps the book (without progress) when a fetch fails", async () => {
    const client = stubClient({
      h1: new Error("network"),
      h2: { progress: "/p[2]", percentage: 0.9, timestamp: 1 },
    });
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const books = await new KosyncApiSource(client, { documents: docs }).listBooks();
      expect(books).toHaveLength(2);
      expect(books[0]?.progress).toBeUndefined();
      expect(books[1]?.progress?.fraction).toBeCloseTo(0.9);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("propagates an authorization failure", async () => {
    const client = stubClient({}, vi.fn().mockRejectedValue(new Error("authorization failed")));
    await expect(
      new KosyncApiSource(client, { documents: docs }).listBooks(),
    ).rejects.toThrow(/authorization failed/);
  });
});
