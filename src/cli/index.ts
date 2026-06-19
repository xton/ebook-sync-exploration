#!/usr/bin/env node
import { Command } from "commander";
import { DEFAULT_CONFIG_PATH, loadConfig } from "../config/config.js";
import { CookieApiSource } from "../kindle/cookie-source.js";
import { sampleFixtureSource } from "../kindle/fixture-source.js";
import { CycleTlsTransport } from "../kindle/cycletls-transport.js";
import type { HttpTransport } from "../kindle/transport.js";
import {
  createTransport,
  resolveTransportKind,
} from "../kindle/transport-factory.js";
import { ensureConfig } from "./setup.js";
import { formatBookList } from "./format.js";

/** Close the transport if it owns a worker process (CycleTLS); fetch is a no-op. */
async function closeTransport(transport: HttpTransport): Promise<void> {
  if (transport instanceof CycleTlsTransport) {
    await transport.close();
  }
}

const program = new Command();
program
  .name("ebook-sync")
  .description("Bridge reading progress between Kindle and KOSync (KOReader)");

const kindle = program.command("kindle").description("Kindle (Cloud Reader) commands");

kindle
  .command("list")
  .description("List Kindle books and reading progress")
  .option("--fixture", "Use offline sample data (no network/credentials)")
  .option("--verbose", "Print raw API responses to stderr for debugging")
  .option(
    "--fetch",
    "Use Node built-in fetch instead of CycleTLS (no TLS impersonation). " +
      "Also settable via EBOOK_SYNC_TRANSPORT=fetch.",
  )
  .action(async (opts: { fixture?: boolean; verbose?: boolean; fetch?: boolean }) => {
    if (opts.fixture) {
      const books = await sampleFixtureSource().listBooks();
      console.log(`Kindle library (${books.length} books):`);
      console.log(formatBookList(books));
      return;
    }

    const wizardConfig = await ensureConfig(DEFAULT_CONFIG_PATH);
    const config = wizardConfig ?? (await loadConfig());

    if (!config.kindle) {
      throw new Error(
        "No Kindle credentials in config/config.json. Delete the file and re-run to start setup.",
      );
    }

    const transport = createTransport(resolveTransportKind(opts));
    const source = new CookieApiSource(transport, {
      cookies: config.kindle.cookies,
      ...(config.kindle.deviceSessionToken
        ? { deviceSessionToken: config.kindle.deviceSessionToken }
        : {}),
      verbose: opts.verbose,
    });

    try {
      const books = await source.listBooks();
      console.log(`Kindle library (${books.length} books):`);
      console.log(formatBookList(books));
    } finally {
      await closeTransport(transport);
    }
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
