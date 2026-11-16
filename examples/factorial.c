#include <stdio.h>

// Recursive factorial.
int factorial(int n) {
    if (n <= 1)
        return 1;
    return n * factorial(n - 1);
}

int main() {
    for (int i = 0; i <= 10; i++)
        printf("%d! = %d\n", i, factorial(i));
    return 0;
}
