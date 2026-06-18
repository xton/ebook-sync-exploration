import { describe, expect, it } from "vitest";
import {
  clampFraction,
  computeFraction,
  toKindleBook,
  toProgress,
} from "../../../src/kindle/mapping.js";
import type { LibraryItem, StartReadingResponse } from "../../../src/kindle/api-types.js";

describe("clampFraction", () => {
  it("passes through values in range", () => {
    expect(clampFraction(0)).toBe(0);
    expect(clampFraction(0.5)).toBe(0.5);
    expect(clampFraction(1)).toBe(1);
  });
  it("clamps out-of-range and non-finite values", () => {
    expect(clampFraction(-0.2)).toBe(0);
    expect(clampFraction(1.7)).toBe(1);
    expect(clampFraction(Number.NaN)).toBe(0);
    expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("computeFraction", () => {
  it("computes (start + position) / end", () => {
    expect(
      computeFraction({
        startPosition: 0,
        endPosition: 10000,
        lastPageReadData: { position: 4200 },
      }),
    ).toBeCloseTo(0.42);
  });

  it("defaults startPosition to 0", () => {
    expect(
      computeFraction({ endPosition: 200, lastPageReadData: { position: 50 } }),
    ).toBeCloseTo(0.25);
  });

  it("clamps to 1 when fully read or beyond", () => {
    expect(
      computeFraction({
        startPosition: 0,
        endPosition: 8000,
        lastPageReadData: { position: 8000 },
      }),
    ).toBe(1);
  });

  it("returns undefined without a last-read position", () => {
    expect(computeFraction({ startPosition: 0, endPosition: 100 })).toBeUndefined();
  });

  it("returns undefined when endPosition is missing or zero", () => {
    expect(computeFraction({ lastPageReadData: { position: 10 } })).toBeUndefined();
    expect(
      computeFraction({ endPosition: 0, lastPageReadData: { position: 10 } }),
    ).toBeUndefined();
  });

  it("returns undefined when the API returns nulls (e.g. CONTENT_UNSUPPORTED)", () => {
    expect(
      computeFraction({
        startPosition: null,
        endPosition: null,
        lastPageReadData: null,
      }),
    ).toBeUndefined();
  });
});

describe("toProgress", () => {
  it("builds progress with position string and synced date", () => {
    const res: StartReadingResponse = {
      startPosition: 0,
      endPosition: 10000,
      lastPageReadData: { position: 4200, syncTime: 1_718_500_000_000 },
    };
    const progress = toProgress(res);
    expect(progress).toBeDefined();
    expect(progress?.fraction).toBeCloseTo(0.42);
    expect(progress?.position).toBe("4200");
    expect(progress?.updatedAt.getTime()).toBe(1_718_500_000_000);
  });

  it("uses epoch 0 when syncTime is absent", () => {
    const progress = toProgress({
      endPosition: 100,
      lastPageReadData: { position: 50 },
    });
    expect(progress?.updatedAt.getTime()).toBe(0);
  });

  it("returns undefined when there is no progress", () => {
    expect(toProgress({ startPosition: 0, endPosition: 100 })).toBeUndefined();
  });
});

describe("toKindleBook", () => {
  const item: LibraryItem = {
    asin: "B0CABC1234",
    title: "The Three-Body Problem",
    authors: ["Liu, Cixin"],
  };

  it("maps id, title, authors and progress", () => {
    const book = toKindleBook(item, {
      startPosition: 0,
      endPosition: 10000,
      lastPageReadData: { position: 4200, syncTime: 1_718_500_000_000 },
    });
    expect(book.id).toBe("B0CABC1234");
    expect(book.title).toBe("The Three-Body Problem");
    expect(book.authors).toEqual(["Liu, Cixin"]);
    expect(book.progress?.fraction).toBeCloseTo(0.42);
  });

  it("omits progress when no reading data is supplied", () => {
    const book = toKindleBook(item);
    expect(book.progress).toBeUndefined();
  });
});
