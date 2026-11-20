// C -> Python translator. Works on the analyzed AST (see semantic.ts): uses ctype to pick
// integer or float division and to insert int()/float() conversions where C converts implicitly.

import {
  ATOM_PREC,
  COMPARE_OPS,
  INDENT,
  PYTHON_PRELUDE,
  PYTHON_PREC,
  PYTHON_RESERVED,
} from './constants.js';
import type {
  ArithmeticOp,
  Assign,
  Binary,
  CType,
  Emitted,
  Expr,
  FuncDef,
  Program,
  RetType,
  Stmt,
  TranslateContext,
  VarType,
} from './types.js';

export class TranslateError extends Error {
  name = 'TranslateError';
}

function fail(node: { line: number }, message: string): never {
  throw new TranslateError(`line ${node.line}: ${message}`);
}

function checkName(node: { line: number }, name: string): string {
  if (PYTHON_RESERVED.has(name)) fail(node, `'${name}' is reserved in Python; rename it`);
  return name;
}

const pad = (level: number): string => INDENT.repeat(level);

export function toPython(ast: Program): string {
  const functions = new Map<string, FuncDef>();
  for (const d of ast.decls) {
    if (d.type === 'FuncDef') functions.set(d.name, d);
  }

  const out = [PYTHON_PRELUDE];

  const globals = ast.decls
    .filter(d => d.type === 'DeclStmt')
    .flatMap(d => statement(d, 0, { functions, loop: null }));
  if (globals.length) out.push(globals.join('\n') + '\n');

  for (const f of functions.values()) out.push(functionDef(f, functions));

  out.push('if __name__ == "__main__":\n    main()\n');
  return out.join('\n\n');
}

function functionDef(f: FuncDef, functions: Map<string, FuncDef>): string {
  const params = f.params.map(p => checkName(p, p.name)).join(', ');
  const ctx: TranslateContext = { functions, func: f, loop: null };
  const lines = [`def ${checkName(f, f.name)}(${params}):`];

  const assigned = f.assignedGlobals ?? [];
  if (assigned.length) lines.push(`${pad(1)}global ${assigned.join(', ')}`);

  lines.push(...body(f.body, 1, ctx));
  return lines.join('\n') + '\n';
}

// ---------- statements (each returns an array of lines) ----------

/** Body of a function, loop or if: a Block's statements, or one statement; never empty. */
function body(node: Stmt, level: number, ctx: TranslateContext): string[] {
  const lines =
    node.type === 'Block'
      ? node.body.flatMap(s => statement(s, level, ctx))
      : statement(node, level, ctx);
  return lines.length ? lines : [`${pad(level)}pass`];
}

