/* Lexer for the C subset. Flex turns these regex rules into a DFA (build/lexer.c). */
%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.h"

/* Current position; YY_USER_ACTION stamps it on every token, then moves past yytext. */
static int line = 1, col = 1;
#define YY_USER_ACTION                                            \
    yylloc.first_line = line; yylloc.first_column = col;          \
    for (int i = 0; i < (int)yyleng; i++) {                            \
        if (yytext[i] == '\n') { line++; col = 1; } else col++;   \
    }

/* Translate one escape character after a backslash: n -> newline, etc. */
static char unescape_char(char c) {
    switch (c) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '0': return '\0';
    default:  return c;   /* \\ \' \" map to themselves */
    }
}

/* Copy a quoted literal without its quotes, decoding escapes. */
static char *unescape(const char *s, int len) {
    char *out = malloc(len + 1), *p = out;
    for (int i = 1; i < len - 1; i++)
        *p++ = (s[i] == '\\') ? unescape_char(s[++i]) : s[i];
    *p = '\0';
    return out;
}
%}

%option noyywrap nounput noinput

DIGIT  [0-9]
ID     [A-Za-z_][A-Za-z0-9_]*

%%

^[ \t]*"#".*                    { /* preprocessor line (#include): skipped */ }
"//".*                          { /* line comment */ }
"/*"([^*]|\*+[^*/])*\*+"/"      { /* block comment */ }
[ \t\r\n]+                      { /* whitespace */ }

"int"       return INT;
"double"    return DOUBLE;
"char"      return CHAR;
"void"      return VOID;
"if"        return IF;
"else"      return ELSE;
"while"     return WHILE;
"do"        return DO;
"for"       return FOR;
"break"     return BREAK;
"continue"  return CONTINUE;
"return"    return RETURN;

{ID}        { yylval.str = strdup(yytext); return IDENT; }

{DIGIT}+"."{DIGIT}*([eE][-+]?{DIGIT}+)?|{DIGIT}+[eE][-+]?{DIGIT}+ {
                yylval.lit.num = atof(yytext); yylval.lit.text = strdup(yytext);
                return FLOAT_LIT; }
{DIGIT}+    { yylval.lit.num = atof(yytext); yylval.lit.text = strdup(yytext);
              return INT_LIT; }

'([^'\\\n]|\\.)'  {
                char *s = unescape(yytext, yyleng);
                yylval.lit.num = (unsigned char)s[0]; yylval.lit.text = strdup(yytext);
                free(s);
                return CHAR_LIT; }
\"([^"\\\n]|\\.)*\"  { yylval.str = unescape(yytext, yyleng); return STRING_LIT; }

"<="        return LE;
">="        return GE;
"=="        return EQ;
"!="        return NE;
"&&"        return AND;
"||"        return OR;
"++"        return INC;
"--"        return DEC;
"+="        return ADD_ASSIGN;
"-="        return SUB_ASSIGN;
"*="        return MUL_ASSIGN;
"/="        return DIV_ASSIGN;
"%="        return MOD_ASSIGN;

[-+*/%<>=!;,(){}\[\]]  return yytext[0];

.           {
                fprintf(stderr, "%d:%d: unexpected character '%s'\n",
                        yylloc.first_line, yylloc.first_column, yytext);
                exit(1); }

%%
