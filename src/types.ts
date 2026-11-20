// Shared types: the AST printed by build/cparser (see parser/ast.h) and the data
// structures of the semantic pass, the interpreter, the translator and the web tree.

import type { HierarchyPointNode } from 'd3';

// ---------- C types ----------

/** Type of a variable or parameter. */
export type VarType = 'int' | 'double' | 'char';

/** Return type of a function. */
export type RetType = VarType | 'void';

/** Type of an expression after semantic analysis (char counts as int). */
export type CType = 'int' | 'double' | 'string' | 'void';

// ---------- operators ----------

export type ArithmeticOp = '+' | '-' | '*' | '/' | '%';
export type CompareOp = '<' | '>' | '<=' | '>=' | '==' | '!=';
export type LogicOp = '&&' | '||';
export type BinaryOp = ArithmeticOp | CompareOp | LogicOp;
export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=';
export type UnaryOp = '-' | '!';
export type IncDecOp = '++' | '--';

// ---------- AST: declarations ----------

interface NodeBase {
  line: number;
}

export interface Program extends NodeBase {
  type: 'Program';
  decls: (FuncDef | DeclStmt)[];
}

export interface FuncDef extends NodeBase {
  type: 'FuncDef';
  name: string;
  retType: RetType;
  params: Param[];
  body: Block;
  /** Set by semantic analysis: globals the function assigns (Python needs `global x`). */
  assignedGlobals?: string[];
}

export interface Param extends NodeBase {
  type: 'Param';
  name: string;
  varType: VarType;
  isArray: boolean;
}

export interface VarDecl extends NodeBase {
  type: 'VarDecl';
  name: string;
  varType: VarType;
  /** Array size, or null for a plain variable. */
  size: IntLit | null;
  init: Expr | null;
  /** Set by semantic analysis: an outer variable with the same name is visible. */
  shadows?: boolean;
}

// ---------- AST: statements ----------

export interface DeclStmt extends NodeBase {
  type: 'DeclStmt';
  decls: VarDecl[];
}

export interface Block extends NodeBase {
  type: 'Block';
  body: Stmt[];
}

export interface If extends NodeBase {
  type: 'If';
  cond: Expr;
  then: Stmt;
  else: Stmt | null;
}

export interface While extends NodeBase {
  type: 'While';
  cond: Expr;
  body: Stmt;
}

export interface DoWhile extends NodeBase {
  type: 'DoWhile';
  body: Stmt;
  cond: Expr;
}

export interface For extends NodeBase {
  type: 'For';
  init: DeclStmt | Expr | null;
  cond: Expr | null;
  update: Expr | null;
  body: Stmt;
}

export interface Break extends NodeBase {
  type: 'Break';
}

export interface Continue extends NodeBase {
  type: 'Continue';
}

export interface Return extends NodeBase {
  type: 'Return';
  value: Expr | null;
}

export interface ExprStmt extends NodeBase {
  type: 'ExprStmt';
  expr: Expr | null;
}

export type Stmt =
  | DeclStmt
  | Block
  | If
  | While
  | DoWhile
  | For
  | Break
  | Continue
  | Return
  | ExprStmt;

// ---------- AST: expressions ----------

interface ExprBase extends NodeBase {
  /** Set by semantic analysis. */
  ctype?: CType;
}

export interface Assign extends ExprBase {
  type: 'Assign';
  op: AssignOp;
  target: LValue;
  value: Expr;
}

export interface Binary extends ExprBase {
  type: 'Binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export interface Unary extends ExprBase {
  type: 'Unary';
  op: UnaryOp;
  operand: Expr;
}

export interface PreIncDec extends ExprBase {
  type: 'PreIncDec';
  op: IncDecOp;
  target: LValue;
}

export interface PostIncDec extends ExprBase {
  type: 'PostIncDec';
  op: IncDecOp;
  target: LValue;
}

export interface Call extends ExprBase {
  type: 'Call';
  name: string;
  args: Expr[];
}

