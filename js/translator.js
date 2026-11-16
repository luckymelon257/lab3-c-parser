// C -> Python translator. Works on the analyzed AST (see semantic.js): uses ctype to pick
// integer or float division and to insert int()/float() conversions where C converts implicitly.

export class TranslateError extends Error {
  name = 'TranslateError';
}

function fail(node, message) {
  throw new TranslateError(`line ${node.line}: ${message}`);
}

// int(a / b) truncates toward zero like C; Python's // would round down (-7 // 2 == -4).
const PRELUDE = `# Translated from C by cparser
def _div(a, b):
    return int(a / b)


def _mod(a, b):
    return a - b * int(a / b)
`;

const RESERVED = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'class', 'def', 'del', 'elif',
  'except', 'finally', 'from', 'global', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'try', 'with', 'yield', 'print', 'int', 'float', 'ord', 'bool', '_div', '_mod',
]);

function checkName(node, name) {
  if (RESERVED.has(name)) fail(node, `'${name}' is reserved in Python; rename it`);
  return name;
}

const pad = level => '    '.repeat(level);

export function toPython(ast) {
  const functions = new Map(ast.decls.filter(d => d.type === 'FuncDef').map(f => [f.name, f]));
  const out = [PRELUDE];
  const globals = ast.decls.filter(d => d.type === 'DeclStmt')
    .flatMap(d => statement(d, 0, { functions, loop: null }));
  if (globals.length) out.push(globals.join('\n') + '\n');
  for (const f of functions.values()) out.push(functionDef(f, functions));
  out.push('if __name__ == "__main__":\n    main()\n');
  return out.join('\n\n');
}

function functionDef(f, functions) {
  const params = f.params.map(p => checkName(p, p.name)).join(', ');
  const ctx = { functions, func: f, loop: null };
  const lines = [`def ${checkName(f, f.name)}(${params}):`];
  if (f.assignedGlobals.length) lines.push(`${pad(1)}global ${f.assignedGlobals.join(', ')}`);
  lines.push(...body(f.body, 1, ctx));
  return lines.join('\n') + '\n';
}

// ---------- statements (each returns an array of lines) ----------

// Body of a function, loop or if: a Block's statements, or one statement; never empty.
function body(node, level, ctx) {
  const lines = node.type === 'Block'
    ? node.body.flatMap(s => statement(s, level, ctx))
    : statement(node, level, ctx);
  return lines.length ? lines : [`${pad(level)}pass`];
}

function statement(node, level, ctx) {
  const p = pad(level);
  switch (node.type) {
    case 'DeclStmt':
      return node.decls.map(v => {
        checkName(v, v.name);
        if (v.shadows) fail(v, `'${v.name}' shadows an outer variable; rename it`);
        const zero = v.varType === 'double' ? '0.0' : '0';
        const value = v.size ? `[${zero}] * ${v.size.value}` : v.init ? converted(v.varType, v.init, ctx) : zero;
        return `${p}${v.name} = ${value}`;
      });
    case 'Block':   // a nested { } block: Python has no block scope, so just inline it
      return node.body.flatMap(s => statement(s, level, ctx));
    case 'ExprStmt':
      return node.expr ? [p + exprStatement(node.expr, ctx)] : [];
    case 'If': {
      const lines = [`${p}if ${expr(node.cond, ctx, true)}:`, ...body(node.then, level + 1, ctx)];
      if (!node.else) return lines;
      if (node.else.type === 'If') {   // else if -> elif
        const elseLines = statement(node.else, level, ctx);
        elseLines[0] = elseLines[0].replace(`${p}if `, `${p}elif `);
        return [...lines, ...elseLines];
      }
      return [...lines, `${p}else:`, ...body(node.else, level + 1, ctx)];
    }
    case 'While':
      return [`${p}while ${expr(node.cond, ctx, true)}:`, ...body(node.body, level + 1, { ...ctx, loop: { kind: 'while' } })];
    case 'DoWhile':
      return [
        `${p}while True:`,
        ...body(node.body, level + 1, { ...ctx, loop: { kind: 'do' } }),
        `${pad(level + 1)}if not (${expr(node.cond, ctx, true)}):`,
        `${pad(level + 2)}break`,
      ];
    case 'For': {
      // for (init; cond; update) body  ->  init; while cond: body; update
      const init = node.init?.type === 'DeclStmt' ? statement(node.init, level, ctx)
        : node.init ? [p + exprStatement(node.init, ctx)] : [];
      const update = node.update ? [pad(level + 1) + exprStatement(node.update, ctx)] : [];
      const cond = node.cond ? expr(node.cond, ctx, true) : 'True';
      const loopBody = body(node.body, level + 1, { ...ctx, loop: { kind: 'for', update: node.update } });
      return [...init, `${p}while ${cond}:`, ...loopBody, ...update];
    }
    case 'Break':
      return [`${p}break`];
    case 'Continue':
      if (ctx.loop.kind === 'do') fail(node, "'continue' inside do-while is not supported in Python");
      // In C, continue in a for loop still runs the update; in our while loop we must do it by hand.
      if (ctx.loop.kind === 'for' && ctx.loop.update) return [p + exprStatement(ctx.loop.update, ctx), `${p}continue`];
      return [`${p}continue`];
    case 'Return':
      if (!node.value) return [`${p}return`];
      return [`${p}return ${converted(ctx.func.retType, node.value, ctx)}`];
  }
  throw new Error(`unknown statement ${node.type}`);
}

