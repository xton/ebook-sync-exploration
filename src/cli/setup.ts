/**
 * Interactive first-run setup wizard.
 *
 * Guides the user through extracting Amazon session cookies from a browser
 * devtools session and writes them to config/config.json.
 *
 * How to get cookies (shown inline):
 *   1. Open https://read.amazon.com in Chrome/Firefox, make sure you're signed in.
 *   2. Open DevTools → Application → Cookies → https://read.amazon.com
 *   3. Copy the value of each cookie listed below.
 */
import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Config } from "../config/config.js";

const COOKIE_NAMES = ["at-main", "session-id", "ubid-main", "x-main"] as const;

const INSTRUCTIONS = `
To authenticate with Kindle you need four session cookies from read.amazon.com.

Steps:
  1. Open https://read.amazon.com in Chrome or Firefox and sign in.
  2. Open DevTools  (F12 / Cmd+Option+I)
  3. Go to: Application (Chrome) or Storage (Firefox) → Cookies → https://read.amazon.com
  4. Copy the Value of each cookie when prompted below.

These cookies are stored locally in config/config.json (gitignored) and never
sent anywhere except Amazon's own servers.
`;

export async function runSetupWizard(configPath: string): Promise<Config> {
  console.log(INSTRUCTIONS);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (label: string) => rl.question(`  ${label}: `);

  console.log("Paste each cookie value and press Enter:\n");
  const atMain = await prompt("at-main");
  const sessionId = await prompt("session-id");
  const ubidMain = await prompt("ubid-main");
  const xMain = await prompt("x-main");

  rl.close();

  const config: Config = {
    kindle: {
      cookies: { atMain: atMain.trim(), sessionId: sessionId.trim(), ubidMain: ubidMain.trim(), xMain: xMain.trim() },
    },
  };

  await mkdir("config", { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`\nSaved to ${configPath}. Run 'ebook-sync kindle list' again.\n`);

  return config;
}

export async function ensureConfig(configPath: string): Promise<Config | null> {
  if (existsSync(configPath)) return null; // already exists; caller loads it normally
  console.log(`No config found at ${configPath}. Starting setup wizard…\n`);
  return runSetupWizard(configPath);
}

// Export cookie names for reference in tests / other modules
export { COOKIE_NAMES };
