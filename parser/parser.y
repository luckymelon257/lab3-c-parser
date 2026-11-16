/* Grammar of the C subset. Bison turns it into an LALR(1) parser (build/parser.c). */
%{
#include <stdio.h>
int yylex(void);
void yyerror(const char *msg);
%}

%locations
%define parse.error verbose

%union {
    char *str;                                /* IDENT, STRING_LIT (unescaped) */
    struct { double num; char *text; } lit;   /* INT_LIT, FLOAT_LIT, CHAR_LIT */
}

%code provides {
    const char *token_name(int tok);
}

%token INT DOUBLE CHAR VOID IF ELSE WHILE DO FOR BREAK CONTINUE RETURN
%token <str> IDENT STRING_LIT
%token <lit> INT_LIT FLOAT_LIT CHAR_LIT
%token LE GE EQ NE AND OR INC DEC
%token ADD_ASSIGN SUB_ASSIGN MUL_ASSIGN DIV_ASSIGN MOD_ASSIGN

%%

program: %empty ;

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