// An expression used as a whole statement: assignments, ++/--, calls.
function exprStatement(node, ctx) {
  if (node.type === 'PreIncDec' || node.type === 'PostIncDec') {
    return `${expr(node.target, ctx)} ${node.op[0]}= 1`;
  }
  if (node.type === 'Assign') {
    const target = expr(node.target, ctx);
    if (node.op === '=') return `${target} = ${converted(node.target.varType, node.value, ctx)}`;
    // x += v stays as is when no conversion or C division is involved.
    const simple = '+-*'.includes(node.op[0]) && (node.target.ctype === 'double' || node.value.ctype === 'int');
    if (simple) return `${target} ${node.op} ${expr(node.value, ctx)}`;
    return `${target} = ${compoundValue(node, ctx)}`;
  }
  if (node.type === 'Call' && node.name === 'printf') {
    const [format, ...args] = node.args;
    if (!args.length && !format.value.includes('%')) return `print(${JSON.stringify(format.value)}, end="")`;
    const tuple = args.length === 1 ? `(${expr(args[0], ctx)},)` : `(${args.map(a => expr(a, ctx)).join(', ')})`;
    return `print(${JSON.stringify(format.value)} % ${tuple}, end="")`;
  }
  return expr(node, ctx);
}

// ---------- expressions ----------

// Python operator precedence, higher binds tighter. Calls, names, literals: ATOM.
const PREC = { or: 1, and: 2, not: 3, compare: 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, unary: 7 };
const ATOM = 9;
const COMPARE = new Set(['<', '>', '<=', '>=', '==', '!=']);

// Expression text plus its precedence, so parents know when to add parentheses.
const atom = text => ({ text, prec: ATOM });

// Wraps a child in parentheses when it binds weaker than its parent needs.
function child(node, minPrec, ctx) {
  const e = emit(node, ctx, false);
  return e.prec < minPrec ? `(${e.text})` : e.text;
}

// inCondition: the value is only tested for truth (if/while), so `a or b` can stay raw.
function expr(node, ctx, inCondition = false) {
  return emit(node, ctx, inCondition).text;
}

// Value of `x op= v` as a plain expression, with C conversions.
function compoundValue(node, ctx) {
  const op = node.op[0];
  const ctype = node.target.ctype === 'double' || node.value.ctype === 'double' ? 'double' : 'int';
  const binary = { type: 'Binary', line: node.line, op, left: node.target, right: node.value, ctype };
  return convertText(node.target.varType, ctype, emit(binary, ctx, false));
}

function emit(node, ctx, inCondition) {
  switch (node.type) {
    case 'IntLit':
      return atom(String(node.value));
    case 'FloatLit':
      return atom(node.text);
    case 'CharLit':
      return atom(`ord(${node.text})`);
    case 'StringLit':
      return atom(JSON.stringify(node.value));
    case 'Ident':
      return atom(checkName(node, node.name));
    case 'Index':
      return atom(`${checkName(node, node.name)}[${expr(node.index, ctx)}]`);
    case 'Assign': {
      if (node.target.type !== 'Ident') fail(node, 'assignment to an array element inside an expression is not supported in Python');
      const value = node.op === '=' ? converted(node.target.varType, node.value, ctx) : compoundValue(node, ctx);
      return atom(`(${node.target.name} := ${value})`);
    }
    case 'PreIncDec':
    case 'PostIncDec':
      return fail(node, `'${node.op}' inside an expression is not supported in Python`);
    case 'Unary':
      if (node.op === '!') return { text: `not ${child(node.operand, PREC.not + 1, ctx)}`, prec: PREC.not };
      return { text: `-${child(node.operand, PREC.unary, ctx)}`, prec: PREC.unary };
    case 'Binary':
      return binary(node, ctx, inCondition);
    case 'Call': {
      if (node.name === 'printf') fail(node, 'the result of printf cannot be used as a value');
      const f = ctx.functions.get(node.name);
      const args = node.args.map((a, i) => (f.params[i].isArray ? expr(a, ctx) : converted(f.params[i].varType, a, ctx)));
      return atom(`${checkName(node, node.name)}(${args.join(', ')})`);
    }
  }
  throw new Error(`unknown expression ${node.type}`);
}

function binary(node, ctx, inCondition) {
  const { op } = node;
  if (op === '&&' || op === '||') {
    const pyOp = op === '&&' ? 'and' : 'or';
    const prec = PREC[pyOp];
    const text = `${logicOperand(node.left, prec, ctx)} ${pyOp} ${logicOperand(node.right, prec + 1, ctx)}`;
    // As a value C gives 0 or 1, Python gives one of the operands (0 or 5 -> 5).
    return inCondition ? { text, prec } : atom(`int(bool(${text}))`);
  }
  if (COMPARE.has(op)) {
    // Python chains comparisons (a < b < c), C does not: wrap comparison operands.
    return { text: `${child(node.left, PREC.compare + 1, ctx)} ${op} ${child(node.right, PREC.compare + 1, ctx)}`, prec: PREC.compare };
  }
  if (node.ctype === 'int' && (op === '/' || op === '%')) {
    return atom(`${op === '/' ? '_div' : '_mod'}(${expr(node.left, ctx)}, ${expr(node.right, ctx)})`);
  }
  const prec = PREC[op];
  return { text: `${child(node.left, prec, ctx)} ${op} ${child(node.right, prec + 1, ctx)}`, prec };
}

// Operand of and/or: truth value only, so nested and/or stay raw.
function logicOperand(node, minPrec, ctx) {
  const e = emit(node, ctx, true);
  return e.prec < minPrec ? `(${e.text})` : e.text;
}

// Expression text converted to the C type of the variable that receives it.
function converted(varType, node, ctx) {
  return convertText(varType, node.ctype, emit(node, ctx, false));
}

function convertText(varType, ctype, e) {
  if (varType === 'double' && ctype === 'int') return `float(${e.text})`;
  if (varType !== 'double' && ctype === 'double') return `int(${e.text})`;
  return e.text;
}
