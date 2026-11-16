// Converts the AST (JSON from cparser) into the { label, children } shape d3.hierarchy expects.
// Pure function: no DOM, so it is tested in Node.

const CATEGORY = {
  Program: 'decl', FuncDef: 'decl', Param: 'decl', DeclStmt: 'decl', VarDecl: 'decl',
  Block: 'stmt', If: 'stmt', While: 'stmt', DoWhile: 'stmt', For: 'stmt',
  Break: 'stmt', Continue: 'stmt', Return: 'stmt', ExprStmt: 'stmt',
  IntLit: 'literal', FloatLit: 'literal', CharLit: 'literal', StringLit: 'literal',
};

// Short text shown next to the node type: name, operator or literal value.
function detail(n) {
  switch (n.type) {
    case 'FuncDef': case 'Call': case 'Index': case 'Ident': return n.name;
    case 'Param': return `${n.varType} ${n.name}${n.isArray ? '[]' : ''}`;
    case 'VarDecl': return `${n.varType} ${n.name}${n.size ? `[${n.size.value}]` : ''}`;
    case 'Assign': case 'Binary': case 'Unary': case 'PreIncDec': case 'PostIncDec': return n.op;
    case 'IntLit': return String(n.value);
    case 'FloatLit': case 'CharLit': return n.text;
    case 'StringLit': return JSON.stringify(n.value);
    default: return '';
  }
}

const isNode = v => v !== null && typeof v === 'object' && typeof v.type === 'string';

export function toHierarchy(node, field = null) {
  const d = detail(node);
  const result = { label: d ? `${node.type} ${d}` : node.type, category: CATEGORY[node.type] || 'expr', field, line: node.line };
  // Child nodes are the object/array fields, in the order cparser printed them (schema order).
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) value.filter(isNode).forEach(v => children.push(toHierarchy(v, key)));
    else if (isNode(value)) children.push(toHierarchy(value, key));
  }
  if (children.length) result.children = children;
  return result;
}
