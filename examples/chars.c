#include <stdio.h>

// Characters are small integers: Caesar cipher, ASCII codes and escape sequences.
int main() {
    char word[5];
    word[0] = 'h'; word[1] = 'e'; word[2] = 'l'; word[3] = 'l'; word[4] = 'o';

    printf("plain:\t\"");
    for (int i = 0; i < 5; i++)
        printf("%c", word[i]);
    printf("\"\n");

    int shift = 3;
    printf("cipher:\t\"");
    for (int i = 0; i < 5; i++) {
        char c = 'a' + (word[i] - 'a' + shift) % 26;
        printf("%c", c);
    }
    printf("\"\n");

    for (char c = 'A'; c <= 'E'; c++)
        printf("%c=%d ", c, c);
    printf("\n");

    printf("path: C:\\temp\\file.txt\n");
    printf("progress: %d%%\n", 75);
    return 0;
}
