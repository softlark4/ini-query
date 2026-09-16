#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { IniParseError, IniQueryError, query } from "./query.js";

function usage(): string {
  return [
    "usage: ini-query <file> <section.key>",
    "",
    "examples:",
    "  ini-query config.ini database.host",
    "  ini-query config.ini timeout        # reads 'timeout' from the global section",
  ].join("\n");
}

function main(argv: string[]): number {
  const [file, path] = argv;
  if (!file || !path) {
    process.stderr.write(usage() + "\n");
    return 2;
  }

  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ini-query: could not read '${file}': ${message}\n`);
    return 1;
  }

  try {
    const value = query(source, path, file);
    process.stdout.write(value + "\n");
    return 0;
  } catch (err) {
    if (err instanceof IniParseError || err instanceof IniQueryError) {
      process.stderr.write(`ini-query: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

process.exit(main(process.argv.slice(2)));
