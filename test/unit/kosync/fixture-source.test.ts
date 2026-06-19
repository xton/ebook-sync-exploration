import { describe, expect, it } from "vitest";
import { sampleFixtureSource } from "../../../src/kosync/fixture-source.js";

describe("KosyncFixtureSource", () => {
  it("lists the sample library with mapped progress", async () => {
    const books = await sampleFixtureSource().listBooks();
    expect(books).toHaveLength(3);

    const byTitle = Object.fromEntries(books.map((b) => [b.title, b]));
    expect(byTitle["The Three-Body Problem"]?.progress?.fraction).toBeCloseTo(0.42);
    expect(byTitle["Project Hail Mary"]?.progress?.fraction).toBe(1);
    // Tracked but never opened → no progress.
    expect(byTitle["A Memory Called Empire"]?.progress).toBeUndefined();
  });
});
