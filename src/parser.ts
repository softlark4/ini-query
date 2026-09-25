// A small, dependency-free INI parser whose only job beyond parsing is to
// remember exactly where every section and key came from, so that callers
// (see query.ts) can point at the source instead of just saying "not found".

export interface IniValue {
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

export interface IniSection {
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly entries: ReadonlyMap<string, IniValue>;
  readonly keyOrder: readonly string[];
}

export interface ParsedIni {
  readonly sections: ReadonlyMap<string, IniSection>;
  readonly sectionOrder: readonly string[];
}

// Keys that appear before any [section] header live here.
export const GLOBAL_SECTION = "";

export class IniParseError extends Error {
  readonly line: number;
  readonly column: number;
  readonly filename?: string;

  constructor(reason: string, line: number, column: number, source: string, filename?: string) {
    super(formatError(reason, line, column, source, filename));
    this.name = "IniParseError";
    this.line = line;
    this.column = column;
    this.filename = filename;
  }
}

function formatError(reason: string, line: number, column: number, source: string, filename?: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const lineText = lines[line - 1] ?? "";
  const location = filename ? `${filename}:${line}:${column}` : `line ${line}, column ${column}`;
  const gutter = String(line).length;
  const pointer = `${" ".repeat(gutter)}   ${" ".repeat(Math.max(column - 1, 0))}^`;
  return [`${reason} (${location})`, "", `  ${String(line).padStart(gutter)} | ${lineText}`, pointer].join("\n");
}

export function parseIni(source: string, filename?: string): ParsedIni {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rawLines = text.split(/\r\n|\r|\n/);

  const sections = new Map<string, IniSection>();
  const sectionOrder: string[] = [];

  let currentEntries = new Map<string, IniValue>();
  let currentKeyOrder: string[] = [];
  let currentName = GLOBAL_SECTION;
  let currentLine = 0;
  let currentColumn = 0;

  const commitSection = (): void => {
    // An empty, implicit global section (no lines before the first header,
    // or no header at all) carries no information, so skip recording it.
    if (currentName === GLOBAL_SECTION && currentEntries.size === 0) {
      return;
    }
    const existing = sections.get(currentName);
    if (existing) {
      // Repeated [section] blocks merge; the first occurrence of a given key wins.
      for (const key of currentKeyOrder) {
        if (!existing.entries.has(key)) {
          (existing.entries as Map<string, IniValue>).set(key, currentEntries.get(key)!);
          (existing.keyOrder as string[]).push(key);
        }
      }
      return;
    }
    sections.set(currentName, {
      name: currentName,
      line: currentLine,
      column: currentColumn,
      entries: currentEntries,
      keyOrder: currentKeyOrder,
    });
    sectionOrder.push(currentName);
  };

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = rawLines[i] ?? "";
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

    const leading = rawLine.length - rawLine.trimStart().length;

    if (trimmed.startsWith("[")) {
      const closeIndex = rawLine.indexOf("]", leading);
      if (closeIndex === -1) {
        throw new IniParseError("unterminated section header, expected a closing ']'", lineNumber, leading + 1, source, filename);
      }
      const afterClose = rawLine.slice(closeIndex + 1).trim();
      if (afterClose.length > 0) {
        throw new IniParseError(`unexpected text after section header: '${afterClose}'`, lineNumber, closeIndex + 2, source, filename);
      }
      const name = rawLine.slice(leading + 1, closeIndex).trim();
      if (name.length === 0) {
        throw new IniParseError("section name cannot be empty", lineNumber, leading + 2, source, filename);
      }

      commitSection();
      currentName = name;
      currentLine = lineNumber;
      currentColumn = leading + 1;
      currentEntries = new Map();
      currentKeyOrder = [];
      continue;
    }

    const separatorIndex = findSeparator(rawLine, leading);
    if (separatorIndex === -1) {
      throw new IniParseError("expected 'key = value' (or 'key: value')", lineNumber, leading + 1, source, filename);
    }

    const key = rawLine.slice(leading, separatorIndex).trim();
    if (key.length === 0) {
      throw new IniParseError("key name cannot be empty", lineNumber, leading + 1, source, filename);
    }

    if (currentEntries.has(key)) {
      const previous = currentEntries.get(key)!;
      throw new IniParseError(
        `duplicate key '${key}' (first set at line ${previous.line}, column ${previous.column})`,
        lineNumber,
        leading + 1,
        source,
        filename,
      );
    }

    const rawValue = rawLine.slice(separatorIndex + 1);
    const valueLeading = rawValue.length - rawValue.trimStart().length;
    const valueColumn = separatorIndex + 2 + valueLeading;
    const trimmedValue = rawValue.trimStart();

    const value =
      trimmedValue[0] === '"' || trimmedValue[0] === "'"
        ? parseQuotedValue(trimmedValue, lineNumber, valueColumn, source, filename)
        : trimmedValue.trim();

    currentEntries.set(key, { value, line: lineNumber, column: valueColumn });
    currentKeyOrder.push(key);
  }

  commitSection();

  return { sections, sectionOrder };
}

function findSeparator(line: string, from: number): number {
  for (let i = from; i < line.length; i++) {
    const ch = line[i];
    if (ch === "=" || ch === ":") return i;
  }
  return -1;
}

// Recognized inside a quoted value. Single and double quotes both accept the
// same escapes; the only difference between them is which character needs
// escaping to appear literally.
const ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

// `text` is the value portion of the line starting at its first non-space
// character, i.e. text[0] is the opening quote. `column` is that quote's
// 1-based column, used to report escape and termination errors precisely.
function parseQuotedValue(text: string, line: number, column: number, source: string, filename?: string): string {
  const quote = text[0];
  let result = "";
  let i = 1;

  while (i < text.length) {
    const ch = text[i];

    if (ch === quote) {
      const rest = text.slice(i + 1);
      const trailing = rest.trimStart();
      if (trailing.length > 0) {
        const offset = rest.length - trailing.length;
        throw new IniParseError(
          `unexpected text after closing quote: '${trailing.trimEnd()}'`,
          line,
          column + i + 1 + offset,
          source,
          filename,
        );
      }
      return result;
    }

    if (ch === "\\") {
      const next = text[i + 1];
      if (next === undefined) break;
      const escaped = ESCAPES[next];
      if (escaped === undefined) {
        throw new IniParseError(`unknown escape sequence '\\${next}'`, line, column + i, source, filename);
      }
      result += escaped;
      i += 2;
      continue;
    }

    result += ch;
    i++;
  }

  throw new IniParseError(`unterminated quoted value, expected a closing ${quote}`, line, column, source, filename);
}
