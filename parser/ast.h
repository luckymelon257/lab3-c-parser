/* Abstract syntax tree of the C subset.
 *
 * Every node uses the same struct. The meaning of each slot depends on the kind
 * and matches the JSON field names printed by ast_print_json():
 *
 *   kind         str    str2      a       b      c       d     list    num / flag
 *   Program                                                    decls
 *   FuncDef      name   retType   body                         params
 *   Param        name   varType                                        flag = isArray
 *   DeclStmt                                                   decls
 *   VarDecl      name   varType   size    init
 *   Block                                                      body
 *   If                            cond    then   else
 *   While                         cond    body
 *   DoWhile                       body    cond
 *   For                           init    cond   update  body
 *   Break, Continue
 *   Return                        value
 *   ExprStmt                      expr
 *   Assign       op               target  value
 *   Binary       op               left    right
 *   Unary        op               operand
 *   PreIncDec    op               target
 *   PostIncDec   op               target
 *   Call         name                                          args
 *   Index        name             index
 *   Ident        name
 *   IntLit                                                             num = value
 *   FloatLit     text                                                  num = value
 *   CharLit      text                                                  num = value
 *   StringLit    value
 */
#ifndef AST_H
#define AST_H

#include <stdio.h>

typedef enum {
    N_PROGRAM, N_FUNCDEF, N_PARAM, N_DECLSTMT, N_VARDECL,
    N_BLOCK, N_IF, N_WHILE, N_DOWHILE, N_FOR, N_BREAK, N_CONTINUE, N_RETURN, N_EXPRSTMT,
    N_ASSIGN, N_BINARY, N_UNARY, N_PREINCDEC, N_POSTINCDEC, N_CALL, N_INDEX, N_IDENT,
    N_INTLIT, N_FLOATLIT, N_CHARLIT, N_STRINGLIT
} NodeKind;

typedef struct Node Node;

typedef struct NodeList {
    Node **items;
    int len, cap;
} NodeList;

struct Node {
    NodeKind kind;
    int line;
    char *str, *str2;
    double num;
    int flag;
    Node *a, *b, *c, *d;
    NodeList *list;
};

NodeList *list_new(void);
NodeList *list_add(NodeList *list, Node *item);   /* returns list, for use in grammar actions */

Node *mk_program(NodeList *decls);
Node *mk_funcdef(char *name, char *retType, NodeList *params, Node *body, int line);
Node *mk_param(char *name, char *varType, int isArray, int line);
Node *mk_declstmt(char *varType, NodeList *decls, int line);  /* sets varType on every VarDecl */
Node *mk_vardecl(char *name, Node *size, Node *init, int line);
Node *mk_block(NodeList *body, int line);
Node *mk_if(Node *cond, Node *then, Node *els, int line);
Node *mk_while(Node *cond, Node *body, int line);
Node *mk_dowhile(Node *body, Node *cond, int line);
Node *mk_for(Node *init, Node *cond, Node *update, Node *body, int line);
Node *mk_break(int line);
Node *mk_continue(int line);
Node *mk_return(Node *value, int line);
Node *mk_exprstmt(Node *expr, int line);
Node *mk_assign(const char *op, Node *target, Node *value, int line);
Node *mk_binary(const char *op, Node *left, Node *right, int line);
Node *mk_unary(const char *op, Node *operand, int line);
Node *mk_incdec(NodeKind kind, const char *op, Node *target, int line);  /* N_PREINCDEC or N_POSTINCDEC */
Node *mk_call(char *name, NodeList *args, int line);
Node *mk_index(char *name, Node *index, int line);
Node *mk_ident(char *name, int line);
Node *mk_lit(NodeKind kind, double value, char *text, int line);       /* Int/Float/Char literal */
Node *mk_string(char *value, int line);

extern Node *ast_root;   /* set by the grammar's start rule */

void ast_print_json(const Node *n, FILE *out);
void ast_free(Node *n);

#endif
