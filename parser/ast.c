/* AST construction, JSON printing and freeing. Slot meanings are documented in ast.h. */
#include <stdlib.h>
#include <string.h>
#include "ast.h"

Node *ast_root = NULL;

static const char *KIND_NAMES[] = {
    "Program", "FuncDef", "Param", "DeclStmt", "VarDecl",
    "Block", "If", "While", "DoWhile", "For", "Break", "Continue", "Return", "ExprStmt",
    "Assign", "Binary", "Unary", "PreIncDec", "PostIncDec", "Call", "Index", "Ident",
    "IntLit", "FloatLit", "CharLit", "StringLit"
};

/* ---------- construction ---------- */

static Node *new_node(NodeKind kind, int line) {
    Node *n = calloc(1, sizeof(Node));
    n->kind = kind;
    n->line = line;
    return n;
}

NodeList *list_new(void) {
    return calloc(1, sizeof(NodeList));
}

NodeList *list_add(NodeList *list, Node *item) {
    if (list->len == list->cap) {
        list->cap = list->cap ? list->cap * 2 : 4;
        list->items = realloc(list->items, list->cap * sizeof(Node *));
    }
    list->items[list->len++] = item;
    return list;
}

Node *mk_program(NodeList *decls) {
    Node *n = new_node(N_PROGRAM, 1);
    n->list = decls;
    return n;
}

Node *mk_funcdef(char *name, char *retType, NodeList *params, Node *body, int line) {
    Node *n = new_node(N_FUNCDEF, line);
    n->str = name; n->str2 = retType; n->list = params; n->a = body;
    return n;
}

Node *mk_param(char *name, char *varType, int isArray, int line) {
    Node *n = new_node(N_PARAM, line);
    n->str = name; n->str2 = varType; n->flag = isArray;
    return n;
}

Node *mk_declstmt(char *varType, NodeList *decls, int line) {
    Node *n = new_node(N_DECLSTMT, line);
    for (int i = 0; i < decls->len; i++)
        decls->items[i]->str2 = strdup(varType);
    free(varType);
    n->list = decls;
    return n;
}

Node *mk_vardecl(char *name, Node *size, Node *init, int line) {
    Node *n = new_node(N_VARDECL, line);
    n->str = name; n->a = size; n->b = init;
    return n;
}

Node *mk_block(NodeList *body, int line) {
    Node *n = new_node(N_BLOCK, line);
    n->list = body;
    return n;
}

Node *mk_if(Node *cond, Node *then, Node *els, int line) {
    Node *n = new_node(N_IF, line);
    n->a = cond; n->b = then; n->c = els;
    return n;
}

Node *mk_while(Node *cond, Node *body, int line) {
    Node *n = new_node(N_WHILE, line);
    n->a = cond; n->b = body;
    return n;
}

Node *mk_dowhile(Node *body, Node *cond, int line) {
    Node *n = new_node(N_DOWHILE, line);
    n->a = body; n->b = cond;
    return n;
}

Node *mk_for(Node *init, Node *cond, Node *update, Node *body, int line) {
    Node *n = new_node(N_FOR, line);
    n->a = init; n->b = cond; n->c = update; n->d = body;
    return n;
}

Node *mk_break(int line) { return new_node(N_BREAK, line); }
Node *mk_continue(int line) { return new_node(N_CONTINUE, line); }

Node *mk_return(Node *value, int line) {
    Node *n = new_node(N_RETURN, line);
    n->a = value;
    return n;
}

Node *mk_exprstmt(Node *expr, int line) {
    Node *n = new_node(N_EXPRSTMT, line);
    n->a = expr;
    return n;
}

Node *mk_assign(const char *op, Node *target, Node *value, int line) {
    Node *n = new_node(N_ASSIGN, line);
    n->str = strdup(op); n->a = target; n->b = value;
    return n;
}

Node *mk_binary(const char *op, Node *left, Node *right, int line) {
    Node *n = new_node(N_BINARY, line);
    n->str = strdup(op); n->a = left; n->b = right;
    return n;
}

Node *mk_unary(const char *op, Node *operand, int line) {
    Node *n = new_node(N_UNARY, line);
    n->str = strdup(op); n->a = operand;
    return n;
}

Node *mk_incdec(NodeKind kind, const char *op, Node *target, int line) {
    Node *n = new_node(kind, line);
    n->str = strdup(op); n->a = target;
    return n;
}

Node *mk_call(char *name, NodeList *args, int line) {
    Node *n = new_node(N_CALL, line);
    n->str = name; n->list = args;
    return n;
}

Node *mk_index(char *name, Node *index, int line) {
    Node *n = new_node(N_INDEX, line);
    n->str = name; n->a = index;
    return n;
}

Node *mk_ident(char *name, int line) {
    Node *n = new_node(N_IDENT, line);
    n->str = name;
    return n;
}

Node *mk_lit(NodeKind kind, double value, char *text, int line) {
    Node *n = new_node(kind, line);
    n->num = value;
    if (kind == N_INTLIT) free(text);   /* IntLit JSON has no "text" field */
    else n->str = text;
    return n;
}

Node *mk_string(char *value, int line) {
    Node *n = new_node(N_STRINGLIT, line);
    n->str = value;
    return n;
}

/* ---------- JSON output ---------- */

static void print_node(const Node *n, FILE *out, int depth);

