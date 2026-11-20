// Shared constants. This file has no Node imports, so the browser loads it too.
import type { ArithmeticOp, CompareOp, LoopSignal, NodeCategory } from './types.js';

// ---------- parser bridge ----------

/** cparser gets this long to parse one program. */
export const PARSER_TIMEOUT_MS = 2000;

// ---------- semantic analysis ----------

export const ARITHMETIC_OPS: ReadonlySet<string> = new Set<ArithmeticOp>(['+', '-', '*', '/', '%']);

// ---------- interpreter ----------

/** Stops infinite loops. */
export const DEFAULT_MAX_STEPS = 1_000_000;

/** Stops infinite recursion. */
export const DEFAULT_MAX_DEPTH = 1000;

/** break / continue travel up the JS call stack as thrown signals. */
export const BREAK: LoopSignal = { signal: 'break' };
export const CONTINUE: LoopSignal = { signal: 'continue' };

export const COMPARE_FNS: Readonly<Record<CompareOp, (a: number, b: number) => boolean>> = {
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

// ---------- translator ----------

/** int(a / b) truncates toward zero like C; Python's // would round down (-7 // 2 == -4). */
export const PYTHON_PRELUDE = `# Translated from C by cparser
def _div(a, b):
    return int(a / b)


def _mod(a, b):
    return a - b * int(a / b)
`;

/** Python keywords and names the translated code uses itself. */
// prettier-ignore
export const PYTHON_RESERVED: ReadonlySet<string> = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'class', 'def', 'del', 'elif',
  'except', 'finally', 'from', 'global', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'try', 'with', 'yield', 'print', 'int', 'float', 'ord', 'bool', '_div', '_mod',
]);

/** Python operator precedence: higher binds tighter. */
export const PYTHON_PREC = {
  or: 1,
  and: 2,
  not: 3,
  compare: 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  unary: 7,
} as const;

/** Precedence of calls, names and literals: never needs parentheses. */
export const ATOM_PREC = 9;

export const COMPARE_OPS: ReadonlySet<string> = new Set<CompareOp>([
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '!=',
]);

/** One indentation level of Python code. */
export const INDENT = '    ';

// ---------- web tree ----------

/** Node color group; every type not listed here is an expression. */
export const NODE_CATEGORY: Readonly<Record<string, NodeCategory>> = {
  Program: 'decl',
  FuncDef: 'decl',
  Param: 'decl',
  DeclStmt: 'decl',
  VarDecl: 'decl',
  Block: 'stmt',
  If: 'stmt',
  While: 'stmt',
  DoWhile: 'stmt',
  For: 'stmt',
  Break: 'stmt',
  Continue: 'stmt',
  Return: 'stmt',
  ExprStmt: 'stmt',
  IntLit: 'literal',
  FloatLit: 'literal',
  CharLit: 'literal',
  StringLit: 'literal',
};

/** d3.tree node spacing: [vertical gap, horizontal gap] in pixels. */
export const TREE_NODE_SIZE: [number, number] = [26, 190];

/** Allowed zoom range of the tree. */
export const TREE_ZOOM_EXTENT: [number, number] = [0.2, 3];

// ---------- server ----------

export const DEFAULT_PORT = 3000;

/** Largest C source the server accepts. */
export const MAX_BODY_BYTES = 100 * 1024;

/** URL prefix -> folder (relative to the project root). */
export const STATIC_DIRS: Readonly<Record<string, string>> = {
  web: 'web',
  js: 'dist/web',
  src: 'dist/src',
  examples: 'examples',
};

export const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.c': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

// ---------- command line ----------

export const CLI_USAGE = 'usage: node dist/cli.js <tokens|ast|run|py> file.c';

/** Errors that describe a problem in the user's C program (not a bug in this tool). */
export const USER_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ParseError',
  'SemanticError',
  'RuntimeError',
  'TranslateError',
]);
