/**
 * Offline KindleSource backed by canned API payloads. Powers `--fixture` demos
 * and unit/functional tests without touching the network.
 */
import type { KindleBook } from "../domain/types.js";
import type { LibraryItem, StartReadingResponse } from "./api-types.js";
import { toKindleBook } from "./mapping.js";
import type { KindleSource } from "./source.js";

export interface KindleFixtureEntry {
  readonly item: LibraryItem;
  readonly reading?: StartReadingResponse;
}

export class FixtureSource implements KindleSource {
  constructor(private readonly entries: readonly KindleFixtureEntry[]) {}

  listBooks(): Promise<readonly KindleBook[]> {
    return Promise.resolve(
      this.entries.map((e) => toKindleBook(e.item, e.reading)),
    );
  }
}

/** A small, realistic sample library for demos. */
export const SAMPLE_ENTRIES: readonly KindleFixtureEntry[] = [
  {
    item: { asin: "B0CABC1234", title: "The Three-Body Problem", authors: ["Liu, Cixin"] },
    reading: {
      startPosition: 0,
      endPosition: 10000,
      lastPageReadData: { position: 4200, syncTime: 1_718_500_000_000, deviceName: "Kindle App" },
    },
  },
  {
    item: { asin: "B0CDEF5678", title: "Project Hail Mary", authors: ["Weir, Andy"] },
    reading: {
      startPosition: 0,
      endPosition: 8000,
      lastPageReadData: { position: 8000, syncTime: 1_718_400_000_000, deviceName: "Kindle Oasis" },
    },
  },
  {
    item: { asin: "B0CGHI9012", title: "A Memory Called Empire", authors: ["Martine, Arkady"] },
    // Owned but never opened — no progress.
  },
];

export const sampleFixtureSource = (): FixtureSource => new FixtureSource(SAMPLE_ENTRIES);
