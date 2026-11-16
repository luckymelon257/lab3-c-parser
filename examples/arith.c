#include <stdio.h>

// Integer arithmetic corner cases, compound assignment, ++/--, logic values, do-while.
int main() {
    printf("%d %d %d %d\n", -7 / 2, -7 % 2, 7 / -2, 7 % -2);

    int x = 10;
    x += 5;
    x -= 3;
    x *= 4;
    x /= 7;
    x %= 5;
    printf("x = %d\n", x);

    int i = 0;
    i++;
    ++i;
    i--;
    printf("i = %d\n", i);

    int a = 5, b = 0;
    printf("%d %d %d %d\n", a && b, a || b, !a, !b);
    int t = (a > 3) + (b < 1) * 2;
    printf("t = %d\n", t);

    // do-while: digits of a number in reverse order
    int n = 12345;
    do {
        printf("%d", n % 10);
        n /= 10;
    } while (n > 0);
    printf("\n");

    double d = 7;
    d /= 2;
    int k = d;
    printf("%.1f %d\n", d, k);
    return 0;
}
