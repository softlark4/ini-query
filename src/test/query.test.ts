import assert from "node:assert/strict";
import { test } from "node:test";
import { find, IniQueryError, query } from "../query.js";

const SOURCE = "timeout = 30\n\n[server]\nhost = 0.0.0.0\nport = 8080\n";

test("query returns the value at a section.key path", () => {
  assert.equal(query(SOURCE, "server.host"), "0.0.0.0");
  assert.equal(query(SOURCE, "server.port"), "8080");
});

test("a path with no dot looks up the global section", () => {
  assert.equal(query(SOURCE, "timeout"), "30");
});

test("find returns the value's source location", () => {
  const entry = find(SOURCE, "server.host");
  assert.equal(entry.value, "0.0.0.0");
  assert.equal(entry.line, 4);
  assert.equal(entry.column, 8);
});

test("looking up an unknown section suggests the closest known one", () => {
  assert.throws(() => find(SOURCE, "srever.host"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /no section 'srever'\..*did you mean 'server'\?/);
    return true;
  });
});

test("looking up an unknown key suggests the closest known one", () => {
  assert.throws(() => find(SOURCE, "server.hots"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /no key 'hots' in section 'server'\..*did you mean 'host'\?/);
    return true;
  });
});

test("an unknown section with no close match lists the known sections", () => {
  assert.throws(() => find(SOURCE, "wxyz.host"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /known sections: server/);
    return true;
  });
});

test("an unknown key with no close match lists the known keys", () => {
  assert.throws(() => find(SOURCE, "server.wxyz"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /known keys: host, port/);
    return true;
  });
});

test("a missing global section is reported as '(global)'", () => {
  assert.throws(() => find("[server]\nhost = 1\n", "missing"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /no section \(global\)/);
    return true;
  });
});

test("a section with no keys says so instead of listing an empty set", () => {
  assert.throws(() => find("[server]\n[empty]\n", "empty.anything"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /it has no keys/);
    return true;
  });
});

test("a file with no sections at all says so", () => {
  assert.throws(() => find("key = value\n", "missing.key"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.match(err.message, /the file has no sections/);
    return true;
  });
});

test("IniQueryError carries the original path", () => {
  assert.throws(() => find(SOURCE, "server.hots"), (err: unknown) => {
    assert.ok(err instanceof IniQueryError);
    assert.equal(err.path, "server.hots");
    return true;
  });
});
