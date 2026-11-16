#include <stdio.h>

int steps;   // global: loop iterations of the last gcd() call

// Euclid's algorithm.
int gcd(int a, int b) {
    steps = 0;
    while (b != 0) {
        int t = b;
        b = a % b;
        a = t;
        steps++;
    }
    return a;
}

int lcm(int a, int b) {
    return a / gcd(a, b) * b;
}

int main() {
    int x[4];
    int y[4];
    x[0] = 48;  y[0] = 18;
    x[1] = 17;  y[1] = 5;
    x[2] = 270; y[2] = 192;
    x[3] = 1071; y[3] = 462;
    for (int i = 0; i < 4; i++) {
        int g = gcd(x[i], y[i]);
        printf("gcd(%d, %d) = %d in %d steps, lcm = %d\n", x[i], y[i], g, steps, lcm(x[i], y[i]));
    }
    return 0;
}