function statement(node: Stmt, level: number, ctx: TranslateContext): string[] {
  const p = pad(level);

  switch (node.type) {
    case 'DeclStmt':
      return node.decls.map(v => {
        checkName(v, v.name);
        if (v.shadows) fail(v, `'${v.name}' shadows an outer variable; rename it`);

        const zero = v.varType === 'double' ? '0.0' : '0';
        let value = zero;
        if (v.size) value = `[${zero}] * ${v.size.value}`;
        else if (v.init) value = converted(v.varType, v.init, ctx);

        return `${p}${v.name} = ${value}`;
      });

    case 'Block':
      // A nested { } block: Python has no block scope, so just inline it.
      return node.body.flatMap(s => statement(s, level, ctx));

    case 'ExprStmt':
      return node.expr ? [p + exprStatement(node.expr, ctx)] : [];

    case 'If': {
      const lines = [`${p}if ${expr(node.cond, ctx, true)}:`, ...body(node.then, level + 1, ctx)];
      if (!node.else) return lines;

      // else if -> elif
      if (node.else.type === 'If') {
        const elseLines = statement(node.else, level, ctx);
        elseLines[0] = elseLines[0].replace(`${p}if `, `${p}elif `);
        return [...lines, ...elseLines];
      }
      return [...lines, `${p}else:`, ...body(node.else, level + 1, ctx)];
    }

    case 'While': {
      const loopCtx: TranslateContext = { ...ctx, loop: { kind: 'while' } };
      return [`${p}while ${expr(node.cond, ctx, true)}:`, ...body(node.body, level + 1, loopCtx)];
    }

    case 'DoWhile': {
      const loopCtx: TranslateContext = { ...ctx, loop: { kind: 'do' } };
      return [
        `${p}while True:`,
        ...body(node.body, level + 1, loopCtx),
        `${pad(level + 1)}if not (${expr(node.cond, ctx, true)}):`,
        `${pad(level + 2)}break`,
      ];
    }

    case 'For': {
      // for (init; cond; update) body  ->  init; while cond: body; update
      let init: string[] = [];
      if (node.init?.type === 'DeclStmt') init = statement(node.init, level, ctx);
      else if (node.init) init = [p + exprStatement(node.init, ctx)];

      const update = node.update ? [pad(level + 1) + exprStatement(node.update, ctx)] : [];
      const cond = node.cond ? expr(node.cond, ctx, true) : 'True';
      const loopCtx: TranslateContext = { ...ctx, loop: { kind: 'for', update: node.update } };

      return [...init, `${p}while ${cond}:`, ...body(node.body, level + 1, loopCtx), ...update];
    }

    case 'Break':
      return [`${p}break`];

    case 'Continue': {
      const { loop } = ctx;
      if (loop?.kind === 'do') {
        fail(node, "'continue' inside do-while is not supported in Python");
      }
      // In C, continue in a for loop still runs the update; in our while loop we do it by hand.
      if (loop?.kind === 'for' && loop.update) {
        return [p + exprStatement(loop.update, ctx), `${p}continue`];
      }
      return [`${p}continue`];
    }

    case 'Return':
      if (!node.value) return [`${p}return`];
      return [`${p}return ${converted(ctx.func?.retType ?? 'int', node.value, ctx)}`];
  }
}

/** An expression used as a whole statement: assignments, ++/--, calls. */
function exprStatement(node: Expr, ctx: TranslateContext): string {
  if (node.type === 'PreIncDec' || node.type === 'PostIncDec') {
    return `${expr(node.target, ctx)} ${node.op[0]}= 1`;
  }

  if (node.type === 'Assign') {
    const target = expr(node.target, ctx);
    if (node.op === '=') {
      return `${target} = ${converted(node.target.varType, node.value, ctx)}`;
    }

    // x += v stays as is when no conversion or C division is involved.
    const simple =
      '+-*'.includes(node.op[0]) && (node.target.ctype === 'double' || node.value.ctype === 'int');
    if (simple) return `${target} ${node.op} ${expr(node.value, ctx)}`;

    return `${target} = ${compoundValue(node, ctx)}`;
  }

  if (node.type === 'Call' && node.name === 'printf') {
    const [format, ...args] = node.args;
    const fmt = format.type === 'StringLit' ? format.value : '';

    if (!args.length && !fmt.includes('%')) {
      return `print(${JSON.stringify(fmt)}, end="")`;
    }

    const tuple =
      args.length === 1
        ? `(${expr(args[0], ctx)},)`
        : `(${args.map(a => expr(a, ctx)).join(', ')})`;
    return `print(${JSON.stringify(fmt)} % ${tuple}, end="")`;
  }

  return expr(node, ctx);
}

// ---------- expressions ----------

const atom = (text: string): Emitted => ({ text, prec: ATOM_PREC });

/** Wraps a child in parentheses when it binds weaker than its parent needs. */
function child(node: Expr, minPrec: number, ctx: TranslateContext): string {
  const e = emit(node, ctx, false);
  return e.prec < minPrec ? `(${e.text})` : e.text;
}

/** inCondition: the value is only tested for truth (if/while), so `a or b` can stay raw. */
function expr(node: Expr, ctx: TranslateContext, inCondition = false): string {
  return emit(node, ctx, inCondition).text;
}

