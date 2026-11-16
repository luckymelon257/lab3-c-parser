// Semantic analysis: checks names, scopes and arrays, and annotates the AST in place.
//   - every expression gets ctype: 'int' | 'double' | 'string' | 'void' (char counts as int)
//   - Ident/Index get varType and isArray
//   - VarDecl gets shadows (an outer variable with the same name is visible)
//   - FuncDef gets assignedGlobals (needed by the Python translator for `global x`)
// The interpreter and translator rely on these annotations.

export class SemanticError extends Error {
  name = 'SemanticError';
}

function fail(node, message) {
  throw new SemanticError(`line ${node.line}: ${message}`);
}

const ctypeOf = varType => (varType === 'double' ? 'double' : 'int');
const ARITHMETIC = new Set(['+', '-', '*', '/', '%']);

export function analyze(ast) {
  // Functions first, so a call may come before the definition.
  const functions = new Map();
  for (const d of ast.decls) {
    if (d.type !== 'FuncDef') continue;
    if (functions.has(d.name)) fail(d, `function '${d.name}' is already defined`);
    functions.set(d.name, d);
  }
  if (!functions.has('main')) fail(ast, "missing function 'main'");

  const globals = new Map();   // name -> { varType, isArray, global: true }
  for (const d of ast.decls) {
    if (d.type === 'DeclStmt') {
      statement(d, { scopes: [globals], func: null, loops: 0, functions, isGlobal: true });
    } else {
      d.assignedGlobals = [];
      const params = new Map();
      for (const p of d.params) {
        if (params.has(p.name)) fail(p, `'${p.name}' is already declared in this scope`);
        params.set(p.name, { varType: p.varType, isArray: p.isArray });
      }
      // Parameters share the scope of the function body's outer block, as in C.
      const ctx = { scopes: [globals, params], func: d, loops: 0, functions };
      d.body.body.forEach(s => statement(s, ctx));
    }
  }
  return ast;
}

// ---------- statements ----------

function statement(node, ctx) {
  switch (node.type) {
    case 'DeclStmt':
      for (const v of node.decls) {
        if (v.init) value(v.init, ctx);
        const scope = ctx.scopes[ctx.scopes.length - 1];
        if (scope.has(v.name)) fail(v, `'${v.name}' is already declared in this scope`);
        v.shadows = ctx.scopes.some(s => s.has(v.name));
        scope.set(v.name, { varType: v.varType, isArray: v.size !== null, global: !!ctx.isGlobal });
      }
      break;
    case 'Block':
      inScope(ctx, () => node.body.forEach(s => statement(s, ctx)));
      break;
    case 'If':
      value(node.cond, ctx);
      statement(node.then, ctx);
      if (node.else) statement(node.else, ctx);
      break;
    case 'While':
      value(node.cond, ctx);
      loopBody(node.body, ctx);
      break;
    case 'DoWhile':
      loopBody(node.body, ctx);
      value(node.cond, ctx);
      break;
    case 'For':
      inScope(ctx, () => {   // a variable declared in `for (int i ...)` lives only in the loop
        if (node.init?.type === 'DeclStmt') statement(node.init, ctx);
        else if (node.init) expr(node.init, ctx);
        if (node.cond) value(node.cond, ctx);
        if (node.update) expr(node.update, ctx);
        loopBody(node.body, ctx);
      });
      break;
    case 'Break':
    case 'Continue':
      if (ctx.loops === 0) fail(node, `'${node.type.toLowerCase()}' outside loop`);
      break;
    case 'Return':
      if (node.value) value(node.value, ctx);
      break;
    case 'ExprStmt':
      if (node.expr) expr(node.expr, ctx);
      break;
  }
}

function inScope(ctx, fn) {
  ctx.scopes.push(new Map());
  fn();
  ctx.scopes.pop();
}

function loopBody(body, ctx) {
  ctx.loops++;
  statement(body, ctx);
  ctx.loops--;
}

// ---------- expressions ----------

function lookup(node, ctx) {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    const entry = ctx.scopes[i].get(node.name);
    if (entry) return entry;
  }
  fail(node, `undeclared variable '${node.name}'`);
}

// An expression whose result is used as a number.
function value(node, ctx) {
  const t = expr(node, ctx);
  if (t === 'string') fail(node, 'a string can only be the format of printf');
  if (t === 'void') fail(node, 'a void function has no value');
  return t;
}

// Ident or Index on the left of =, ++, --. Records assigned globals.
function target(node, ctx) {
  const t = expr(node, ctx);
  const entry = lookup(node, ctx);
  if (entry.global && ctx.func && !ctx.func.assignedGlobals.includes(node.name)) {
    ctx.func.assignedGlobals.push(node.name);
  }
  return t;
}

function expr(node, ctx) {
  node.ctype = exprType(node, ctx);
  return node.ctype;
}

function exprType(node, ctx) {
  switch (node.type) {
    case 'IntLit':
    case 'CharLit':
      return 'int';
    case 'FloatLit':
      return 'double';
    case 'StringLit':
      return 'string';
    case 'Ident': {
      const entry = lookup(node, ctx);
      if (entry.isArray) fail(node, `'${node.name}' is an array`);
      node.varType = entry.varType;
      node.isArray = false;
      return ctypeOf(entry.varType);
    }
    case 'Index': {
      const entry = lookup(node, ctx);
      if (!entry.isArray) fail(node, `'${node.name}' is not an array`);
      value(node.index, ctx);
      node.varType = entry.varType;
      node.isArray = true;
      return ctypeOf(entry.varType);
    }
    case 'Assign':
      value(node.value, ctx);
      return target(node.target, ctx);
    case 'PreIncDec':
    case 'PostIncDec':
      return target(node.target, ctx);
    case 'Unary':
      return node.op === '!' ? (value(node.operand, ctx), 'int') : value(node.operand, ctx);
    case 'Binary': {
      const l = value(node.left, ctx), r = value(node.right, ctx);
      if (!ARITHMETIC.has(node.op)) return 'int';   // comparisons and && || give 0 or 1
      if (node.op === '%' && (l === 'double' || r === 'double')) fail(node, "'%' needs int operands");
      return l === 'double' || r === 'double' ? 'double' : 'int';
    }
    case 'Call':
      return callType(node, ctx);
  }
  throw new Error(`unknown expression ${node.type}`);
}

function callType(node, ctx) {
  if (node.name === 'printf') {
    if (node.args[0]?.type !== 'StringLit') fail(node, 'printf needs a string literal as format');
    expr(node.args[0], ctx);
    node.args.slice(1).forEach(a => value(a, ctx));
    return 'int';
  }
  const f = ctx.functions.get(node.name);
  if (!f) fail(node, `undeclared function '${node.name}'`);
  if (f.params.length !== node.args.length) {
    fail(node, `function '${node.name}' expects ${f.params.length} arguments, got ${node.args.length}`);
  }
  node.args.forEach((arg, i) => {
    if (!f.params[i].isArray) return value(arg, ctx);
    // Array parameter: the argument must be a bare array name (passed by reference).
    const entry = arg.type === 'Ident' ? lookup(arg, ctx) : null;
    if (!entry?.isArray) fail(arg, `argument ${i + 1} of '${node.name}' must be an array`);
    Object.assign(arg, { varType: entry.varType, isArray: true, ctype: ctypeOf(entry.varType) });
  });
  return f.retType === 'void' ? 'void' : ctypeOf(f.retType);
}
