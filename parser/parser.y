/* Grammar of the C subset. Bison turns it into an LALR(1) parser (build/parser.c).
 * Each action builds an AST node (see ast.h); the start rule stores the root in ast_root. */
%{
#include <stdio.h>
#include <string.h>
#include "ast.h"
int yylex(void);
void yyerror(const char *msg);
%}

%code requires {
    #include "ast.h"
}

%code provides {
    const char *token_name(int tok);
}

%locations
%define parse.error verbose

%union {
    char *str;                                /* IDENT, STRING_LIT (unescaped), type names */
    struct { double num; char *text; } lit;   /* INT_LIT, FLOAT_LIT, CHAR_LIT */
    Node *node;
    NodeList *list;
}

%token INT DOUBLE CHAR VOID IF ELSE WHILE DO FOR BREAK CONTINUE RETURN
%token <str> IDENT STRING_LIT
%token <lit> INT_LIT FLOAT_LIT CHAR_LIT
%token LE GE EQ NE AND OR INC DEC
%token ADD_ASSIGN SUB_ASSIGN MUL_ASSIGN DIV_ASSIGN MOD_ASSIGN

%type <str>  type
%type <list> ext_list params param_list declarators stmt_list args arg_list
%type <node> ext_decl func_def param decl_stmt declarator block stmt for_init
%type <node> expr expr_opt lvalue

/* Operator precedence, lowest first. Lines lower in the list bind tighter.
 * These declarations resolve the shift/reduce conflicts of the ambiguous expr grammar
 * and the dangling else (IF ... stmt . ELSE: ELSE is higher than LOWER_THAN_ELSE, so shift).
 * %left = left-associative (a-b-c = (a-b)-c). %precedence = level only: associativity is
 * never needed there (bison -Wprecedence checks this). Assignment is right-associative by
 * the grammar itself: `lvalue '=' expr` only allows a variable on the left. */
%precedence LOWER_THAN_ELSE
%precedence ELSE
%precedence '=' ADD_ASSIGN SUB_ASSIGN MUL_ASSIGN DIV_ASSIGN MOD_ASSIGN
%left OR
%left AND
%left EQ NE
%left '<' '>' LE GE
%left '+' '-'
%left '*' '/' '%'
%precedence UMINUS '!'

%%

program
    : ext_list                  { ast_root = mk_program($1); }
    ;

ext_list
    : %empty                    { $$ = list_new(); }
    | ext_list ext_decl         { $$ = list_add($1, $2); }
    ;

ext_decl
    : func_def
    | decl_stmt
    ;

type
    : INT                       { $$ = strdup("int"); }
    | DOUBLE                    { $$ = strdup("double"); }
    | CHAR                      { $$ = strdup("char"); }
    ;

/* `void` is a separate rule, not part of `type`: after `int x` the parser must not
 * yet decide between a function and a variable (that would be a conflict). */
func_def
    : type IDENT '(' params ')' block   { $$ = mk_funcdef($2, $1, $4, $6, @2.first_line); }
    | VOID IDENT '(' params ')' block   { $$ = mk_funcdef($2, strdup("void"), $4, $6, @2.first_line); }
    ;

params
    : %empty                    { $$ = list_new(); }
    | VOID                      { $$ = list_new(); }
    | param_list
    ;

param_list
    : param                     { $$ = list_add(list_new(), $1); }
    | param_list ',' param      { $$ = list_add($1, $3); }
    ;

param
    : type IDENT                { $$ = mk_param($2, $1, 0, @2.first_line); }
    | type IDENT '[' ']'        { $$ = mk_param($2, $1, 1, @2.first_line); }
    ;

decl_stmt
    : type declarators ';'      { $$ = mk_declstmt($1, $2, @1.first_line); }
    ;

declarators
    : declarator                    { $$ = list_add(list_new(), $1); }
    | declarators ',' declarator    { $$ = list_add($1, $3); }
    ;

declarator
    : IDENT                     { $$ = mk_vardecl($1, NULL, NULL, @1.first_line); }
    | IDENT '=' expr            { $$ = mk_vardecl($1, NULL, $3, @1.first_line); }
    | IDENT '[' INT_LIT ']'     { $$ = mk_vardecl($1, mk_lit(N_INTLIT, $3.num, $3.text, @3.first_line), NULL, @1.first_line); }
    ;

block
    : '{' stmt_list '}'         { $$ = mk_block($2, @1.first_line); }
    ;

stmt_list
    : %empty                    { $$ = list_new(); }
    | stmt_list stmt            { $$ = list_add($1, $2); }
    ;

