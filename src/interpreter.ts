// Tree-walking interpreter: executes the analyzed AST (see semantic.ts) and collects printf output.
// Values are JS numbers; int results are wrapped to 32 bits like C on this machine.
// Arrays are JS arrays, so passing one to a function shares it (by reference, as in C).

import { BREAK, COMPARE_FNS, CONTINUE, DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS } from './constants.js';
import type {
  ArithmeticOp,
  AstNode,
  CompareOp,
  CType,
  Env,
  Expr,
  FuncDef,
  Index,
  LValue,
  Program,
  Reference,
  RunContext,
  RunOptions,
  RunResult,
  Scope,
  Slot,
  Stmt,
  Value,
  VarType,
} from './types.js';

export class RuntimeError extends Error {
  name = 'RuntimeError';
}

function fail(node: { line: number }, message: string): never {
  throw new RuntimeError(`line ${node.line}: ${message}`);
}

/** `return` travels up the JS call stack as a thrown signal with the value. */
class ReturnSignal {
  constructor(readonly value: number | undefined) {}
}

/**
 * Converts a value to the type of the variable that stores it.
 * limitation: char is kept as a 32-bit int (no 8-bit wrap); fine for printable characters.
 */
const convert = (varType: VarType, v: number): number =>
  varType === 'double' ? v : Math.trunc(v) | 0;

/**
 * printf with %d %i %f %.Nf %c %s %%.
 * limitation: %f uses toFixed, which rounds exact ties (0.125 -> 0.13) up, C rounds them to even.
 */
export function formatPrintf(fmt: string, args: Value[]): string {
  let i = 0;
  const next = (): number => args[i++] as number;

  return fmt.replace(/%(\.\d+)?([a-zA-Z%])/g, (spec, precision: string | undefined, conv) => {
    switch (conv) {
      case '%':
        return '%';
      case 'd':
      case 'i':
        return String(Math.trunc(next()));
      case 'f':
        return next().toFixed(precision ? Number(precision.slice(1)) : 6);
      case 'c':
        return String.fromCharCode(next());
      case 's':
        return String(args[i++]);
    }
    throw new RuntimeError(`unsupported format '${spec}'`);
  });
}

export function run(ast: Program, options: RunOptions = {}): RunResult {
  const ctx: RunContext = {
    functions: new Map(),
    globals: new Map(),
    out: [],
    steps: 0,
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    depth: 0,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
  };

  for (const d of ast.decls) {
    if (d.type === 'FuncDef') ctx.functions.set(d.name, d);
    else exec(d, [ctx.globals], ctx);
  }

  const main = ctx.functions.get('main') as FuncDef;
  const result = callFunction(main, [], main, ctx);
  return { output: ctx.out.join(''), exitCode: result ?? 0 };
}

function step(node: AstNode, ctx: RunContext): void {
  if (++ctx.steps > ctx.maxSteps) fail(node, 'step limit exceeded');
}

// ---------- statements ----------

/** env is the scope chain: an array of Maps, innermost last. */
function exec(node: Stmt, env: Env, ctx: RunContext): void {
  step(node, ctx);

  switch (node.type) {
    case 'DeclStmt':
      for (const v of node.decls) {
        let value: Value = 0;
        if (v.size) value = new Array<number>(v.size.value).fill(0);
        else if (v.init) value = convert(v.varType, evalNumber(v.init, env, ctx));
        env[env.length - 1].set(v.name, { varType: v.varType, value });
      }
      return;

    case 'Block': {
      const inner = [...env, new Map()];
      node.body.forEach(s => exec(s, inner, ctx));
      return;
    }

    case 'If':
      if (evalNumber(node.cond, env, ctx) !== 0) exec(node.then, env, ctx);
      else if (node.else) exec(node.else, env, ctx);
      return;

    case 'While':
      while (evalNumber(node.cond, env, ctx) !== 0 && loopBody(node.body, env, ctx));
      return;

    case 'DoWhile':
      while (loopBody(node.body, env, ctx) && evalNumber(node.cond, env, ctx) !== 0);
      return;

    case 'For': {
      // for (int i ...) lives only in the loop.
      const scope = [...env, new Map()];

      if (node.init?.type === 'DeclStmt') exec(node.init, scope, ctx);
      else if (node.init) evaluate(node.init, scope, ctx);

      const { cond, update } = node;
      while ((!cond || evalNumber(cond, scope, ctx) !== 0) && loopBody(node.body, scope, ctx)) {
        if (update) evaluate(update, scope, ctx);
      }
      return;
    }

    case 'Break':
      throw BREAK;

    case 'Continue':
      throw CONTINUE;

    case 'Return':
      throw new ReturnSignal(node.value ? evalNumber(node.value, env, ctx) : undefined);

    case 'ExprStmt':
      if (node.expr) evaluate(node.expr, env, ctx);
      return;
  }
}

/** Runs one loop iteration; returns false when the loop must stop (break). */
function loopBody(body: Stmt, env: Env, ctx: RunContext): boolean {
  try {
    exec(body, env, ctx);
  } catch (signal) {
    if (signal === BREAK) return false;
    if (signal !== CONTINUE) throw signal;
  }
  return true;
}