/** Value of `x op= v` as a plain expression, with C conversions. */
function compoundValue(node: Assign, ctx: TranslateContext): string {
  const ctype: CType =
    node.target.ctype === 'double' || node.value.ctype === 'double' ? 'double' : 'int';

  const binary: Binary = {
    type: 'Binary',
    line: node.line,
    op: node.op[0] as ArithmeticOp,
    left: node.target,
    right: node.value,
    ctype,
  };
  return convertText(node.target.varType, ctype, emit(binary, ctx, false));
}

function emit(node: Expr, ctx: TranslateContext, inCondition: boolean): Emitted {
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
      if (node.target.type !== 'Ident') {
        fail(
          node,
          'assignment to an array element inside an expression is not supported in Python',
        );
      }
      const value =
        node.op === '='
          ? converted(node.target.varType, node.value, ctx)
          : compoundValue(node, ctx);
      return atom(`(${node.target.name} := ${value})`);
    }

    case 'PreIncDec':
    case 'PostIncDec':
      return fail(node, `'${node.op}' inside an expression is not supported in Python`);

    case 'Unary':
      if (node.op === '!') {
        return {
          text: `not ${child(node.operand, PYTHON_PREC.not + 1, ctx)}`,
          prec: PYTHON_PREC.not,
        };
      }
      return { text: `-${child(node.operand, PYTHON_PREC.unary, ctx)}`, prec: PYTHON_PREC.unary };

    case 'Binary':
      return binary(node, ctx, inCondition);

    case 'Call': {
      if (node.name === 'printf') fail(node, 'the result of printf cannot be used as a value');

      const f = ctx.functions.get(node.name) as FuncDef;
      const args = node.args.map((a, i) => {
        const param = f.params[i];
        return param.isArray ? expr(a, ctx) : converted(param.varType, a, ctx);
      });
      return atom(`${checkName(node, node.name)}(${args.join(', ')})`);
    }
  }
}

function binary(node: Binary, ctx: TranslateContext, inCondition: boolean): Emitted {
  const { op } = node;

  if (op === '&&' || op === '||') {
    const pyOp = op === '&&' ? 'and' : 'or';
    const prec = PYTHON_PREC[pyOp];
    const left = logicOperand(node.left, prec, ctx);
    const right = logicOperand(node.right, prec + 1, ctx);
    const text = `${left} ${pyOp} ${right}`;

    // As a value C gives 0 or 1, Python gives one of the operands (0 or 5 -> 5).
    return inCondition ? { text, prec } : atom(`int(bool(${text}))`);
  }

  if (COMPARE_OPS.has(op)) {
    // Python chains comparisons (a < b < c), C does not: wrap comparison operands.
    const left = child(node.left, PYTHON_PREC.compare + 1, ctx);
    const right = child(node.right, PYTHON_PREC.compare + 1, ctx);
    return { text: `${left} ${op} ${right}`, prec: PYTHON_PREC.compare };
  }

  if (node.ctype === 'int' && (op === '/' || op === '%')) {
    const fn = op === '/' ? '_div' : '_mod';
    return atom(`${fn}(${expr(node.left, ctx)}, ${expr(node.right, ctx)})`);
  }

  const prec = PYTHON_PREC[op as ArithmeticOp];
  return { text: `${child(node.left, prec, ctx)} ${op} ${child(node.right, prec + 1, ctx)}`, prec };
}

/** Operand of and/or: truth value only, so nested and/or stay raw. */
function logicOperand(node: Expr, minPrec: number, ctx: TranslateContext): string {
  const e = emit(node, ctx, true);
  return e.prec < minPrec ? `(${e.text})` : e.text;
}

/** Expression text converted to the C type of the variable that receives it. */
function converted(varType: RetType | undefined, node: Expr, ctx: TranslateContext): string {
  return convertText(varType, node.ctype, emit(node, ctx, false));
}

function convertText(
  varType: VarType | RetType | undefined,
  ctype: CType | undefined,
  e: Emitted,
): string {
  if (varType === 'double' && ctype === 'int') return `float(${e.text})`;
  if (varType !== 'double' && ctype === 'double') return `int(${e.text})`;
  return e.text;
}
