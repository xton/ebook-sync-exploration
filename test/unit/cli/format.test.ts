import { describe, expect, it } from "vitest";
import { formatBookLine } from "../../../src/cli/format.js";
import type { BookRef } from "../../../src/domain/types.js";

const book = (over: Partial<BookRef<string>>): BookRef<string> => ({
  id: "B0CABC1234",
  title: "The Three-Body Problem",
  authors: ["Liu, Cixin"],
  ...over,
});

describe("formatBookLine", () => {
  it("renders percent and synced date when progress exists", () => {
    const line = formatBookLine(
      book({ progress: { fraction: 0.42, updatedAt: new Date("2024-06-16T00:00:00Z") } }),
    );
    expect(line).toContain("42%");
    expect(line).toContain("2024-06-16");
    expect(line).toContain("The Three-Body Problem");
  });

  it("renders a placeholder when there is no progress", () => {
    const line = formatBookLine(book({}));
    expect(line).toContain("--");
    expect(line).not.toContain("%");
  });

  it("marks unsynced (epoch 0) progress", () => {
    const line = formatBookLine(book({ progress: { fraction: 0.1, updatedAt: new Date(0) } }));
    expect(line).toContain("unsynced");
  });

  it("falls back to 'Unknown author' when authors are empty", () => {
    const line = formatBookLine(book({ authors: [] }));
    expect(line).toContain("Unknown author");
  });

  it("shows ' pos' when fraction is undefined (position-only progress)", () => {
    const line = formatBookLine(
      book({ progress: { position: "31493", updatedAt: new Date("2024-06-16T00:00:00Z") } }),
    );
    expect(line).toContain(" pos");
    expect(line).not.toContain("%");
    expect(line).toContain("2024-06-16");
  });
});
