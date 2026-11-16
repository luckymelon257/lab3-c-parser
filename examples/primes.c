#include <stdio.h>

// Prime numbers below 50: nested loops with break and continue.
int main() {
    int count = 0;
    for (int n = 2; n < 50; n++) {
        int prime = 1;
        for (int d = 2; d * d <= n; d++) {
            if (n % d == 0) {
                prime = 0;
                break;
            }
        }
        if (!prime)
            continue;
        printf("%d ", n);
        count++;
    }
    printf("\ncount = %d\n", count);
    return 0;
}
