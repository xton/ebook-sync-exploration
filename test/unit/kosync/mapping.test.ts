import { describe, expect, it } from "vitest";
import { toKosyncBook, toKosyncProgress } from "../../../src/kosync/mapping.js";
import type { ProgressResponse } from "../../../src/kosync/api-types.js";
import type { TrackedDocument } from "../../../src/kosync/source.js";

describe("toKosyncProgress", () => {
  it("maps percentage to fraction, position and synced date", () => {
    const res: ProgressResponse = {
      document: "abc",
      progress: "/body/DocFragment[11]/text().0",
      percentage: 0.42,
      timestamp: 1_718_500_000,
    };
    const progress = toKosyncProgress(res);
    expect(progress?.fraction).toBeCloseTo(0.42);
    expect(progress?.position).toBe("/body/DocFragment[11]/text().0");
    // timestamp is in seconds → ms
    expect(progress?.updatedAt.getTime()).toBe(1_718_500_000_000);
  });

  it("clamps an out-of-range percentage", () => {
    expect(toKosyncProgress({ percentage: 1.4, progress: "x" })?.fraction).toBe(1);
    expect(toKosyncProgress({ percentage: -0.2, progress: "x" })?.fraction).toBe(0);
  });

  it("uses epoch 0 when timestamp is absent", () => {
    const progress = toKosyncProgress({ progress: "x", percentage: 0.5 });
    expect(progress?.updatedAt.getTime()).toBe(0);
  });

  it("keeps position when percentage is missing (no fraction)", () => {
    const progress = toKosyncProgress({ progress: "/body/p[1]" });
    expect(progress).toBeDefined();
    expect(progress?.fraction).toBeUndefined();
    expect(progress?.position).toBe("/body/p[1]");
  });

  it("returns undefined for an empty record (document never seen)", () => {
    expect(toKosyncProgress({})).toBeUndefined();
    expect(toKosyncProgress({ document: "abc", progress: "", percentage: null })).toBeUndefined();
  });
});

describe("toKosyncBook", () => {
  const doc: TrackedDocument = {
    hash: "9f86d081884c7d659a2feaa0c55ad015",
    title: "The Three-Body Problem",
    authors: ["Cixin Liu"],
  };

  it("maps id, title, authors and progress", () => {
    const book = toKosyncBook(doc, { progress: "x", percentage: 0.42, timestamp: 1 });
    expect(book.id).toBe("9f86d081884c7d659a2feaa0c55ad015");
    expect(book.title).toBe("The Three-Body Problem");
    expect(book.authors).toEqual(["Cixin Liu"]);
    expect(book.progress?.fraction).toBeCloseTo(0.42);
  });

  it("omits progress when no record is supplied", () => {
    const book = toKosyncBook(doc);
    expect(book.progress).toBeUndefined();
  });

  it("falls back to the hash as title and empty authors", () => {
    const book = toKosyncBook({ hash: "deadbeef" });
    expect(book.title).toBe("deadbeef");
    expect(book.authors).toEqual([]);
  });
});