stmt
    : block
    | decl_stmt
    | expr ';'                  { $$ = mk_exprstmt($1, @1.first_line); }
    | ';'                       { $$ = mk_exprstmt(NULL, @1.first_line); }
    | IF '(' expr ')' stmt %prec LOWER_THAN_ELSE   { $$ = mk_if($3, $5, NULL, @1.first_line); }
    | IF '(' expr ')' stmt ELSE stmt               { $$ = mk_if($3, $5, $7, @1.first_line); }
    | WHILE '(' expr ')' stmt                      { $$ = mk_while($3, $5, @1.first_line); }
    | DO stmt WHILE '(' expr ')' ';'               { $$ = mk_dowhile($2, $5, @1.first_line); }
    | FOR '(' for_init ';' expr_opt ';' expr_opt ')' stmt
                                { $$ = mk_for($3, $5, $7, $9, @1.first_line); }
    | BREAK ';'                 { $$ = mk_break(@1.first_line); }
    | CONTINUE ';'              { $$ = mk_continue(@1.first_line); }
    | RETURN expr_opt ';'       { $$ = mk_return($2, @1.first_line); }
    ;

for_init
    : expr_opt
    | type declarators          { $$ = mk_declstmt($1, $2, @1.first_line); }
    ;

expr_opt
    : %empty                    { $$ = NULL; }
    | expr
    ;

/* Ambiguous on purpose: precedence and associativity come from the %left/%right list. */
expr
    : lvalue '=' expr           { $$ = mk_assign("=",  $1, $3, @1.first_line); }
    | lvalue ADD_ASSIGN expr    { $$ = mk_assign("+=", $1, $3, @1.first_line); }
    | lvalue SUB_ASSIGN expr    { $$ = mk_assign("-=", $1, $3, @1.first_line); }
    | lvalue MUL_ASSIGN expr    { $$ = mk_assign("*=", $1, $3, @1.first_line); }
    | lvalue DIV_ASSIGN expr    { $$ = mk_assign("/=", $1, $3, @1.first_line); }
    | lvalue MOD_ASSIGN expr    { $$ = mk_assign("%=", $1, $3, @1.first_line); }
    | expr OR expr              { $$ = mk_binary("||", $1, $3, @1.first_line); }
    | expr AND expr             { $$ = mk_binary("&&", $1, $3, @1.first_line); }
    | expr EQ expr              { $$ = mk_binary("==", $1, $3, @1.first_line); }
    | expr NE expr              { $$ = mk_binary("!=", $1, $3, @1.first_line); }
    | expr '<' expr             { $$ = mk_binary("<",  $1, $3, @1.first_line); }
    | expr '>' expr             { $$ = mk_binary(">",  $1, $3, @1.first_line); }
    | expr LE expr              { $$ = mk_binary("<=", $1, $3, @1.first_line); }
    | expr GE expr              { $$ = mk_binary(">=", $1, $3, @1.first_line); }
    | expr '+' expr             { $$ = mk_binary("+",  $1, $3, @1.first_line); }
    | expr '-' expr             { $$ = mk_binary("-",  $1, $3, @1.first_line); }
    | expr '*' expr             { $$ = mk_binary("*",  $1, $3, @1.first_line); }
    | expr '/' expr             { $$ = mk_binary("/",  $1, $3, @1.first_line); }
    | expr '%' expr             { $$ = mk_binary("%",  $1, $3, @1.first_line); }
    | '-' expr %prec UMINUS     { $$ = mk_unary("-", $2, @1.first_line); }
    | '!' expr                  { $$ = mk_unary("!", $2, @1.first_line); }
    | INC lvalue                { $$ = mk_incdec(N_PREINCDEC, "++", $2, @1.first_line); }
    | DEC lvalue                { $$ = mk_incdec(N_PREINCDEC, "--", $2, @1.first_line); }
    | lvalue INC                { $$ = mk_incdec(N_POSTINCDEC, "++", $1, @1.first_line); }
    | lvalue DEC                { $$ = mk_incdec(N_POSTINCDEC, "--", $1, @1.first_line); }
    | lvalue
    | IDENT '(' args ')'        { $$ = mk_call($1, $3, @1.first_line); }
    | '(' expr ')'              { $$ = $2; }
    | INT_LIT                   { $$ = mk_lit(N_INTLIT, $1.num, $1.text, @1.first_line); }
    | FLOAT_LIT                 { $$ = mk_lit(N_FLOATLIT, $1.num, $1.text, @1.first_line); }
    | CHAR_LIT                  { $$ = mk_lit(N_CHARLIT, $1.num, $1.text, @1.first_line); }
    | STRING_LIT                { $$ = mk_string($1, @1.first_line); }
    ;

/* Something that can be assigned: a variable or an array element. */
lvalue
    : IDENT                     { $$ = mk_ident($1, @1.first_line); }
    | IDENT '[' expr ']'        { $$ = mk_index($1, $3, @1.first_line); }
    ;

args
    : %empty                    { $$ = list_new(); }
    | arg_list
    ;

arg_list
    : expr                      { $$ = list_add(list_new(), $1); }
    | arg_list ',' expr         { $$ = list_add($1, $3); }
    ;

%%

void yyerror(const char *msg) {
    fprintf(stderr, "%d:%d: %s\n", yylloc.first_line, yylloc.first_column, msg);
}

/* Human-readable token name, used by `cparser --tokens`. */
const char *token_name(int tok) {
    if (tok < 256) {                 /* single-char token: the lexer returns the char itself */
        static char buf[4];
        snprintf(buf, sizeof buf, "'%c'", tok);
        return buf;
    }
    return yysymbol_name(YYTRANSLATE(tok));
}
