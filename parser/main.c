/* cparser: reads C source (file argument or stdin).
 *   cparser [file]           parse and print the AST as JSON
 *   cparser --tokens [file]  print the token stream: line<TAB>token<TAB>text
 * Exit codes: 0 ok, 1 lexical/syntax error, 2 usage or I/O error. */
#include <stdio.h>
#include <string.h>
#include "parser.h"

extern FILE *yyin;
extern char *yytext;
int yylex(void);

int main(int argc, char **argv) {
    int tokens_mode = 0;
    const char *path = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--tokens") == 0) tokens_mode = 1;
        else if (!path) path = argv[i];
        else { fprintf(stderr, "usage: cparser [--tokens] [file]\n"); return 2; }
    }
    if (path && !(yyin = fopen(path, "r"))) { perror(path); return 2; }

    if (tokens_mode) {
        int tok;
        while ((tok = yylex()) != 0)
            printf("%d\t%s\t%s\n", yylloc.first_line, token_name(tok), yytext);
        return 0;
    }
    return yyparse() == 0 ? 0 : 1;
}
