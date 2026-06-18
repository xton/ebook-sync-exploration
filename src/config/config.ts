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
