import assert from "node:assert/strict";
import { test } from "node:test";
import { GLOBAL_SECTION, IniParseError, parseIni } from "../parser.js";

test("parses a section with keys", () => {
  const parsed = parseIni("[server]\nhost = 0.0.0.0\nport = 8080\n");
  const section = parsed.sections.get("server");
  assert.ok(section);
  assert.equal(section.entries.get("host")?.value, "0.0.0.0");
  assert.equal(section.entries.get("port")?.value, "8080");
  assert.deepEqual(section.keyOrder, ["host", "port"]);
});

test("keys before any header land in the global section", () => {
  const parsed = parseIni("timeout = 30\n[server]\nhost = 0.0.0.0\n");
  const global = parsed.sections.get(GLOBAL_SECTION);
  assert.ok(global);
  assert.equal(global.entries.get("timeout")?.value, "30");
});

test("a file with no headers at all is entirely global", () => {
  const parsed = parseIni("a = 1\nb = 2\n");
  assert.deepEqual(parsed.sectionOrder, [GLOBAL_SECTION]);
});

test("an empty file has no sections", () => {
  const parsed = parseIni("");
  assert.deepEqual(parsed.sectionOrder, []);
});

test("blank lines and whole-line comments are skipped", () => {
  const parsed = parseIni("[a]\n; a comment\n\n# another\nkey = value\n");
  const section = parsed.sections.get("a");
  assert.equal(section?.entries.get("key")?.value, "value");
});

test("colon is accepted as a separator", () => {
  const parsed = parseIni("[a]\nkey: value\n");
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "value");
});

test("only the first separator on a line splits key from value", () => {
  const parsed = parseIni("[a]\nkey = a=b:c\n");
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "a=b:c");
});

test("leading UTF-8 BOM is stripped before parsing", () => {
  const parsed = parseIni("﻿[a]\nkey = value\n");
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "value");
});

test("repeated section headers merge, first key wins", () => {
  const parsed = parseIni("[a]\nkey = first\n[b]\nother = 1\n[a]\nkey = second\nnew = 2\n");
  const section = parsed.sections.get("a");
  assert.equal(section?.entries.get("key")?.value, "first");
  assert.equal(section?.entries.get("new")?.value, "2");
  assert.deepEqual(parsed.sectionOrder, ["a", "b"]);
});

test("records the line and column of a value", () => {
  const parsed = parseIni("[a]\nkey =   value\n");
  const entry = parsed.sections.get("a")?.entries.get("key");
  assert.equal(entry?.line, 2);
  assert.equal(entry?.column, 9);
});

test("records the line and column of a section header", () => {
  const parsed = parseIni("\n\n  [a]\nkey = value\n");
  const section = parsed.sections.get("a");
  assert.equal(section?.line, 3);
  assert.equal(section?.column, 3);
});

test("rejects an unterminated section header", () => {
  assert.throws(() => parseIni("[server\nhost = 0.0.0.0\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.equal(err.line, 1);
    assert.equal(err.column, 1);
    return true;
  });
});

test("rejects text after a section header's closing bracket", () => {
  assert.throws(() => parseIni("[server] junk\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /unexpected text after section header/);
    return true;
  });
});

test("rejects an empty section name", () => {
  assert.throws(() => parseIni("[]\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /section name cannot be empty/);
    return true;
  });
});

test("rejects a line with no separator", () => {
  assert.throws(() => parseIni("[a]\njust some text\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /expected 'key = value'/);
    return true;
  });
});

test("rejects an empty key name", () => {
  assert.throws(() => parseIni("[a]\n = value\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /key name cannot be empty/);
    return true;
  });
});

test("rejects a duplicate key within one section and names the first location", () => {
  assert.throws(() => parseIni("[a]\nkey = 1\nkey = 2\n"), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.equal(err.line, 3);
    assert.match(err.message, /duplicate key 'key' \(first set at line 2, column 7\)/);
    return true;
  });
});

test("parse error message includes the filename when given", () => {
  const err = assert.throws(() => parseIni("[a\n", "broken.ini")) as IniParseError;
  assert.match(err.message, /broken\.ini:1:1/);
});

test("parse error message points at the offending line with a caret", () => {
  const err = assert.throws(() => parseIni("[a]\nno separator here\n")) as IniParseError;
  assert.match(err.message, /no separator here/);
  assert.match(err.message, /\^/);
});

test("a double-quoted value keeps its inner leading and trailing spaces", () => {
  const parsed = parseIni('[a]\nkey = "  value  "\n');
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "  value  ");
});

test("a single-quoted value works the same as a double-quoted one", () => {
  const parsed = parseIni("[a]\nkey = 'value'\n");
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "value");
});

test("a quoted value can contain the other quote character unescaped", () => {
  const parsed = parseIni(`[a]\nkey = "it's fine"\n`);
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, "it's fine");
});

test("escape sequences in a quoted value are decoded", () => {
  const parsed = parseIni('[a]\nkey = "line one\\nline two\\ttabbed\\\\literal\\"quote"\n');
  assert.equal(parsed.sections.get("a")?.entries.get("key")?.value, 'line one\nline two\ttabbed\\literal"quote');
});

test("the column of a quoted value points at the opening quote", () => {
  const parsed = parseIni('[a]\nkey = "value"\n');
  const entry = parsed.sections.get("a")?.entries.get("key");
  assert.equal(entry?.line, 2);
  assert.equal(entry?.column, 7);
});

test("rejects an unterminated quoted value", () => {
  assert.throws(() => parseIni('[a]\nkey = "value\n'), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.equal(err.line, 2);
    assert.equal(err.column, 7);
    assert.match(err.message, /unterminated quoted value/);
    return true;
  });
});

test("rejects an unknown escape sequence in a quoted value", () => {
  assert.throws(() => parseIni('[a]\nkey = "bad\\x"\n'), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /unknown escape sequence '\\x'/);
    return true;
  });
});

test("rejects trailing text after a quoted value's closing quote", () => {
  assert.throws(() => parseIni('[a]\nkey = "value" extra\n'), (err: unknown) => {
    assert.ok(err instanceof IniParseError);
    assert.match(err.message, /unexpected text after closing quote: 'extra'/);
    return true;
  });
});
