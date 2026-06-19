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
import { KosyncClient } from "../kosync/client.js";
import { KosyncApiSource } from "../kosync/api-source.js";
import { sampleFixtureSource as kosyncFixtureSource } from "../kosync/fixture-source.js";
import { FetchKosyncTransport } from "../kosync/transport.js";
import { ensureConfig } from "./setup.js";
import { formatBookList } from "./format.js";

const KOSYNC_CONFIG_HELP = `No KOSync config found in ${DEFAULT_CONFIG_PATH}.

Add a "kosync" block, for example:

  {
    "kosync": {
      "serverUrl": "https://sync.koreader.rocks",
      "username": "your-user",
      "password": "your-password",
      "documents": [
        { "hash": "<document-hash>", "title": "Book title", "authors": ["Author"] }
      ]
    }
  }

The document hash is KOReader's per-file identifier (KOSync has no
list-all endpoint, so books to track are listed explicitly).`;

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
    "Force Node's built-in fetch transport (the default).",
  )
  .option(
    "--cycletls",
    "Use the CycleTLS browser-impersonating transport instead of fetch, " +
      "for direct connections that Amazon fingerprint-challenges. " +
      "Also settable via EBOOK_SYNC_TRANSPORT=cycletls.",
  )
  .action(async (opts: { fixture?: boolean; verbose?: boolean; fetch?: boolean; cycletls?: boolean }) => {
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

const kosync = program.command("kosync").description("KOSync (KOReader) commands");

kosync
  .command("list")
  .description("List tracked KOSync documents and reading progress")
  .option("--fixture", "Use offline sample data (no network/credentials)")
  .option("--verbose", "Print raw API responses to stderr for debugging")
  .action(async (opts: { fixture?: boolean; verbose?: boolean }) => {
    if (opts.fixture) {
      const books = await kosyncFixtureSource().listBooks();
      console.log(`KOSync library (${books.length} documents):`);
      console.log(formatBookList(books));
      return;
    }

    const config = await loadConfig().catch(() => {
      throw new Error(KOSYNC_CONFIG_HELP);
    });
    if (!config.kosync) throw new Error(KOSYNC_CONFIG_HELP);

    const client = new KosyncClient(new FetchKosyncTransport(), {
      serverUrl: config.kosync.serverUrl,
      username: config.kosync.username,
      password: config.kosync.password,
      verbose: opts.verbose,
    });
    const source = new KosyncApiSource(client, {
      documents: config.kosync.documents,
      verbose: opts.verbose,
    });

    const books = await source.listBooks();
    console.log(`KOSync library (${books.length} documents):`);
    console.log(formatBookList(books));
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
