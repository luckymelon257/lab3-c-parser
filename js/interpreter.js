// Tree-walking interpreter: executes the analyzed AST (see semantic.js) and collects printf output.
// Values are JS numbers; int results are wrapped to 32 bits like C on this machine.
// Arrays are JS arrays, so passing one to a function shares it (by reference, as in C).

export class RuntimeError extends Error {
  name = 'RuntimeError';
}

function fail(node, message) {
  throw new RuntimeError(`line ${node.line}: ${message}`);
}

// break / continue / return travel up the JS call stack as thrown signals.
const BREAK = { signal: 'break' };
const CONTINUE = { signal: 'continue' };
class Return {
  constructor(value) { this.value = value; }
}

// Converts a value to the type of the variable that stores it.
// limitation: char is kept as a 32-bit int (no 8-bit wrap); fine for printable characters.
const convert = (varType, v) => (varType === 'double' ? v : Math.trunc(v) | 0);

// printf with %d %i %f %.Nf %c %s %%.
// limitation: %f uses toFixed, which rounds exact ties (0.125 -> 0.13) up, C rounds them to even.
export function formatPrintf(fmt, args) {
  let i = 0;
  return fmt.replace(/%(\.\d+)?([a-zA-Z%])/g, (spec, precision, conv) => {
    switch (conv) {
      case '%': return '%';
      case 'd':
      case 'i': return String(Math.trunc(args[i++]));
      case 'f': return args[i++].toFixed(precision ? Number(precision.slice(1)) : 6);
      case 'c': return String.fromCharCode(args[i++]);
      case 's': return String(args[i++]);
    }
    throw new RuntimeError(`unsupported format '${spec}'`);
  });
}

export function run(ast, { maxSteps = 1_000_000, maxDepth = 1000 } = {}) {
  const ctx = { functions: new Map(), out: [], steps: 0, maxSteps, depth: 0, maxDepth };
  const globals = new Map();
  ctx.globals = globals;
  for (const d of ast.decls) {
    if (d.type === 'FuncDef') ctx.functions.set(d.name, d);
    else exec(d, [globals], ctx);
  }
  const main = ctx.functions.get('main');
  const result = callFunction(main, [], main, ctx);
  return { output: ctx.out.join(''), exitCode: result === undefined ? 0 : result };
}

function step(node, ctx) {
  if (++ctx.steps > ctx.maxSteps) fail(node, 'step limit exceeded');
}

// ---------- statements ----------

// env is the scope chain: an array of Maps, innermost last. Map value: { varType, value }.
function exec(node, env, ctx) {
  step(node, ctx);
  switch (node.type) {
    case 'DeclStmt':
      for (const v of node.decls) {
        const value = v.size ? new Array(v.size.value).fill(0)
          : v.init ? convert(v.varType, evaluate(v.init, env, ctx)) : 0;
        env[env.length - 1].set(v.name, { varType: v.varType, value });
      }
      return;
    case 'Block': {
      const inner = [...env, new Map()];
      node.body.forEach(s => exec(s, inner, ctx));
      return;
    }
    case 'If':
      if (evaluate(node.cond, env, ctx) !== 0) exec(node.then, env, ctx);
      else if (node.else) exec(node.else, env, ctx);
      return;
    case 'While':
      while (evaluate(node.cond, env, ctx) !== 0 && loopBody(node.body, env, ctx));
      return;
    case 'DoWhile':
      while (loopBody(node.body, env, ctx) && evaluate(node.cond, env, ctx) !== 0);
      return;
    case 'For': {
      const scope = [...env, new Map()];   // for (int i ...) lives only in the loop
      if (node.init?.type === 'DeclStmt') exec(node.init, scope, ctx);
      else if (node.init) evaluate(node.init, scope, ctx);
      while ((!node.cond || evaluate(node.cond, scope, ctx) !== 0) && loopBody(node.body, scope, ctx)) {
        if (node.update) evaluate(node.update, scope, ctx);
      }
      return;
    }
    case 'Break':
      throw BREAK;
    case 'Continue':
      throw CONTINUE;
    case 'Return':
      throw new Return(node.value ? evaluate(node.value, env, ctx) : undefined);
    case 'ExprStmt':
      if (node.expr) evaluate(node.expr, env, ctx);
      return;
  }
}

// Runs one loop iteration; returns false when the loop must stop (break).
function loopBody(body, env, ctx) {
  try {
    exec(body, env, ctx);
  } catch (signal) {
    if (signal === BREAK) return false;
    if (signal !== CONTINUE) throw signal;
  }
  return true;
}