static void indent(FILE *out, int depth) {
    fprintf(out, "%*s", depth * 2, "");
}

/* Starts the next field of an object: comma, newline, indentation, key. */
static void key(FILE *out, int depth, const char *name) {
    fprintf(out, ",\n");
    indent(out, depth);
    fprintf(out, "\"%s\": ", name);
}

static void print_string(FILE *out, const char *s) {
    fputc('"', out);
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"') fputs("\\\"", out);
        else if (c == '\\') fputs("\\\\", out);
        else if (c == '\n') fputs("\\n", out);
        else if (c == '\t') fputs("\\t", out);
        else if (c < 0x20) fprintf(out, "\\u%04x", c);
        else fputc(c, out);
    }
    fputc('"', out);
}

static void field_str(FILE *out, int depth, const char *name, const char *value) {
    key(out, depth, name);
    print_string(out, value);
}

static void field_num(FILE *out, int depth, const char *name, double value) {
    key(out, depth, name);
    fprintf(out, "%.17g", value);
}

static void field_node(FILE *out, int depth, const char *name, const Node *value) {
    key(out, depth, name);
    print_node(value, out, depth);
}

static void field_list(FILE *out, int depth, const char *name, const NodeList *list) {
    key(out, depth, name);
    if (list->len == 0) { fputs("[]", out); return; }
    fputs("[\n", out);
    for (int i = 0; i < list->len; i++) {
        indent(out, depth + 1);
        print_node(list->items[i], out, depth + 1);
        fputs(i + 1 < list->len ? ",\n" : "\n", out);
    }
    indent(out, depth);
    fputc(']', out);
}

static void print_node(const Node *n, FILE *out, int depth) {
    if (!n) { fputs("null", out); return; }
    int d = depth + 1;
    fputs("{\n", out);
    indent(out, d);
    fprintf(out, "\"type\": \"%s\"", KIND_NAMES[n->kind]);
    key(out, d, "line");
    fprintf(out, "%d", n->line);

    switch (n->kind) {
    case N_PROGRAM:   field_list(out, d, "decls", n->list); break;
    case N_FUNCDEF:   field_str(out, d, "name", n->str); field_str(out, d, "retType", n->str2);
                      field_list(out, d, "params", n->list); field_node(out, d, "body", n->a); break;
    case N_PARAM:     field_str(out, d, "name", n->str); field_str(out, d, "varType", n->str2);
                      key(out, d, "isArray"); fputs(n->flag ? "true" : "false", out); break;
    case N_DECLSTMT:  field_list(out, d, "decls", n->list); break;
    case N_VARDECL:   field_str(out, d, "name", n->str); field_str(out, d, "varType", n->str2);
                      field_node(out, d, "size", n->a); field_node(out, d, "init", n->b); break;
    case N_BLOCK:     field_list(out, d, "body", n->list); break;
    case N_IF:        field_node(out, d, "cond", n->a); field_node(out, d, "then", n->b);
                      field_node(out, d, "else", n->c); break;
    case N_WHILE:     field_node(out, d, "cond", n->a); field_node(out, d, "body", n->b); break;
    case N_DOWHILE:   field_node(out, d, "body", n->a); field_node(out, d, "cond", n->b); break;
    case N_FOR:       field_node(out, d, "init", n->a); field_node(out, d, "cond", n->b);
                      field_node(out, d, "update", n->c); field_node(out, d, "body", n->d); break;
    case N_BREAK:
    case N_CONTINUE:  break;
    case N_RETURN:    field_node(out, d, "value", n->a); break;
    case N_EXPRSTMT:  field_node(out, d, "expr", n->a); break;
    case N_ASSIGN:    field_str(out, d, "op", n->str); field_node(out, d, "target", n->a);
                      field_node(out, d, "value", n->b); break;
    case N_BINARY:    field_str(out, d, "op", n->str); field_node(out, d, "left", n->a);
                      field_node(out, d, "right", n->b); break;
    case N_UNARY:     field_str(out, d, "op", n->str); field_node(out, d, "operand", n->a); break;
    case N_PREINCDEC:
    case N_POSTINCDEC: field_str(out, d, "op", n->str); field_node(out, d, "target", n->a); break;
    case N_CALL:      field_str(out, d, "name", n->str); field_list(out, d, "args", n->list); break;
    case N_INDEX:     field_str(out, d, "name", n->str); field_node(out, d, "index", n->a); break;
    case N_IDENT:     field_str(out, d, "name", n->str); break;
    case N_INTLIT:    field_num(out, d, "value", n->num); break;
    case N_FLOATLIT:
    case N_CHARLIT:   field_num(out, d, "value", n->num); field_str(out, d, "text", n->str); break;
    case N_STRINGLIT: field_str(out, d, "value", n->str); break;
    }
    fputc('\n', out);
    indent(out, depth);
    fputc('}', out);
}

void ast_print_json(const Node *n, FILE *out) {
    print_node(n, out, 0);
    fputc('\n', out);
}

/* ---------- freeing ---------- */

void ast_free(Node *n) {
    if (!n) return;
    ast_free(n->a); ast_free(n->b); ast_free(n->c); ast_free(n->d);
    if (n->list) {
        for (int i = 0; i < n->list->len; i++) ast_free(n->list->items[i]);
        free(n->list->items);
        free(n->list);
    }
    free(n->str);
    free(n->str2);
    free(n);
}
