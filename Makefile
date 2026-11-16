# Build the C front end (flex + bison) and run the tests.
# Bison 3.x is required: Homebrew's bison when installed, else the one on PATH.
BISON ?= $(shell p=$$(brew --prefix bison 2>/dev/null) && [ -x $$p/bin/bison ] && echo $$p/bin/bison || echo bison)
FLEX  ?= flex
CC    ?= cc
CFLAGS = -Wall -Wextra -std=c11 -Ibuild -Iparser

SRC = build/parser.c build/lexer.c parser/main.c

.PHONY: all test clean check-bison

all: build/cparser

check-bison:
	@$(BISON) --version | grep -q 'GNU Bison) 3' || (echo "error: bison 3.x required (brew install bison)"; exit 1)

build/parser.c build/parser.h: parser/parser.y | check-bison
	@mkdir -p build
	$(BISON) -d -Werror=conflicts-sr -Werror=conflicts-rr -o build/parser.c parser/parser.y

build/lexer.c: parser/lexer.l build/parser.h
	$(FLEX) -o build/lexer.c parser/lexer.l

build/cparser: $(SRC) $(wildcard parser/*.h)
	$(CC) $(CFLAGS) -o $@ $(SRC)

test: all
	node --test tests/

clean:
	rm -rf build