function callFunction(f, args, callNode, ctx) {
  if (++ctx.depth > ctx.maxDepth) fail(callNode, 'recursion depth limit exceeded');
  const scope = new Map();
  f.params.forEach((p, i) => {
    scope.set(p.name, { varType: p.varType, value: p.isArray ? args[i] : convert(p.varType, args[i]) });
  });
  const env = [ctx.globals, scope];   // parameters share the scope of the body's outer block
  try {
    f.body.body.forEach(s => exec(s, env, ctx));
    return undefined;   // fell off the end of the function
  } catch (signal) {
    // Deeply nested code can exhaust the JS stack before maxDepth calls.
    if (signal instanceof RangeError) fail(callNode, 'recursion depth limit exceeded');
    if (!(signal instanceof Return)) throw signal;
    return f.retType === 'void' || signal.value === undefined ? undefined : convert(f.retType, signal.value);
  } finally {
    ctx.depth--;
  }
}

// ---------- expressions ----------

function lookup(env, name) {
  for (let i = env.length - 1; i >= 0; i--) {
    if (env[i].has(name)) return env[i].get(name);
  }
  throw new Error(`'${name}' not found (semantic analysis should have caught this)`);
}

// A storage place (variable or array element) with get/set; the index is evaluated once.
function reference(node, env, ctx) {
  const slot = lookup(env, node.name);
  if (node.type === 'Ident') {
    return { varType: slot.varType, get: () => slot.value, set: v => { slot.value = v; } };
  }
  const i = Math.trunc(evaluate(node.index, env, ctx));
  const array = slot.value;
  if (i < 0 || i >= array.length) fail(node, `index ${i} out of bounds for '${node.name}' (size ${array.length})`);
  return { varType: slot.varType, get: () => array[i], set: v => { array[i] = v; } };
}

function arithmetic(op, l, r, ctype, node) {
  if (ctype === 'double') {
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return l / r;
    }
  }
  switch (op) {
    case '+': return (l + r) | 0;
    case '-': return (l - r) | 0;
    case '*': return Math.imul(l, r);
    case '/': if (r === 0) fail(node, 'division by zero'); return Math.trunc(l / r) | 0;
    case '%': if (r === 0) fail(node, 'division by zero'); return l % r;   // JS % keeps the sign of l, like C
  }
}

const COMPARE = {
  '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b,
};

function evaluate(node, env, ctx) {
  step(node, ctx);
  switch (node.type) {
    case 'IntLit':
    case 'FloatLit':
    case 'CharLit':
    case 'StringLit':
      return node.value;
    case 'Ident':
      return lookup(env, node.name).value;   // for an array argument this is the array itself
    case 'Index':
      return reference(node, env, ctx).get();
    case 'Assign': {
      const ref = reference(node.target, env, ctx);
      const v = evaluate(node.value, env, ctx);
      const ctype = node.target.ctype === 'double' || node.value.ctype === 'double' ? 'double' : 'int';
      const result = node.op === '=' ? v : arithmetic(node.op[0], ref.get(), v, ctype, node);
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
      const v = evaluate(node.operand, env, ctx);
      if (node.op === '!') return v === 0 ? 1 : 0;
      return node.ctype === 'int' ? -v | 0 : -v;
    }
    case 'Binary': {
      if (node.op === '&&') return evaluate(node.left, env, ctx) !== 0 && evaluate(node.right, env, ctx) !== 0 ? 1 : 0;
      if (node.op === '||') return evaluate(node.left, env, ctx) !== 0 || evaluate(node.right, env, ctx) !== 0 ? 1 : 0;
      const l = evaluate(node.left, env, ctx), r = evaluate(node.right, env, ctx);
      if (COMPARE[node.op]) return COMPARE[node.op](l, r) ? 1 : 0;
      return arithmetic(node.op, l, r, node.ctype, node);
    }
    case 'Call': {
      const args = node.args.map(a => evaluate(a, env, ctx));
      if (node.name === 'printf') {
        let text;
        try { text = formatPrintf(args[0], args.slice(1)); }
        catch (e) { fail(node, e.message); }
        ctx.out.push(text);
        return text.length;
      }
      return callFunction(ctx.functions.get(node.name), args, node, ctx);
    }
  }
  throw new Error(`unknown expression ${node.type}`);
}
