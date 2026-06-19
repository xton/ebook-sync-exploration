/**
 * Raw shapes returned by the KOSync REST API, validated with zod so drifted or
 * malformed responses fail loudly. Translated into domain types in `mapping.ts`.
 *
 * Endpoints (Spore spec: koreader/koreader plugins/kosync.koplugin/api.json):
 *   POST /users/create            { username, password }
 *   GET  /users/auth              → { authorized: "OK" }   (x-auth-user/key)
 *   PUT  /syncs/progress          { document, progress, percentage, device, device_id }
 *   GET  /syncs/progress/:document → progress record (below)
 *
 * Auth: x-auth-user = username, x-auth-key = md5(password). KOReader hashes the
 * password client-side, so the server stores (and we send) the md5 digest.
 */
import { z } from "zod";

/** Response from `GET /users/auth`. */
export const AuthResponseSchema = z
  .object({
    authorized: z.string().optional(),
  })
  .passthrough();
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Response from `GET /syncs/progress/:document`.
 *
 * For a document the server has never seen, KOSync returns an empty/partial
 * object, so every field is optional. `percentage` is already a 0..1 fraction;
 * `progress` is the source-native locator (an xpointer for EPUBs, a page number
 * for PDFs); `timestamp` is Unix *seconds*.
 */
export const ProgressResponseSchema = z
  .object({
    document: z.string().optional(),
    progress: z.string().optional(),
    percentage: z.number().nullish(),
    device: z.string().optional(),
    device_id: z.string().optional(),
    timestamp: z.number().nullish(),
  })
  .passthrough();
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;
