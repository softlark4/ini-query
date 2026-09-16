// The one question this package answers: "what is the value at this path
// in this INI file?" Everything here is in service of making the answer to
// "why didn't that work" as clear as the answer to the question itself.

import { GLOBAL_SECTION, IniValue, parseIni } from "./parser.js";

export { IniParseError, parseIni } from "./parser.js";
export type { IniSection, IniValue, ParsedIni } from "./parser.js";

export class IniQueryError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = "IniQueryError";
    this.path = path;
  }
}

// Path syntax: "section.key" looks up `key` inside `[section]`.
// A path with no dot, e.g. "key", looks up `key` before any section header.
export function find(source: string, path: string, filename?: string): IniValue {
  const parsed = parseIni(source, filename);
  const { section: sectionName, key } = splitPath(path);

  const section = parsed.sections.get(sectionName);
  if (!section) {
    const known = parsed.sectionOrder.filter((name) => name !== GLOBAL_SECTION);
    const suggestion = closestMatch(sectionName, known);
    const hint = suggestion
      ? ` did you mean '${suggestion}'?`
      : known.length > 0
        ? ` known sections: ${known.join(", ")}`
        : " the file has no sections.";
    const label = sectionName === GLOBAL_SECTION ? "(global)" : `'${sectionName}'`;
    throw new IniQueryError(`no section ${label}.${hint}`, path);
  }

  const entry = section.entries.get(key);
  if (!entry) {
    const suggestion = closestMatch(key, section.keyOrder);
    const sectionLabel = sectionName === GLOBAL_SECTION ? "the global section" : `section '${sectionName}'`;
    const hint = suggestion
      ? ` did you mean '${suggestion}'?`
      : section.keyOrder.length > 0
        ? ` known keys: ${section.keyOrder.join(", ")}`
        : " it has no keys.";
    throw new IniQueryError(`no key '${key}' in ${sectionLabel}.${hint}`, path);
  }

  return entry;
}

export function query(source: string, path: string, filename?: string): string {
  return find(source, path, filename).value;
}

function splitPath(path: string): { section: string; key: string } {
  const dot = path.indexOf(".");
  if (dot === -1) {
    return { section: GLOBAL_SECTION, key: path };
  }
  return { section: path.slice(0, dot), key: path.slice(dot + 1) };
}

function closestMatch(target: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const threshold = Math.max(2, Math.ceil(target.length / 2));
  return bestDistance <= threshold ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j]! + 1, d[i][j - 1]! + 1, d[i - 1][j - 1]! + cost);
    }
  }

  return d[rows - 1][cols - 1]!;
}
