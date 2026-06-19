/**
 * Offline KosyncSource backed by canned progress payloads. Powers `--fixture`
 * demos and unit/functional tests without touching the network.
 */
import type { KosyncBook } from "../domain/types.js";
import type { ProgressResponse } from "./api-types.js";
import { toKosyncBook } from "./mapping.js";
import type { KosyncSource, TrackedDocument } from "./source.js";

export interface KosyncFixtureEntry {
  readonly doc: TrackedDocument;
  readonly progress?: ProgressResponse;
}

export class KosyncFixtureSource implements KosyncSource {
  constructor(private readonly entries: readonly KosyncFixtureEntry[]) {}

  listBooks(): Promise<readonly KosyncBook[]> {
    return Promise.resolve(
      this.entries.map((e) => toKosyncBook(e.doc, e.progress)),
    );
  }
}

/** A small, realistic sample library for demos (mirrors the Kindle fixture). */
export const SAMPLE_ENTRIES: readonly KosyncFixtureEntry[] = [
  {
    doc: { hash: "9f86d081884c7d659a2feaa0c55ad015", title: "The Three-Body Problem", authors: ["Cixin Liu"] },
    progress: {
      document: "9f86d081884c7d659a2feaa0c55ad015",
      progress: "/body/DocFragment[11]/body/div/p[42]/text().0",
      percentage: 0.42,
      device: "KOReader",
      device_id: "demo-device-1",
      timestamp: 1_718_500_000,
    },
  },
  {
    doc: { hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90", title: "Project Hail Mary", authors: ["Andy Weir"] },
    progress: {
      document: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      progress: "/body/DocFragment[58]/body/div/p[3]/text().0",
      percentage: 1,
      device: "KOReader",
      device_id: "demo-device-1",
      timestamp: 1_718_400_000,
    },
  },
  {
    // Tracked but never opened on a KOSync device → no progress record yet.
    doc: { hash: "0000000000000000000000000000beef", title: "A Memory Called Empire", authors: ["Arkady Martine"] },
  },
];

export const sampleFixtureSource = (): KosyncFixtureSource =>
  new KosyncFixtureSource(SAMPLE_ENTRIES);
