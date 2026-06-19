/**
 * Config loading/validation. Secrets live in config/config.json (gitignored).
 */
import { readFile } from "node:fs/promises";
import { z } from "zod";

export const ConfigSchema = z.object({
  kindle: z
    .object({
      cookies: z.object({
        atMain: z.string(),
        sessionId: z.string(),
        ubidMain: z.string(),
        xMain: z.string(),
      }),
      /** Optional — improves startReading accuracy. See `kindle setup`. */
      deviceSessionToken: z.string().optional(),
    })
    .optional(),
  kosync: z
    .object({
      /** Base URL of the KOSync server (e.g. https://sync.koreader.rocks). */
      serverUrl: z.string(),
      username: z.string(),
      /** Plaintext password (same one used in KOReader); md5'd into x-auth-key. */
      password: z.string(),
      /**
       * Documents to track. KOSync has no library-listing endpoint, so the set
       * of books to show is user-curated: each pairs the opaque document hash
       * (KOReader's partial-md5 of the file) with human-readable labels.
       */
      documents: z
        .array(
          z.object({
            hash: z.string(),
            title: z.string().optional(),
            authors: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG_PATH = "config/config.json";

export async function loadConfig(
  path: string = DEFAULT_CONFIG_PATH,
): Promise<Config> {
  const raw = await readFile(path, "utf8");
  return ConfigSchema.parse(JSON.parse(raw));
}
