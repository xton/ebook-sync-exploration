#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { CookieApiSource } from "../kindle/cookie-source.js";
import { sampleFixtureSource } from "../kindle/fixture-source.js";
import type { KindleSource } from "../kindle/source.js";
import { FetchTransport } from "../kindle/transport.js";
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
      const config = await loadConfig();
      if (!config.kindle) {
        throw new Error(
          "No Kindle credentials in config/config.json. Run with --fixture for a demo.",
        );
      }
      source = new CookieApiSource(new FetchTransport(), {
        cookies: config.kindle.cookies,
        ...(config.kindle.deviceSessionToken
          ? { deviceSessionToken: config.kindle.deviceSessionToken }
          : {}),
      });
    }

    const books = await source.listBooks();
    console.log(`Kindle library (${books.length} books):`);
    console.log(formatBookList(books));
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
