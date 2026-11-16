/* Demo grammar with deliberate LALR conflicts (not used by the project's parser).
 * Run: make conflicts   (bison prints each conflict with a counterexample input)
 * The real grammar (parser/parser.y) has none: see how it fixes each case below. */
%token NUM ID IF ELSE

%%

start: e | s | r ;

/* 1. Shift/reduce: ambiguous expression grammar.
 *    After `e + e` with lookahead `*`: reduce e+e, or shift `*`?
 *    parser.y fixes it with %left '+' '-' and %left '*' '/' '%' (precedence + associativity). */
e
    : e '+' e
    | e '*' e
    | NUM
    ;

/* 2. Shift/reduce: dangling else.
 *    In `if (1) if (1) ; else ;` which `if` gets the `else`?
 *    Bison's default (shift) gives it to the nearest `if`, which is what C wants;
 *    parser.y makes that explicit with %nonassoc LOWER_THAN_ELSE / ELSE and %prec. */
s
    : IF '(' NUM ')' s
    | IF '(' NUM ')' s ELSE s
    | ';'
    ;

/* 3. Reduce/reduce: after ID with lookahead 'x' both a: ID and b: ID can be reduced.
 *    Bison picks the rule written first (a: ID), so `b 'x'` can never be parsed.
 *    Precedence cannot fix this; the grammar itself must change (parser.y has no such rules). */
r
    : a 'x'
    | b 'x'
    ;
a: ID ;
b: ID ;
