# C Subset Translator

A syntax analyzer for a subset of C built with **flex + bison** (Lex/YACC), plus:

- semantic analysis (types, scopes) and a **tree-walking interpreter**,
- a **C → Python translator**,
- an interactive **AST visualization** in the browser (d3.js).

## Requirements

- macOS with Xcode command line tools (`cc`, `clang`, `flex`)
- GNU Bison 3.x: `brew install bison` (Apple's bison 2.3 is too old; the Makefile finds Homebrew's)
- Node.js 20+ and npm (dev tools only: TypeScript, Prettier, type definitions)
- Python 3 (only to run translated programs and the equivalence tests)

## Usage

```bash
make                                     # builds build/cparser and compiles TypeScript to dist/
make test                                # builds and runs all tests
make format                              # formats the code with Prettier
```

The first `make` runs `npm ci` to install the dev tools.

```bash
build/cparser --tokens examples/factorial.c   # token stream (lexer only)
node dist/cli.js ast examples/factorial.c     # AST as JSON
node dist/cli.js run examples/factorial.c     # run with the interpreter
node dist/cli.js py  examples/factorial.c     # translate to Python
node dist/cli.js py  examples/factorial.c | python3
```

```bash
npm start                                # web page at http://127.0.0.1:3000
```

Pick an example, then **Parse** (AST tree), **Run** (output) or **Translate** (Python).
Click a tree node to collapse it; drag and scroll to pan and zoom.

Theory demos:

```bash
make report      # build/report.output: LALR(1) states, items, lookaheads, resolved conflicts
make conflicts   # theory/conflicts.y: shift/reduce and reduce/reduce conflicts with counterexamples
```

## Layout

```
parser/lexer.l      flex rules (tokens, comments, positions)
parser/parser.y     bison grammar, precedence, AST-building actions
parser/ast.h/.c     AST node, JSON printer
parser/main.c       cparser command line
src/types.ts        AST node types and data structures of every pass
src/constants.ts    shared constants (limits, operator tables, server settings)
src/parse.ts        runs build/cparser from Node
src/semantic.ts     scopes, types, checks; annotates the AST
src/interpreter.ts  executes the AST
src/translator.ts   AST -> Python source
web/                page, d3 tree (tree.ts is pure and tested)
server.ts           local server: static files + POST /api/parse
cli.ts              command line front
dist/               compiled JavaScript (make)
examples/           demo programs (valid C, also compiled by clang in tests)
tests/              node:test suites
theory/conflicts.y  conflict demo grammar
```

## Supported C subset

- Types `int`, `double`, `char`, `void` (return type); 1-D arrays, array parameters (by reference)
- Global and local variables, several declarators per line, initializers
- `if`/`else`, `while`, `do`-`while`, `for` (with declaration), `break`, `continue`, `return`
- Operators: `= += -= *= /= %=`, `|| && ! == != < <= > >=`, `+ - * / %`, unary `-`, `++`/`--`
- Functions with parameters and recursion; `printf` with `%d %i %f %.Nf %c %s %%`
- Comments; `#include` lines are skipped

Not supported: pointers, structs, typedef, preprocessor, `malloc`, multi-dimensional arrays.
Translator limits: `++`/`--` inside a larger expression, `continue` inside `do`-`while`,
shadowed variable names and Python-reserved names give a clear error.

## Tests

`make test` runs:

- lexer, parser, semantic, interpreter, translator, tree and server unit tests;
- an equivalence test: every `examples/*.c` is compiled with clang, run by the interpreter
  and translated to Python; all three outputs must be identical.