function callFunction(
  f: FuncDef,
  args: Value[],
  callNode: AstNode,
  ctx: RunContext,
): number | undefined {
  if (++ctx.depth > ctx.maxDepth) fail(callNode, 'recursion depth limit exceeded');

  const scope: Scope = new Map();
  f.params.forEach((p, i) => {
    const value = p.isArray ? args[i] : convert(p.varType, args[i] as number);
    scope.set(p.name, { varType: p.varType, value });
  });

  // Parameters share the scope of the body's outer block.
  const env = [ctx.globals, scope];

  try {
    f.body.body.forEach(s => exec(s, env, ctx));
    return undefined; // fell off the end of the function
  } catch (signal) {
    // Deeply nested code can exhaust the JS stack before maxDepth calls.
    if (signal instanceof RangeError) fail(callNode, 'recursion depth limit exceeded');
    if (!(signal instanceof ReturnSignal)) throw signal;

    if (f.retType === 'void' || signal.value === undefined) return undefined;
    return convert(f.retType, signal.value);
  } finally {
    ctx.depth--;
  }
}

// ---------- expressions ----------

function lookup(env: Env, name: string): Slot {
  for (let i = env.length - 1; i >= 0; i--) {
    const slot = env[i].get(name);
    if (slot) return slot;
  }
  throw new Error(`'${name}' not found (semantic analysis should have caught this)`);
}

/** A storage place (variable or array element) with get/set; the index is evaluated once. */
function reference(node: LValue, env: Env, ctx: RunContext): Reference {
  const slot = lookup(env, node.name);

  if (node.type === 'Ident') {
    return {
      varType: slot.varType,
      get: () => slot.value as number,
      set: v => {
        slot.value = v;
      },
    };
  }

  return elementReference(node, slot, env, ctx);
}

function elementReference(node: Index, slot: Slot, env: Env, ctx: RunContext): Reference {
  const i = Math.trunc(evalNumber(node.index, env, ctx));
  const array = slot.value as number[];

  if (i < 0 || i >= array.length) {
    fail(node, `index ${i} out of bounds for '${node.name}' (size ${array.length})`);
  }

  return {
    varType: slot.varType,
    get: () => array[i],
    set: v => {
      array[i] = v;
    },
  };
}

function arithmetic(op: ArithmeticOp, l: number, r: number, ctype: CType, node: Expr): number {
  if (ctype === 'double') {
    switch (op) {
      case '+':
        return l + r;
      case '-':
        return l - r;
      case '*':
        return l * r;
      case '/':
        return l / r;
      case '%':
        break; // semantic analysis allows % on ints only
    }
  }

  switch (op) {
    case '+':
      return (l + r) | 0;
    case '-':
      return (l - r) | 0;
    case '*':
      return Math.imul(l, r);
    case '/':
      if (r === 0) fail(node, 'division by zero');
      return Math.trunc(l / r) | 0;
    case '%':
      if (r === 0) fail(node, 'division by zero');
      return l % r; // JS % keeps the sign of l, like C
  }
}

/** Evaluates an expression that semantic analysis has checked to be a number. */
function evalNumber(node: Expr, env: Env, ctx: RunContext): number {
  return evaluate(node, env, ctx) as number;
}

function evaluate(node: Expr, env: Env, ctx: RunContext): Value {
  step(node, ctx);

  switch (node.type) {
    case 'IntLit':
    case 'FloatLit':
    case 'CharLit':
    case 'StringLit':
      return node.value;

    case 'Ident':
      // For an array argument this is the array itself.
      return lookup(env, node.name).value;

    case 'Index':
      return reference(node, env, ctx).get();

    case 'Assign': {
      const ref = reference(node.target, env, ctx);
      const v = evalNumber(node.value, env, ctx);
      const isDouble = node.target.ctype === 'double' || node.value.ctype === 'double';
      const result =
        node.op === '='
          ? v
          : arithmetic(node.op[0] as ArithmeticOp, ref.get(), v, isDouble ? 'double' : 'int', node);

      ref.set(convert(ref.varType, result));
      return ref.get();
    }

    case 'PreIncDec':
    case 'PostIncDec': {
      const ref = reference(node.target, env, ctx);
      const old = ref.get();
      ref.set(convert(ref.varType, node.op === '++' ? old + 1 : old - 1));
      return node.type === 'PreIncDec' ? ref.get() : old;
    }

    case 'Unary': {
      const v = evalNumber(node.operand, env, ctx);
      if (node.op === '!') return v === 0 ? 1 : 0;
      return node.ctype === 'int' ? -v | 0 : -v;
    }

    case 'Binary': {
      const { op } = node;

      if (op === '&&') {
        return evalNumber(node.left, env, ctx) !== 0 && evalNumber(node.right, env, ctx) !== 0
          ? 1
          : 0;
      }
      if (op === '||') {
        return evalNumber(node.left, env, ctx) !== 0 || evalNumber(node.right, env, ctx) !== 0
          ? 1
          : 0;
      }

      const l = evalNumber(node.left, env, ctx);
      const r = evalNumber(node.right, env, ctx);

      if (op in COMPARE_FNS) return COMPARE_FNS[op as CompareOp](l, r) ? 1 : 0;
      return arithmetic(op as ArithmeticOp, l, r, node.ctype ?? 'int', node);
    }

    case 'Call': {
      const args = node.args.map(a => evaluate(a, env, ctx));

      if (node.name === 'printf') {
        let text: string;
        try {
          text = formatPrintf(args[0] as string, args.slice(1));
        } catch (e) {
          return fail(node, (e as Error).message);
        }
        ctx.out.push(text);
        return text.length;
      }

      const f = ctx.functions.get(node.name) as FuncDef;
      return callFunction(f, args, node, ctx) ?? 0;
    }
  }
}