export interface Index extends ExprBase {
  type: 'Index';
  name: string;
  index: Expr;
  /** Set by semantic analysis. */
  varType?: VarType;
  isArray?: boolean;
}

export interface Ident extends ExprBase {
  type: 'Ident';
  name: string;
  /** Set by semantic analysis. */
  varType?: VarType;
  isArray?: boolean;
}

export interface IntLit extends ExprBase {
  type: 'IntLit';
  value: number;
}

export interface FloatLit extends ExprBase {
  type: 'FloatLit';
  value: number;
  /** Literal as written in the source, e.g. "2.50". */
  text: string;
}

export interface CharLit extends ExprBase {
  type: 'CharLit';
  value: number;
  /** Literal as written in the source, e.g. "'a'". */
  text: string;
}

export interface StringLit extends ExprBase {
  type: 'StringLit';
  value: string;
}

/** Something that can be assigned: a variable or an array element. */
export type LValue = Ident | Index;

export type Expr =
  | Assign
  | Binary
  | Unary
  | PreIncDec
  | PostIncDec
  | Call
  | Index
  | Ident
  | IntLit
  | FloatLit
  | CharLit
  | StringLit;

export type AstNode = Program | FuncDef | Param | VarDecl | Stmt | Expr;

// ---------- semantic analysis ----------

export interface SymbolEntry {
  varType: VarType;
  isArray: boolean;
  global?: boolean;
}

export type SymbolScope = Map<string, SymbolEntry>;

export interface SemanticContext {
  /** Scope chain, innermost last. */
  scopes: SymbolScope[];
  /** Function being analyzed; null for global declarations. */
  func: FuncDef | null;
  /** How many loops enclose the current statement (break/continue check). */
  loops: number;
  functions: Map<string, FuncDef>;
  isGlobal?: boolean;
}

// ---------- interpreter ----------

/** A runtime value: a number, a printf format string, or an array (shared by reference). */
export type Value = number | string | number[];

export interface Slot {
  varType: VarType;
  value: Value;
}

export type Scope = Map<string, Slot>;

/** Scope chain, innermost last. */
export type Env = Scope[];

/** A storage place (variable or array element). */
export interface Reference {
  varType: VarType;
  get(): number;
  set(value: number): void;
}

export interface LoopSignal {
  signal: 'break' | 'continue';
}

export interface RunOptions {
  maxSteps?: number;
  maxDepth?: number;
}

export interface RunResult {
  output: string;
  exitCode: number;
}

export interface RunContext {
  functions: Map<string, FuncDef>;
  globals: Scope;
  out: string[];
  steps: number;
  maxSteps: number;
  depth: number;
  maxDepth: number;
}

// ---------- translator ----------

export interface LoopInfo {
  kind: 'while' | 'do' | 'for';
  /** Update expression of a for loop: `continue` must run it by hand. */
  update?: Expr | null;
}

export interface TranslateContext {
  functions: Map<string, FuncDef>;
  func?: FuncDef;
  loop: LoopInfo | null;
}

/** Python expression text plus its precedence, so parents know when to add parentheses. */
export interface Emitted {
  text: string;
  prec: number;
}

// ---------- web tree ----------

export type NodeCategory = 'decl' | 'stmt' | 'expr' | 'literal';

/** Shape that d3.hierarchy expects. */
export interface TreeNode {
  label: string;
  category: NodeCategory;
  /** Name of the parent's field that holds this node (shown on the edge). */
  field: string | null;
  line: number;
  children?: TreeNode[];
}

/** A laid-out d3 tree node that can be collapsed (children moved to _children). */
export type TreeDatum = HierarchyPointNode<TreeNode> & {
  /** Stable key for d3 joins (d3 nodes already have a string `id`). */
  uid: number;
  _children?: TreeDatum[];
};

// ---------- server ----------

export type ParseResponse = { ok: true; ast: Program } | { ok: false; error: string };
