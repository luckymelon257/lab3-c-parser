#include <stdio.h>

// Doubles, int -> double conversion and %f formatting.
double average(int a[], int n) {
    int sum = 0;
    for (int i = 0; i < n; i++)
        sum += a[i];
    double total = sum;   // int -> double, so the division below is not integer division
    return total / n;
}

int main() {
    int scores[6];
    scores[0] = 78; scores[1] = 92; scores[2] = 85;
    scores[3] = 64; scores[4] = 99; scores[5] = 71;

    double avg = average(scores, 6);
    printf("average = %.2f (%f)\n", avg, avg);
    printf("integer average = %d\n", (78 + 92 + 85 + 64 + 99 + 71) / 6);

    for (int f = 0; f <= 100; f += 20) {
        double celsius = (f - 32) * 5.0 / 9;
        printf("%d F = %.1f C\n", f, celsius);
    }
    return 0;
}
