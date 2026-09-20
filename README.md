# ini-query

Answers one question: what is the value at this path in this INI file?

INI files still show up everywhere — build tool configs, PHP settings,
`.editorconfig`-adjacent formats, legacy service configs. When you need to
pull a single value out of one, usually from a shell script or a small tool,
you either reach for a full parsing library or write a sloppy regex. Most
parsers that do exist give up on the first syntax error with something like
`Error: invalid file`, which is not much help when the file is 200 lines
long and you don't know which line broke.

`ini-query` does one thing: given a file and a `section.key` path, it prints
the value. If the file is malformed, or the path doesn't exist, the error
tells you exactly where, with a line, a column, and the offending line of
source printed underneath.

## Usage

```
$ cat config.ini
[server]
host = 0.0.0.0
port = 8080

timeout = 30

$ ini-query config.ini server.host
0.0.0.0

$ ini-query config.ini server.port
8080
```

Paths with no dot are looked up in the global section, i.e. anything before
the first `[section]` header:

```
$ ini-query config.ini timeout
30
```

### Parse errors point at the source

```
$ cat broken.ini
[server
host = 0.0.0.0

$ ini-query broken.ini server.host
ini-query: unterminated section header, expected a closing ']' (broken.ini:1:1)

  1 | [server
      ^
```

### Lookup errors suggest a fix

```
$ ini-query config.ini server.hots
ini-query: no key 'hots' in section 'server'. did you mean 'host'?

$ ini-query config.ini srever.host
ini-query: no section 'srever'. did you mean 'server'?
```

## Library usage

```ts
import { query, IniParseError, IniQueryError } from "ini-query";

const source = "[server]\nhost = 0.0.0.0\n";

try {
  const host = query(source, "server.host", "config.ini");
  console.log(host); // "0.0.0.0"
} catch (err) {
  if (err instanceof IniParseError || err instanceof IniQueryError) {
    console.error(err.message);
  } else {
    throw err;
  }
}
```

`find()` returns the value along with the line and column it was declared
at, in case you need the location rather than just the string:

```ts
import { find } from "ini-query";

const entry = find(source, "server.host", "config.ini");
// entry.value === "0.0.0.0", entry.line === 2, entry.column === 8
```

## Format notes (current support)

- Sections: `[name]`. Repeated sections with the same name merge; the first
  definition of a given key wins.
- Keys: `key = value` or `key: value`. The first `=` or `:` on the line is
  the separator.
- Comments: a whole line starting with `;` or `#` (no inline comments yet).
- No support yet for quoted values, line continuations, or escape
  sequences — those are on the list below.

## Building

This is plain TypeScript with no runtime dependencies. `typescript` itself
is the only devDependency, used to compile `src/` to `dist/`.

```
npm install
npm run build
```

Tests use Node's built-in test runner, so there's nothing extra to install:

```
npm test
```

## License

MIT, see LICENSE.
