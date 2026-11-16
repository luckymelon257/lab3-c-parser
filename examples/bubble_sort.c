#include <stdio.h>

// Sorts the array in place: arrays are passed by reference.
void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                int tmp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = tmp;
            }
        }
    }
}

void print_array(int a[], int n) {
    for (int i = 0; i < n; i++)
        printf("%d ", a[i]);
    printf("\n");
}

int main() {
    int data[8];
    data[0] = 42; data[1] = -7; data[2] = 15; data[3] = 0;
    data[4] = 99; data[5] = 3;  data[6] = -20; data[7] = 8;
    printf("before: ");
    print_array(data, 8);
    bubble_sort(data, 8);
    printf("after:  ");
    print_array(data, 8);
    return 0;
}
