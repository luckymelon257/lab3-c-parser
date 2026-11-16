# Build the C front end (flex + bison) and run the tests.
# Bison 3.x is required: Homebrew's bison when installed, else the one on PATH.
BISON ?= $(shell p=$$(brew --prefix bison 2>/dev/null) && [ -x $$p/bin/bison ] && echo $$p/bin/bison || echo bison)
FLEX  ?= flex
CC    ?= cc
CFLAGS = -Wall -Wextra -std=c11 -Ibuild -Iparser

SRC = build/parser.c build/lexer.c parser/ast.c parser/main.c

.PHONY: all test clean check-bison report conflicts

all: build/cparser

check-bison:
	@$(BISON) --version | grep -q 'GNU Bison) 3' || (echo "error: bison 3.x required (brew install bison)"; exit 1)

build/parser.c build/parser.h: parser/parser.y | check-bison
	@mkdir -p build
	$(BISON) -d -Wprecedence -Werror=conflicts-sr -Werror=conflicts-rr -o build/parser.c parser/parser.y

build/lexer.c: parser/lexer.l build/parser.h
	$(FLEX) -o build/lexer.c parser/lexer.l

build/cparser: $(SRC) $(wildcard parser/*.h)
	$(CC) $(CFLAGS) -o $@ $(SRC)

# LALR(1) automaton of the real grammar: states, items, lookaheads, resolved conflicts.
report: | check-bison
	@mkdir -p build
	$(BISON) -v --report=all -o build/report.c parser/parser.y
	@echo "written build/report.output"

# Demo grammar with deliberate conflicts; bison explains each with a counterexample.
conflicts: | check-bison
	@mkdir -p build
	-$(BISON) -Wcounterexamples -o build/conflicts.c theory/conflicts.y

test: all
	node --test tests/

clean:
	rm -rf build
