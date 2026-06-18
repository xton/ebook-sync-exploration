#!/usr/bin/env node
import { Command } from "commander";
import { DEFAULT_CONFIG_PATH, loadConfig } from "../config/config.js";
import { CookieApiSource } from "../kindle/cookie-source.js";
import { sampleFixtureSource } from "../kindle/fixture-source.js";
import type { KindleSource } from "../kindle/source.js";
import { CycleTlsTransport } from "../kindle/cycletls-transport.js";
import { ensureConfig } from "./setup.js";
import { formatBookList } from "./format.js";

const program = new Command();
program
  .name("ebook-sync")
  .description("Bridge reading progress between Kindle and KOSync (KOReader)");

const kindle = program.command("kindle").description("Kindle (Cloud Reader) commands");

kindle
  .command("list")
  .description("List Kindle books and reading progress")
  .option("--fixture", "Use offline sample data (no network/credentials)")
  .action(async (opts: { fixture?: boolean }) => {
    let source: KindleSource;

    if (opts.fixture) {
      source = sampleFixtureSource();
    } else {
      // Run setup wizard if no config exists yet, then load.
      const wizardConfig = await ensureConfig(DEFAULT_CONFIG_PATH);
      const config = wizardConfig ?? (await loadConfig());

      if (!config.kindle) {
        throw new Error(
          "No Kindle credentials in config/config.json. Delete the file and re-run to start setup.",
        );
      }

      const transport = new CycleTlsTransport();
      source = new CookieApiSource(transport, {
        cookies: config.kindle.cookies,
        ...(config.kindle.deviceSessionToken
          ? { deviceSessionToken: config.kindle.deviceSessionToken }
          : {}),
      });

      const books = await (source as CookieApiSource).listBooks();
      await transport.close();
      console.log(`Kindle library (${books.length} books):`);
      console.log(formatBookList(books));
      return;
    }

    const books = await source.listBooks();
    console.log(`Kindle library (${books.length} books):`);
    console.log(formatBookList(books));
  });

kindle
  .command("setup")
  .description("Re-run the cookie setup wizard")
  .action(async () => {
    const { runSetupWizard } = await import("./setup.js");
    await runSetupWizard(DEFAULT_CONFIG_PATH);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
