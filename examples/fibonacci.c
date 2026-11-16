#include <stdio.h>

// First 20 Fibonacci numbers, stored in an array.
int main() {
    int fib[20];
    fib[0] = 0;
    fib[1] = 1;
    for (int i = 2; i < 20; i++)
        fib[i] = fib[i - 1] + fib[i - 2];

    for (int i = 0; i < 20; i++) {
        printf("%d", fib[i]);
        if (i < 19)
            printf(", ");
    }
    printf("\n");
    return 0;
}
