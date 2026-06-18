/**
 * Interactive first-run setup wizard.
 *
 * Collects the four Amazon session cookies (required) plus an optional device
 * session token (improves reading-progress accuracy) and writes config/config.json.
 */
import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Config } from "../config/config.js";

export const COOKIE_NAMES = ["at-main", "session-id", "ubid-main", "x-main"] as const;

const COOKIE_INSTRUCTIONS = `
To authenticate with Kindle you need four session cookies from read.amazon.com.

Steps:
  1. Open https://read.amazon.com in Chrome or Firefox and sign in.
  2. Open DevTools (F12 / Cmd+Option+I)
  3. Go to: Application (Chrome) or Storage (Firefox) → Cookies → https://read.amazon.com
  4. Copy the Value of each cookie when prompted below.

These are stored locally in config/config.json (gitignored) and never sent
anywhere except Amazon's own servers.
`;

const TOKEN_INSTRUCTIONS = `
Optional: device session token (improves reading-progress accuracy).

Without it, 'kindle list' may show [--] for all books.

To get it:
  1. Open https://read.amazon.com in Chrome and sign in.
  2. Open DevTools → Network tab → filter by "getDeviceToken"
  3. Reload the page, click the getDeviceToken request, go to Response.
  4. Copy the value of "deviceSessionToken".

Press Enter to skip.
`;

export async function runSetupWizard(configPath: string): Promise<Config> {
  console.log(COOKIE_INSTRUCTIONS);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (label: string) => rl.question(`  ${label}: `);

  console.log("Paste each cookie value and press Enter:\n");
  const atMain = await prompt("at-main");
  const sessionId = await prompt("session-id");
  const ubidMain = await prompt("ubid-main");
  const xMain = await prompt("x-main");

  console.log(TOKEN_INSTRUCTIONS);
  const deviceSessionToken = await prompt("deviceSessionToken (optional)");

  rl.close();

  const token = deviceSessionToken.trim();
  const config: Config = {
    kindle: {
      cookies: {
        atMain: atMain.trim(),
        sessionId: sessionId.trim(),
        ubidMain: ubidMain.trim(),
        xMain: xMain.trim(),
      },
      ...(token ? { deviceSessionToken: token } : {}),
    },
  };

  await mkdir("config", { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`\nSaved to ${configPath}. Run 'ebook-sync kindle list' again.\n`);

  return config;
}

export async function ensureConfig(configPath: string): Promise<Config | null> {
  if (existsSync(configPath)) return null;
  console.log(`No config found at ${configPath}. Starting setup wizard…\n`);
  return runSetupWizard(configPath);
}
